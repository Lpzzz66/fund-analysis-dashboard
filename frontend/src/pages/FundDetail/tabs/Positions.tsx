import { useCallback, useEffect, useState } from "react";
import { Alert, Card, Table } from "antd";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import * as fundsApi from "@/api/funds";
import * as downloads from "@/api/downloads";
import { isApiError } from "@/api/client";
import type { Position } from "@/api/types";
import { Num, useToast } from "@/components";
import { dec, weight } from "@/utils/format";

export function PositionsTab({ fundId }: { fundId: number }) {
  const [rows, setRows] = useState<Position[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fundsApi.positions(fundId, { page: 1, page_size: 50 });
      setRows(r.data);
      setTotal(r.meta.total);
    } catch (caught) {
      const detail = isApiError(caught) ? caught.detail : "请刷新重试";
      console.error("positions load failed", { fundId, status: isApiError(caught) ? caught.status : undefined, detail });
      setError(`持仓加载失败（${isApiError(caught) ? caught.status : "unknown"}）：${detail}`);
    } finally {
      setLoading(false);
    }
  }, [fundId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function exportPositions() {
    try {
      await downloads.downloadBlob(`/exports/funds/${fundId}/positions`, `fund-${fundId}-positions.csv`);
      toast.success("持仓已导出");
    } catch {
      toast.error("导出失败，请稍后重试");
    }
  }

  const chartRows = rows
    .map((row) => ({
      ...row,
      label: row.security_name ?? row.security_code ?? "未命名持仓",
      value: Number(row.market_value ?? 0),
      weightPct: Number(row.nav_weight ?? 0) * 100,
    }))
    .filter((row) => Number.isFinite(row.value) && row.value > 0)
    .sort((a, b) => b.value - a.value);
  const topRows = chartRows.slice(0, 7);
  const otherValue = chartRows.slice(7).reduce((sum, row) => sum + row.value, 0);
  const pieRows = otherValue > 0 ? [...topRows, { label: "其他持仓", value: otherValue, weightPct: 0, security_code: "other" }] : topRows;
  const chartColors = ["var(--chart)", "var(--primary-dark)", "var(--negative)", "var(--warning)", "var(--positive)", "var(--muted-strong)", "var(--border-strong)", "var(--border)"];

  return (
    <div>
      {error && <Alert type="error" showIcon message={error} />}
      <div className="fd-chart-grid fd-chart-grid--positions">
        <Card className="fd-chart-card" title="持仓市值占比" loading={loading}>
          {pieRows.length ? (
            <div className="fd-chart fd-chart--positions-pie" role="img" aria-label="基金持仓市值占比环形图">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieRows} dataKey="value" nameKey="label" innerRadius="52%" outerRadius="78%" paddingAngle={2} stroke="var(--panel)">
                    {pieRows.map((row, index) => <Cell key={`${row.label}-${index}`} fill={chartColors[index % chartColors.length]} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: "var(--panel-soft)", border: "1px solid var(--border-strong)", borderRadius: 8, color: "var(--text)" }}
                    formatter={(value: unknown) => [typeof value === "number" ? `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })} 元` : "—", "市值"]}
                  />
                  <Legend wrapperStyle={{ color: "var(--muted-strong)", fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : <div className="fd-chart-empty">暂无可用持仓数据</div>}
        </Card>
        <Card className="fd-chart-card" title="前十大持仓" loading={loading}>
          {topRows.length ? (
            <div className="fd-chart fd-chart--holdings" role="img" aria-label="基金前十大持仓市值横向柱状图">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topRows} layout="vertical" margin={{ top: 8, right: 18, left: 0, bottom: 8 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tickFormatter={(value: number) => `${(value / 100000000).toFixed(1)}亿`} tick={{ fill: "var(--muted-strong)", fontSize: 11 }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
                  <YAxis type="category" dataKey="label" width={104} tick={{ fill: "var(--muted-strong)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "var(--panel-soft)", border: "1px solid var(--border-strong)", borderRadius: 8, color: "var(--text)" }}
                    formatter={(value: unknown, _name: unknown, item) => [typeof value === "number" ? `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })} 元` : "—", `净值权重 ${Number(item.payload.weightPct).toFixed(2)}%`]}
                  />
                  <Bar dataKey="value" name="市值" fill="var(--chart)" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <div className="fd-chart-empty">暂无可用持仓数据</div>}
        </Card>
      </div>
      <Card title="当前持仓" extra={<button type="button" className="fd-source-link" onClick={() => void exportPositions()}>导出</button>}>
        <Table
          rowKey={(r) => `${r.security_code ?? ""}-${r.account ?? ""}`}
          size="small"
          loading={loading}
          dataSource={rows}
          pagination={{ pageSize: 50, total, showSizeChanger: false }}
          scroll={{ x: 900 }}
          columns={[
            { title: "证券代码", dataIndex: "security_code" },
            { title: "证券名称", dataIndex: "security_name" },
            { title: "市场", dataIndex: "market" },
            { title: "账户", dataIndex: "account" },
            { title: "数量", dataIndex: "quantity", align: "right", render: (v: string | null) => <Num>{dec(v, 0)}</Num> },
            { title: "市价", dataIndex: "market_price", align: "right", render: (v: string | null) => <Num>{dec(v, 2)}</Num> },
            { title: "市值", dataIndex: "market_value", align: "right", render: (v: string | null) => <Num>{dec(v, 2)}</Num> },
            { title: "净值权重", dataIndex: "nav_weight", align: "right", render: (v: string | null) => <Num>{weight(v)}</Num> },
            { title: "停牌说明", dataIndex: "suspension_info", render: (v: string | null) => v ?? "—" },
          ]}
        />
      </Card>
    </div>
  );
}
