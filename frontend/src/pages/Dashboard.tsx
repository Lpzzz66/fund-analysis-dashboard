import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Col, Row, Space, Table } from "antd";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Link, useNavigate } from "react-router-dom";
import * as dashboardApi from "@/api/dashboard";
import * as downloads from "@/api/downloads";
import { PageHeader, StatusRibbon, Num, QualityBadge, useToast } from "@/components";
import { compactMoney, dec, dateStr, pct, returnColor } from "@/utils/format";
import type { DashboardOverview } from "@/api/types";

const tooltipStyle = {
  backgroundColor: "var(--panel-soft)",
  border: "1px solid var(--border-strong)",
  borderRadius: 8,
  color: "var(--text)",
};

const shorten = (value: string, length = 9) =>
  value.length > length ? `${value.slice(0, length)}...` : value;

export default function Dashboard() {
  const navigate = useNavigate();
  const toast = useToast();
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [coverage, setCoverage] = useState({ available: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await dashboardApi.getOverview();
      setOverview(result.data);
      setCoverage(result.meta.coverage);
    } catch {
      setError("总览数据加载失败，请刷新重试");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function exportOverview() {
    try {
      await downloads.downloadBlob("/exports/overview", "company-overview.csv");
      toast.success("总览已导出");
    } catch {
      toast.error("导出失败，请稍后重试");
    }
  }

  const chartFunds = useMemo(
    () =>
      (overview?.funds ?? []).map((fund) => ({
        ...fund,
        shortName: shorten(fund.name),
        totalAssetsBn: Number(fund.total_assets ?? 0) / 100_000_000,
        netAssetValueBn: Number(fund.net_asset_value ?? 0) / 100_000_000,
        dailyReturnPct: Number(fund.daily_return ?? 0) * 100,
      })),
    [overview?.funds],
  );

  return (
    <div className="fd-page">
      <PageHeader
        title="公司总览"
        desc="查看已发布估值数据的规模、收益、风险和覆盖情况"
        extra={
          <Space>
            <Button onClick={() => void load()} loading={loading}>刷新</Button>
            <Button onClick={() => void exportOverview()}>导出总览</Button>
            <Button onClick={() => navigate("/risk")}>风险事件</Button>
          </Space>
        }
      />
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} />}
      <StatusRibbon
        asOf={overview?.as_of ?? null}
        version={null}
        coverage={coverage}
        quality={overview?.quality_status ?? "pending"}
      />
      <Row gutter={[12, 12]} style={{ marginTop: 16 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card className="fd-kpi">
            <div className="fd-kpi__label">总净资产</div>
            <div className="fd-kpi__value">{compactMoney(overview?.total_net_assets)}</div>
            <div className="fd-kpi__sub">{overview?.fund_count ?? 0} 只产品</div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="fd-kpi">
            <div className="fd-kpi__label">公司日收益</div>
            <div className="fd-kpi__value" style={{ color: returnColor(overview?.company_daily_return) }}>
              {pct(overview?.company_daily_return)}
            </div>
            <div className="fd-kpi__sub">后端已计算结果</div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="fd-kpi">
            <div className="fd-kpi__label">待处理风险事件</div>
            <div className="fd-kpi__value">{overview?.risk_event_count ?? "—"}</div>
            <div className="fd-kpi__sub">来自风险事件记录</div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="fd-kpi">
            <div className="fd-kpi__label">数据覆盖率</div>
            <div className="fd-kpi__value">
              {coverage.total ? `${Math.round((coverage.available / coverage.total) * 100)}%` : "—"}
            </div>
            <div className="fd-kpi__sub">已发布产品 / 活跃产品</div>
          </Card>
        </Col>
      </Row>

      <div className="fd-chart-grid">
        <Card className="fd-chart-card" title={<span className="fd-section-title">基金资产规模</span>} loading={loading}>
          <div className="fd-chart fd-chart--assets" role="img" aria-label="各基金资产规模和资产净值柱状图">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartFunds} margin={{ top: 8, right: 12, left: 0, bottom: 42 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="shortName"
                  interval={0}
                  angle={-32}
                  textAnchor="end"
                  height={54}
                  tick={{ fill: "var(--muted-strong)", fontSize: 11 }}
                  axisLine={{ stroke: "var(--border)" }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(value: number) => `${value.toFixed(0)}亿`}
                  tick={{ fill: "var(--muted-strong)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={42}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ fill: "rgba(185, 133, 69, 0.08)" }}
                  labelFormatter={(_, payload) => payload[0]?.payload?.name ?? "基金"}
                  formatter={(value: unknown, name: unknown) => [
                    `${typeof value === "number" ? value.toFixed(2) : "0.00"} 亿`,
                    name === "totalAssetsBn" ? "资产规模" : "资产净值",
                  ]}
                />
                <Bar dataKey="totalAssetsBn" name="资产规模" fill="var(--chart)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="netAssetValueBn" name="资产净值" fill="var(--primary-dark)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="fd-chart-card" title={<span className="fd-section-title">基金日收益分布</span>} loading={loading}>
          <div className="fd-chart fd-chart--returns" role="img" aria-label="各基金日收益横向柱状图">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartFunds}
                layout="vertical"
                margin={{ top: 8, right: 18, left: 6, bottom: 8 }}
              >
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(value: number) => `${value.toFixed(1)}%`}
                  tick={{ fill: "var(--muted-strong)", fontSize: 11 }}
                  axisLine={{ stroke: "var(--border)" }}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="shortName"
                  width={78}
                  tick={{ fill: "var(--muted-strong)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ fill: "rgba(185, 133, 69, 0.08)" }}
                  labelFormatter={(_, payload) => payload[0]?.payload?.name ?? "基金"}
                  formatter={(value: unknown) => [`${typeof value === "number" ? value.toFixed(2) : "0.00"}%`, "日收益"]}
                />
                <Bar dataKey="dailyReturnPct" name="日收益" radius={[0, 3, 3, 0]}>
                  {chartFunds.map((fund) => (
                    <Cell
                      key={fund.id}
                      fill={fund.dailyReturnPct > 0 ? "var(--negative)" : fund.dailyReturnPct < 0 ? "var(--positive)" : "var(--muted)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card style={{ marginTop: 12 }} title={<span className="fd-section-title">产品运行概览</span>}>
        <Table
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={overview?.funds ?? []}
          pagination={false}
          scroll={{ x: 960 }}
          columns={[
            { title: "产品名称", dataIndex: "name", render: (value: string, row: DashboardOverview["funds"][number]) => <Link to={`/funds/${row.id}`}>{value}</Link> },
            { title: "估值日", dataIndex: "valuation_date", render: dateStr },
            { title: "资产净值", dataIndex: "net_asset_value", align: "right", render: (v: string | null) => <Num>{compactMoney(v)}</Num> },
            { title: "单位净值", dataIndex: "unit_nav", align: "right", render: (v: string | null) => <Num>{dec(v, 4)}</Num> },
            { title: "日收益", dataIndex: "daily_return", align: "right", render: (v: string | null) => <Num style={{ color: returnColor(v) }}>{pct(v)}</Num> },
            { title: "分析状态", dataIndex: "analysis_status" },
            { title: "质量", render: () => <QualityBadge status={overview?.quality_status ?? "pending"} /> },
          ]}
        />
      </Card>
    </div>
  );
}
