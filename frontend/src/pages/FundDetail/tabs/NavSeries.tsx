import { useCallback, useEffect, useState } from "react";
import { Alert, Card, Table } from "antd";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import * as fundsApi from "@/api/funds";
import * as downloads from "@/api/downloads";
import { isApiError } from "@/api/client";
import type { NavPoint } from "@/api/types";
import { Num, useToast } from "@/components";
import { dateStr, pct, dec, returnColor } from "@/utils/format";

export default function NavSeries({ fundId }: { fundId: number }) {
  const [points, setPoints] = useState<NavPoint[]>([]);
  const [totalReturn, setTotalReturn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fundsApi.navSeries(fundId);
      setPoints(r.data.points);
      setTotalReturn(r.data.total_return);
    } catch (caught) {
      const detail = isApiError(caught) ? caught.detail : "请刷新重试";
      console.error("nav-series load failed", { fundId, status: isApiError(caught) ? caught.status : undefined, detail });
      setError(`净值序列加载失败（${isApiError(caught) ? caught.status : "unknown"}）：${detail}`);
    } finally {
      setLoading(false);
    }
  }, [fundId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <Alert type="error" showIcon message={error} />;

  async function exportSeries() {
    try {
      await downloads.downloadBlob(`/exports/funds/${fundId}/nav-series`, `fund-${fundId}-nav-series.csv`);
      toast.success("净值序列已导出");
    } catch {
      toast.error("导出失败，请稍后重试");
    }
  }

  const chartPoints = points.map((point) => ({
    ...point,
    label: dateStr(point.valuation_date).slice(5),
    unitNav: point.unit_nav === null ? null : Number(point.unit_nav),
    adjustedNav: point.adjusted_nav === null ? null : Number(point.adjusted_nav),
  }));

  return (
    <div>
      <Card
        className="fd-chart-card"
        title="净值走势"
        loading={loading}
        extra={
          <span>
            区间累计收益：
            <Num style={{ color: returnColor(totalReturn) }}>{pct(totalReturn)}</Num>
          </span>
        }
      >
        <div className="fd-chart fd-chart--nav" role="img" aria-label="基金单位净值和复权净值走势折线图">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartPoints} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                minTickGap={28}
                tick={{ fill: "var(--muted-strong)", fontSize: 11 }}
                axisLine={{ stroke: "var(--border)" }}
                tickLine={false}
              />
              <YAxis
                domain={["auto", "auto"]}
                tickFormatter={(value: number) => value.toFixed(2)}
                tick={{ fill: "var(--muted-strong)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={44}
              />
              <Tooltip
                contentStyle={{ backgroundColor: "var(--panel-soft)", border: "1px solid var(--border-strong)", borderRadius: 8, color: "var(--text)" }}
                labelFormatter={(label) => String(label)}
                formatter={(value: unknown, name: unknown) => [
                  typeof value === "number" ? value.toFixed(4) : "—",
                  name === "unitNav" ? "单位净值" : "复权净值",
                ]}
              />
              <Legend wrapperStyle={{ color: "var(--muted-strong)", fontSize: 12 }} />
              <Line type="monotone" dataKey="unitNav" name="单位净值" stroke="var(--chart)" strokeWidth={2} dot={false} connectNulls />
              <Line type="monotone" dataKey="adjustedNav" name="复权净值" stroke="var(--primary-dark)" strokeWidth={2} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card
        style={{ marginTop: 12 }}
        title="净值明细"
        extra={<button type="button" className="fd-source-link" onClick={() => void exportSeries()}>导出</button>}
      >
        <Table
          rowKey="valuation_date"
          size="small"
          dataSource={points}
          pagination={{ pageSize: 20, showSizeChanger: false }}
          scroll={{ x: 760 }}
          columns={[
            { title: "估值日", dataIndex: "valuation_date", render: dateStr },
            { title: "单位净值", dataIndex: "unit_nav", align: "right", render: (v: string | null) => <Num>{dec(v, 4)}</Num> },
            { title: "累计单位净值", dataIndex: "cumulative_unit_nav", align: "right", render: (v: string | null) => <Num>{dec(v, 4)}</Num> },
            { title: "日收益", dataIndex: "daily_return", align: "right", render: (v: string | null) => <Num style={{ color: returnColor(v) }}>{pct(v)}</Num> },
            { title: "累计收益", dataIndex: "cumulative_return", align: "right", render: (v: string | null) => <Num style={{ color: returnColor(v) }}>{pct(v)}</Num> },
          ]}
        />
      </Card>
    </div>
  );
}
