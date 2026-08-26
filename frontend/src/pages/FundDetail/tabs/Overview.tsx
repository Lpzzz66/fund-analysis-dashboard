import { useEffect, useState } from "react";
import { Segmented, Card, Row, Col, Space, Button } from "antd";
import { Area, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer } from "recharts";
import * as api from "@/mock/api";
import { Num, useToast, SourceLink } from "@/components";
import { dec, pct, weight } from "@/utils/format";
import { RANGE_OPTIONS, type RangeKey } from "@/utils/constants";

interface OverviewTabProps {
  fundId: number;
  ov: NonNullable<Awaited<ReturnType<typeof api.fundOverview>>["data"]>;
}

export function OverviewTab({ fundId, ov }: OverviewTabProps) {
  const toast = useToast();
  const [navType, setNavType] = useState<"cumulative" | "unit">("cumulative");
  const [range, setRange] = useState<RangeKey>("3m");
  const [pts, setPts] = useState<api.NavPoint[]>([]);

  useEffect(() => {
    (async () => {
      const res = await api.navSeries(fundId);
      const n = range === "1m" ? 22 : range === "3m" ? 66 : range === "ytd" ? 160 : range === "1y" ? 250 : 999;
      setPts(res.data.points.slice(-n));
    })();
  }, [fundId, range]);

  const chartData = pts.map((p) => ({
    date: p.valuation_date.slice(5),
    unit: Number(p.unit_nav),
    cum: Number(p.cumulative_unit_nav),
  }));

  const dataKey = navType === "cumulative" ? "cum" : "unit";

  // KPI grid
  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Space wrap>
        <Segmented
          value={range}
          onChange={(v) => setRange(v as RangeKey)}
          options={RANGE_OPTIONS.map((r) => ({ value: r.value, label: r.label }))}
        />
        <Segmented
          value={navType}
          onChange={(v) => setNavType(v as "cumulative" | "unit")}
          options={[
            { value: "cumulative", label: "累计净值" },
            { value: "unit", label: "单位净值" },
          ]}
        />
        <span className="fd-caption">当前收益口径：{navType === "cumulative" ? "累计单位净值（复权）" : "单位净值"}</span>
      </Space>

      <Card title={<span className="fd-section-title">净值曲线</span>}>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData} margin={{ left: -10, right: 12, top: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="navFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.18} />
                <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--rule)" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--text-2)" }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11, fill: "var(--text-2)" }} domain={["auto", "auto"]} />
            <RTooltip contentStyle={{ borderRadius: 6, borderColor: "var(--rule)", fontFamily: "var(--mono)", fontSize: 12 }} />
            <Area type="monotone" dataKey={dataKey} stroke="var(--accent)" strokeWidth={2} fill="url(#navFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      <Row gutter={[12, 12]}>
        <Col xs={24} sm={12} md={6}>
          <Card className="fd-kpi">
            <div className="fd-kpi__label">总资产</div>
            <div className="fd-kpi__value">{dec(ov.total_assets, 2)}</div>
            <div className="fd-kpi__sub"><SourceLink hint="资产负债表汇总行" /></div>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="fd-kpi">
            <div className="fd-kpi__label">总负债</div>
            <div className="fd-kpi__value">{dec(ov.total_liabilities, 2)}</div>
            <div className="fd-kpi__sub"><SourceLink /></div>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="fd-kpi">
            <div className="fd-kpi__label">基金资产净值</div>
            <div className="fd-kpi__value">{dec(ov.net_assets, 2)}</div>
            <div className="fd-kpi__sub">单位净值 <Num>{dec(ov.unit_nav, 4)}</Num></div>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="fd-kpi">
            <div className="fd-kpi__label">日收益率</div>
            <div className="fd-kpi__value" style={{ color: Number(ov.daily_return) >= 0 ? "var(--sage)" : "var(--crimson)" }}>{pct(ov.daily_return)}</div>
            <div className="fd-kpi__sub">累计单位净值 <Num>{dec(ov.cumulative_unit_nav, 4)}</Num></div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} sm={12} md={8}>
          <Card className="fd-kpi">
            <div className="fd-kpi__label">最大回撤（区间）</div>
            <div className="fd-kpi__value" style={{ color: "var(--crimson)" }}>{dec(ov.max_drawdown, 4)}</div>
            <div className="fd-kpi__sub">峰值至谷值</div>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card className="fd-kpi">
            <div className="fd-kpi__label">当前回撤</div>
            <div className="fd-kpi__value" style={{ color: "var(--amber)" }}>{dec(ov.current_drawdown, 4)}</div>
            <div className="fd-kpi__sub">当前净值距历史最高</div>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card className="fd-kpi">
            <div className="fd-kpi__label">可用头寸</div>
            <div className="fd-kpi__value">{dec(ov.available_position, 2)}</div>
            <div className="fd-kpi__sub">现金比例 <Num>{weight(ov.cash_ratio)}</Num></div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={12}>
          <Card className="fd-kpi">
            <div className="fd-kpi__label">现金比例</div>
            <div className="fd-kpi__value">{weight(ov.cash_ratio)}</div>
          </Card>
        </Col>
        <Col xs={12}>
          <Card className="fd-kpi">
            <div className="fd-kpi__label">杠杆率</div>
            <div className="fd-kpi__value">{dec(ov.leverage_ratio, 2)}</div>
          </Card>
        </Col>
      </Row>

      <Button onClick={() => toast.info("导出当前页数据和口径说明（演示）")}>导出概览</Button>
    </Space>
  );
}
