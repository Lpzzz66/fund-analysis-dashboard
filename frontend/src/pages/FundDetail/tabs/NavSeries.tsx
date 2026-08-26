import { useEffect, useState } from "react";
import { Alert, Card, Table } from "antd";
import * as fundsApi from "@/api/funds";
import type { NavPoint } from "@/api/types";
import { Num } from "@/components";
import { dateStr, pct, dec, returnColor } from "@/utils/format";

export default function NavSeries({ fundId }: { fundId: number }) {
  const [points, setPoints] = useState<NavPoint[]>([]); const [totalReturn, setTotalReturn] = useState<string | null>(null); const [error, setError] = useState<string | null>(null);
  useEffect(() => { void fundsApi.navSeries(fundId).then((r) => { setPoints(r.data.points); setTotalReturn(r.data.total_return); }).catch(() => setError("净值序列加载失败，请刷新重试")); }, [fundId]);
  if (error) return <Alert type="error" showIcon message={error} />;
  return <Card title="净值序列" extra={<span>区间累计收益：<Num style={{ color: returnColor(totalReturn) }}>{pct(totalReturn)}</Num></span>}><Table rowKey="valuation_date" size="small" dataSource={points} pagination={{ pageSize: 20, showSizeChanger: false }} columns={[{ title: "估值日", dataIndex: "valuation_date", render: dateStr }, { title: "单位净值", dataIndex: "unit_nav", align: "right", render: (v: string | null) => <Num>{dec(v, 4)}</Num> }, { title: "累计单位净值", dataIndex: "cumulative_unit_nav", align: "right", render: (v: string | null) => <Num>{dec(v, 4)}</Num> }, { title: "日收益", dataIndex: "daily_return", align: "right", render: (v: string | null) => <Num style={{ color: returnColor(v) }}>{pct(v)}</Num> }, { title: "累计收益", dataIndex: "cumulative_return", align: "right", render: (v: string | null) => <Num style={{ color: returnColor(v) }}>{pct(v)}</Num> }]} /></Card>;
}

