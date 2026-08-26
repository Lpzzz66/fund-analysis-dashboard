import { useEffect, useState } from "react";
import { Alert, Card, Table } from "antd";
import * as fundsApi from "@/api/funds";
import type { Position } from "@/api/types";
import { Num } from "@/components";
import { dec, weight } from "@/utils/format";

export function PositionsTab({ fundId }: { fundId: number }) {
  const [rows, setRows] = useState<Position[]>([]); const [total, setTotal] = useState(0); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  useEffect(() => { setLoading(true); void fundsApi.positions(fundId, { page: 1, page_size: 50 }).then((r) => { setRows(r.data); setTotal(r.meta.total); }).catch(() => setError("持仓加载失败，请刷新重试")).finally(() => setLoading(false)); }, [fundId]);
  return <div>{error && <Alert type="error" showIcon message={error} />}<Card title="当前持仓"><Table rowKey={(r) => `${r.security_code ?? ""}-${r.account ?? ""}`} size="small" loading={loading} dataSource={rows} pagination={{ pageSize: 50, total, showSizeChanger: false }} scroll={{ x: 900 }} columns={[{ title: "证券代码", dataIndex: "security_code" }, { title: "证券名称", dataIndex: "security_name" }, { title: "市场", dataIndex: "market" }, { title: "账户", dataIndex: "account" }, { title: "数量", dataIndex: "quantity", align: "right", render: (v: string | null) => <Num>{dec(v, 0)}</Num> }, { title: "市价", dataIndex: "market_price", align: "right", render: (v: string | null) => <Num>{dec(v, 2)}</Num> }, { title: "市值", dataIndex: "market_value", align: "right", render: (v: string | null) => <Num>{dec(v, 2)}</Num> }, { title: "净值权重", dataIndex: "nav_weight", align: "right", render: (v: string | null) => <Num>{weight(v)}</Num> }, { title: "停牌说明", dataIndex: "suspension_info", render: (v: string | null) => v ?? "—" }]} /></Card></div>;
}
