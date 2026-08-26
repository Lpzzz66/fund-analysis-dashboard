import { useEffect, useMemo, useState } from "react";
import { Button, DatePicker, Segmented, Space, Table, Card, Row, Col, Tag, Tooltip } from "antd";
import dayjs from "dayjs";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import * as api from "@/mock/api";
import { Num, QualityBadge, SourceLink, StatusRibbon, PageHeader, useToast, RoleGuard } from "@/components";
import { dec, pct, pctPlain, dateStr, exportCsv } from "@/utils/format";
import { useNavigate } from "react-router-dom";
import type { QualityStatus } from "@/utils/constants";
import { RANGE_OPTIONS, type RangeKey } from "@/utils/constants";

export default function Dashboard() {
  const navigate = useNavigate();
  const toast = useToast();
  const [mode, setMode] = useState<"latest" | "same_day">("latest");
  const [asOf, setAsOf] = useState<string | null>(null);
  const [range, setRange] = useState<RangeKey>("3m");
  const [ov, setOv] = useState<api.DashboardOverview | null>(null);
  const [cov, setCov] = useState<{ available: number; total: number }>({ available: 0, total: 0 });
  const [indexPts, setIndexPts] = useState<{ date: string; index_value: string; daily_return: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await api.dashboardOverview(asOf ?? undefined);
    setOv(res.data);
    setCov(res.meta.coverage);
    const ci = await api.companyIndexSeries();
    setIndexPts(ci.data.points);
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asOf]);

  const chartData = useMemo(() => {
    const n = range === "1m" ? 22 : range === "3m" ? 66 : range === "ytd" ? 160 : range === "1y" ? 250 : indexPts.length;
    return indexPts.slice(-n).map((p) => ({
      date: p.date.slice(5),
      index: Number(p.index_value),
      daily: p.daily_return ? Number(p.daily_return) * 100 : null,
    }));
  }, [indexPts, range]);

  const riskProducts = useMemo(
    () => (ov?.funds ?? []).filter((f) => Number(f.daily_return) < -0.02).map((f) => ({ ...f, rule: "日收益下跌" })),
    [ov],
  );

  return (
    <div className="fd-page">
      <PageHeader
        title="公司总览"
        desc="让管理层在 30 秒内了解规模、收益、风险和数据是否完整"
        extra={
          <Space wrap>
            <Segmented
              value={mode}
              onChange={(v) => setMode(v as "latest" | "same_day")}
              options={[
                { value: "latest", label: "最新状态" },
                { value: "same_day", label: "同日汇总" },
              ]}
            />
            <DatePicker
              allowClear
              placeholder="选择日期"
              value={asOf ? dayjs(asOf) : null}
              onChange={(d) => setAsOf(d ? d.format("YYYY-MM-DD") : null)}
              disabled={mode === "latest"}
            />
            <Button onClick={load} loading={loading}>刷新</Button>
            <Button onClick={() => {
              exportCsv((ov?.funds ?? []).map((f) => ({ 产品: f.name, 估值日: f.valuation_date, 单位净值: f.unit_nav, 日收益: f.daily_return })), "公司总览.csv", ov?.as_of ?? undefined);
              toast.success("已导出总览");
            }}>导出总览</Button>
            <Button onClick={() => navigate("/risk")}>查看异常</Button>
          </Space>
        }
      />

      <StatusRibbon
        asOf={ov?.as_of ?? null}
        version={ov ? `v1 @ ${dateStr(ov.as_of)}` : null}
        coverage={cov}
        quality={(ov?.quality_status ?? "pending") as QualityStatus}
      />

      {/* Core KPI cards */}
      <Row gutter={[12, 12]} style={{ marginTop: 16 }}>
        <Col xs={24} sm={12} lg={Math.floor(24 / 5)}>
          <Card className="fd-kpi fd-kpi--clickable" onClick={() => navigate("/funds")}>
            <div className="fd-kpi__label">总净资产</div>
            <div className="fd-kpi__value">{ov ? dec(ov.total_net_assets, 2) : "—"}</div>
            <div className="fd-kpi__sub">{ov?.fund_count ?? 0} 只产品 · <SourceLink hint="进入产品规模列表" /></div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={Math.floor(24 / 5)}>
          <Card className="fd-kpi fd-kpi--clickable" onClick={() => navigate("/dashboard")}>
            <div className="fd-kpi__label">公司综合收益</div>
            <div className="fd-kpi__value" style={{ color: Number(ov?.company_daily_return) >= 0 ? "var(--sage)" : "var(--crimson)" }}>
              {ov ? pct(ov.company_daily_return) : "—"}
            </div>
            <div className="fd-kpi__sub">{ov?.fund_count ?? 0} 只有效产品</div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={Math.floor(24 / 5)}>
          <Card className="fd-kpi fd-kpi--clickable" onClick={() => navigate("/risk")}>
            <div className="fd-kpi__label">最大回撤</div>
            <div className="fd-kpi__value" style={{ color: "var(--crimson)" }}>{ov ? "-2.34%" : "—"}</div>
            <div className="fd-kpi__sub">成立以来 · <SourceLink hint="进入风险概览" /></div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={Math.floor(24 / 5)}>
          <Card className="fd-kpi fd-kpi--clickable" onClick={() => navigate("/risk")}>
            <div className="fd-kpi__label">风险事件数</div>
            <div className="fd-kpi__value">{ov?.risk_event_count ?? 0}</div>
            <div className="fd-kpi__sub">待处理 · <SourceLink hint="进入风险事件列表" /></div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={Math.floor(24 / 5)}>
          <Card className="fd-kpi fd-kpi--clickable" onClick={() => navigate("/imports")}>
            <div className="fd-kpi__label">数据更新率</div>
            <div className="fd-kpi__value">{cov.total ? `${Math.round((cov.available / cov.total) * 100)}%` : "—"}</div>
            <div className="fd-kpi__sub">{cov.available}/{cov.total} 已发布 · <SourceLink hint="进入导入中心缺报筛选" /></div>
          </Card>
        </Col>
      </Row>

      {/* Company composite index */}
      <Card style={{ marginTop: 12 }} title={<span className="fd-section-title">公司综合净值指数</span>}
        extra={
          <Segmented size="small" value={range} onChange={(v) => setRange(v as RangeKey)} options={RANGE_OPTIONS.map((r) => ({ value: r.value, label: r.label }))} />
        }
      >
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ left: -10, right: 12, top: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--rule)" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--text-2)" }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11, fill: "var(--text-2)" }} domain={["auto", "auto"]} />
            <RTooltip
              contentStyle={{ borderRadius: 6, borderColor: "var(--rule)", fontFamily: "var(--mono)", fontSize: 12 }}
              formatter={(v: number) => [v.toFixed(4), "指数"]}
            />
            <ReferenceLine y={1} stroke="var(--rule-strong)" strokeDasharray="4 4" label={{ value: "基准 1.0000", position: "insideTopLeft", fontSize: 10, fill: "var(--text-2)" }} />
            <Line type="monotone" dataKey="index" stroke="var(--accent)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
        <div className="fd-caption" style={{ marginTop: 8 }}>
          公司综合收益指数从 1.0000 开始，用前一交易日各产品净资产作为权重链接日收益。缺少前一日或当日数据的产品不进入该日计算。
        </div>
      </Card>

      {/* Product overview table */}
      <Card style={{ marginTop: 12 }} title={<span className="fd-section-title">产品运行概览</span>} extra={<SourceLink label="导出当前列表" hint="导出当前筛选产品" />}>
        <Table
          className="fd-table"
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={ov?.funds ?? []}
          pagination={{ pageSize: 8, showSizeChanger: false, size: "small" }}
          columns={[
            { title: "产品名称", dataIndex: "name", render: (v, r: api.OverviewFund) => <a onClick={() => navigate(`/funds/${r.id}`)}>{v}</a> },
            { title: "估值日", dataIndex: "valuation_date", render: dateStr, width: 110 },
            { title: "单位净值", dataIndex: "unit_nav", align: "right", render: (v) => <Num>{dec(v, 4)}</Num>, width: 110 },
            { title: "日收益率", dataIndex: "daily_return", align: "right", render: (v) => <Num style={{ color: Number(v) >= 0 ? "var(--sage)" : "var(--crimson)" }}>{pct(v)}</Num>, width: 110 },
            {
              title: "数据质量", dataIndex: "quality", align: "center", width: 110,
              render: (_, r) => <a onClick={() => navigate(`/funds/${r.id}?tab=quality`)}><QualityBadge status={(r as unknown as { quality?: QualityStatus }).quality ?? "valid"} /></a>,
            },
            {
              title: "来源", width: 70, align: "center",
              render: (_, r) => <Tooltip title={`定位到 ${r.name} / ${r.valuation_date} / v1 / 原始文件`}><SourceLink /></Tooltip>,
            },
          ]}
        />
      </Card>

      {/* Risk products table */}
      <Card style={{ marginTop: 12 }} title={<span className="fd-section-title">风险产品</span>}
        extra={<Button size="small" onClick={() => navigate("/risk")}>进入风险概览</Button>}>
        <Table
          className="fd-table"
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={riskProducts}
          columns={[
            { title: "产品名称", dataIndex: "name", render: (v, r) => <a onClick={() => navigate(`/funds/${r.id}`)}>{v}</a> },
            { title: "估值日", dataIndex: "valuation_date", render: dateStr, width: 110 },
            { title: "日收益", dataIndex: "daily_return", align: "right", render: (v) => <Num style={{ color: "var(--crimson)" }}>{pctPlain(v)}</Num>, width: 110 },
            { title: "风险规则", dataIndex: "rule", width: 120, render: (v) => <Tag color="warning">{v}</Tag> },
            {
              title: "操作", width: 90, align: "center",
              render: (_, r) => (
                <RoleGuard cap="publish">
                  <Button size="small" onClick={() => navigate(`/risk?fund=${r.id}`)}>处理</Button>
                </RoleGuard>
              ),
            },
          ]}
          locale={{ emptyText: <span className="fd-caption">当前无风险产品</span> }}
        />
      </Card>
    </div>
  );
}
