import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Col, Row, Space, Table } from "antd";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
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
import type { DashboardOverview, DashboardSeries, DashboardSeriesPoint } from "@/api/types";

type SeriesPeriod = "1m" | "3m" | "ytd" | "1y" | "all";

const periodOptions: Array<{ key: SeriesPeriod; label: string }> = [
  { key: "1m", label: "近1月" },
  { key: "3m", label: "近3月" },
  { key: "ytd", label: "今年" },
  { key: "1y", label: "近1年" },
  { key: "all", label: "全部" },
];

const tooltipStyle = {
  backgroundColor: "var(--panel-soft)",
  border: "1px solid var(--border-strong)",
  borderRadius: 8,
  color: "var(--text)",
};

function cutoffForPeriod(points: DashboardSeriesPoint[], period: SeriesPeriod): string | null {
  const latest = points[points.length - 1]?.valuation_date;
  if (!latest || period === "all") return null;
  const date = new Date(`${latest}T00:00:00`);
  if (period === "ytd") {
    return `${date.getFullYear()}-01-01`;
  }
  const originalDay = date.getDate();
  date.setDate(1);
  if (period === "1m") date.setMonth(date.getMonth() - 1);
  if (period === "3m") date.setMonth(date.getMonth() - 3);
  if (period === "1y") date.setFullYear(date.getFullYear() - 1);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(originalDay, lastDay));
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((value, index) => index === 0 ? String(value) : String(value).padStart(2, "0"))
    .join("-");
}

export default function Dashboard() {
  const navigate = useNavigate();
  const toast = useToast();
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [series, setSeries] = useState<DashboardSeries | null>(null);
  const [coverage, setCoverage] = useState({ available: 0, total: 0 });
  const [period, setPeriod] = useState<SeriesPeriod>("1m");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [overviewResult, seriesResult] = await Promise.all([
        dashboardApi.getOverview(),
        dashboardApi.getSeries(),
      ]);
      setOverview(overviewResult.data);
      setCoverage(overviewResult.meta.coverage);
      setSeries(seriesResult.data);
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

  const allSeriesPoints = series?.points ?? [];
  const visibleSeriesPoints = useMemo(() => {
    const cutoff = cutoffForPeriod(allSeriesPoints, period);
    return cutoff ? allSeriesPoints.filter((point) => point.valuation_date >= cutoff) : allSeriesPoints;
  }, [allSeriesPoints, period]);
  const navChartData = useMemo(
    () => visibleSeriesPoints.map((point) => ({
      ...point,
      index: point.company_index === null ? null : Number(point.company_index),
      label: point.valuation_date.slice(5),
    })),
    [visibleSeriesPoints],
  );
  const drawdownChartData = useMemo(
    () => visibleSeriesPoints.map((point) => ({
      ...point,
      drawdownPct: point.drawdown === null ? null : Number(point.drawdown) * 100,
      label: point.valuation_date.slice(5),
    })),
    [visibleSeriesPoints],
  );
  const drawdownStats = useMemo(() => {
    const values = allSeriesPoints
      .map((point) => (point.drawdown === null ? null : Number(point.drawdown)))
      .filter((value): value is number => value !== null && Number.isFinite(value));
    const current = allSeriesPoints[allSeriesPoints.length - 1]?.drawdown ?? null;
    return { max: values.length ? String(Math.min(...values)) : null, current };
  }, [allSeriesPoints]);

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

      <div className="fd-chart-grid fd-chart-grid--dashboard">
        <Card
          className="fd-chart-card"
          title={<span className="fd-section-title">净值走势</span>}
          loading={loading}
          extra={
            <div className="fd-period-tabs" aria-label="净值走势时间范围">
              {periodOptions.map((option) => (
                <Button
                  key={option.key}
                  size="small"
                  type={period === option.key ? "primary" : "default"}
                  onClick={() => setPeriod(option.key)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          }
        >
          {navChartData.length === 0 ? <div className="fd-chart-empty">暂无可用公司净值历史</div> : (
            <div className="fd-chart fd-chart--company-nav" role="img" aria-label="由基金每日净值加权生成的组合净值走势折线图">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={navChartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" minTickGap={28} tick={{ fill: "var(--muted-strong)", fontSize: 11 }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
                  <YAxis domain={["auto", "auto"]} tickFormatter={(value: number) => value.toFixed(2)} tick={{ fill: "var(--muted-strong)", fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={(_, payload) => payload[0]?.payload?.valuation_date ?? "估值日"}
                    formatter={(value: unknown) => [typeof value === "number" ? value.toFixed(4) : "—", "组合净值"]}
                  />
                  <Line type="monotone" dataKey="index" name="组合净值" stroke="var(--chart)" strokeWidth={2} dot={navChartData.length === 1 ? { r: 3 } : false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="fd-chart-note">组合净值由各基金每日净资产按前一估值日权重计算，不含外部基准。</div>
        </Card>

        <Card className="fd-chart-card" title={<span className="fd-section-title">回撤分析</span>} loading={loading}>
          <div className="fd-chart-stats">
            <div><span>最大回撤</span><strong style={{ color: returnColor(drawdownStats.max) }}>{pct(drawdownStats.max)}</strong></div>
            <div><span>当前回撤</span><strong style={{ color: returnColor(drawdownStats.current) }}>{pct(drawdownStats.current)}</strong></div>
          </div>
          {drawdownChartData.length === 0 ? <div className="fd-chart-empty">暂无可用回撤历史</div> : (
            <div className="fd-chart fd-chart--drawdown" role="img" aria-label="组合净值回撤分析折线图">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={drawdownChartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" minTickGap={28} tick={{ fill: "var(--muted-strong)", fontSize: 11 }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
                  <YAxis domain={["auto", 0]} tickFormatter={(value: number) => `${value.toFixed(1)}%`} tick={{ fill: "var(--muted-strong)", fontSize: 11 }} axisLine={false} tickLine={false} width={46} />
                  <ReferenceLine y={0} stroke="var(--border-strong)" />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={(_, payload) => payload[0]?.payload?.valuation_date ?? "估值日"}
                    formatter={(value: unknown) => [typeof value === "number" ? `${value.toFixed(2)}%` : "—", "回撤"]}
                  />
                  <Line type="monotone" dataKey="drawdownPct" name="回撤" stroke="var(--positive)" strokeWidth={2} dot={drawdownChartData.length === 1 ? { r: 3 } : false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
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
