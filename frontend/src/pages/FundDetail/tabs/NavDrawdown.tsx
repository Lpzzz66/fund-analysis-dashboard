import { useEffect, useState } from "react";
import { Segmented, Card, Space, DatePicker, Button, Switch, Row, Col } from "antd";
import dayjs from "dayjs";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, ReferenceDot } from "recharts";
import * as api from "@/mock/api";
import type * as db from "@/mock/db";
import { useToast, SourceLink } from "@/components";
import { dec, pct, dateStr, exportCsv } from "@/utils/format";
import { RANGE_OPTIONS, type RangeKey } from "@/utils/constants";

const { RangePicker } = DatePicker;

export function NavDrawdownTab({ fundId }: { fundId: number }) {
  const toast = useToast();
  const [range, setRange] = useState<RangeKey>("3m");
  const [custom, setCustom] = useState<[string, string] | null>(null);
  const [showPeak, setShowPeak] = useState(true);
  const [nav, setNav] = useState<api.NavPoint[]>([]);
  const [dd, setDd] = useState<{ points: db.DrawdownPoint[]; max_drawdown: string; peak_date: string; trough_date: string; current_drawdown: string } | null>(null);

  useEffect(() => {
    (async () => {
      const start = custom?.[0];
      const end = custom?.[1];
      const n = range === "1m" ? 22 : range === "3m" ? 66 : range === "ytd" ? 160 : range === "1y" ? 250 : 999;
      const navRes = await api.navSeries(fundId, start, end);
      const ddRes = await api.drawdownSeries(fundId, start, end);
      setNav(start ? navRes.data.points : navRes.data.points.slice(-n));
      setDd(ddRes.data);
    })();
  }, [fundId, range, custom]);

  const navData = nav.map((p) => ({ date: p.valuation_date.slice(5), full: p.valuation_date, unit: Number(p.unit_nav), cum: Number(p.cumulative_unit_nav), daily: Number(p.daily_return) * 100 }));
  const ddData = (dd?.points ?? []).map((p) => ({ date: p.date.slice(5), full: p.date, drawdown: Number(p.drawdown) * 100 }));

  // peak/trough for reference dots
  const peakIdx = ddData.findIndex((d) => d.full === dd?.peak_date);
  const troughIdx = ddData.findIndex((d) => d.full === dd?.trough_date);

  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Space wrap>
        <Segmented value={range} onChange={(v) => { setRange(v as RangeKey); setCustom(null); }} options={RANGE_OPTIONS.map((r) => ({ value: r.value, label: r.label }))} />
        <RangePicker
          value={custom ? [dayjs(custom[0]), dayjs(custom[1])] : null}
          onChange={(_v, ds) => { if (ds[0] && ds[1]) setCustom([ds[0] as string, ds[1] as string]); else setCustom(null); }}
          disabledDate={(d) => d.isAfter(dayjs("2026-08-22")) || d.isBefore(dayjs("2024-01-01"))}
        />
        <Space>
          <Switch checked={showPeak} onChange={setShowPeak} size="small" />
          <span className="fd-caption">显示峰谷</span>
        </Space>
        <Button onClick={() => { exportCsv(nav.map((p) => ({ 日期: p.valuation_date, 单位净值: p.unit_nav, 累计单位净值: p.cumulative_unit_nav, 日收益: p.daily_return })), `净值序列_${fundId}.csv`); toast.success("已导出序列"); }}>导出序列</Button>
      </Space>

      <Row gutter={[12, 12]}>
        <Col xs={24} sm={8}><Card className="fd-kpi"><div className="fd-kpi__label">最大回撤</div><div className="fd-kpi__value" style={{ color: "var(--crimson)" }}>{dd ? dec(dd.max_drawdown, 4) : "—"}</div><div className="fd-kpi__sub">峰值 {dateStr(dd?.peak_date)} → 谷值 {dateStr(dd?.trough_date)}</div></Card></Col>
        <Col xs={24} sm={8}><Card className="fd-kpi"><div className="fd-kpi__label">当前回撤</div><div className="fd-kpi__value" style={{ color: "var(--amber)" }}>{dd ? dec(dd.current_drawdown, 4) : "—"}</div><div className="fd-kpi__sub">距历史最高净值</div></Card></Col>
        <Col xs={24} sm={8}><Card className="fd-kpi"><div className="fd-kpi__label">区间累计收益</div><div className="fd-kpi__value" style={{ color: "var(--sage)" }}>{nav.length ? pct(nav[nav.length - 1].cumulative_return) : "—"}</div><div className="fd-kpi__sub">{nav.length} 个交易日</div></Card></Col>
      </Row>

      <Card title={<span className="fd-section-title">净值曲线</span>}>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={navData} margin={{ left: -10, right: 12, top: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--rule)" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--text-2)" }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11, fill: "var(--text-2)" }} domain={["auto", "auto"]} />
            <RTooltip contentStyle={{ borderRadius: 6, borderColor: "var(--rule)", fontFamily: "var(--mono)", fontSize: 12 }} />
            <Line type="monotone" dataKey="cum" name="累计净值" stroke="var(--accent)" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="unit" name="单位净值" stroke="var(--ink-3)" strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Card title={<span className="fd-section-title">回撤曲线</span>} extra={<SourceLink hint="回撤基于累计净值序列计算" />}>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={ddData} margin={{ left: -10, right: 12, top: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--rule)" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--text-2)" }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11, fill: "var(--text-2)" }} />
            <RTooltip contentStyle={{ borderRadius: 6, borderColor: "var(--rule)", fontFamily: "var(--mono)", fontSize: 12 }} formatter={(v: number) => [`${v.toFixed(2)}%`, "回撤"]} />
            <Line type="monotone" dataKey="drawdown" stroke="var(--crimson)" strokeWidth={2} dot={false} />
            {showPeak && peakIdx >= 0 && <ReferenceDot x={ddData[peakIdx].date} y={ddData[peakIdx].drawdown} r={5} fill="var(--amber)" stroke="#fff" />}
            {showPeak && troughIdx >= 0 && <ReferenceDot x={ddData[troughIdx].date} y={ddData[troughIdx].drawdown} r={5} fill="var(--crimson)" stroke="#fff" />}
          </LineChart>
        </ResponsiveContainer>
        {showPeak && dd && (
          <div className="fd-caption" style={{ marginTop: 8 }}>
            <span style={{ color: "var(--amber)" }}>●</span> 峰值 {dateStr(dd.peak_date)} &nbsp;
            <span style={{ color: "var(--crimson)" }}>●</span> 谷值 {dateStr(dd.trough_date)}
          </div>
        )}
      </Card>
    </Space>
  );
}
