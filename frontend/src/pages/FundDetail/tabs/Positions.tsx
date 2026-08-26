import { useEffect, useState } from "react";
import { Segmented, Card, Space, Button, Table, Select, Switch, Input, Tag } from "antd";
import * as api from "@/mock/api";
import type * as db from "@/mock/db";
import { Num, useToast, SourceLink } from "@/components";
import { dec, weight, exportCsv } from "@/utils/format";

export function PositionsTab({ fundId }: { fundId: number }) {
  const toast = useToast();
  const [mode, setMode] = useState<"current" | "history">("current");
  const [sort, setSort] = useState<"market_value" | "nav_weight" | "valuation_gain">("market_value");
  const [account, setAccount] = useState<string | undefined>();
  const [market, setMarket] = useState<string | undefined>();
  const [merge, setMerge] = useState(false);
  const [data, setData] = useState<db.PositionRow[]>([]);
  const [meta, setMeta] = useState<{ page: number; page_size: number; total: number; valuation_date: string | null }>({ page: 1, page_size: 50, total: 0, valuation_date: null });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await api.positions(fundId, { account, market, merge, sort, page, page_size: 50 });
    setData(res.data);
    setMeta(res.meta);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [fundId, sort, account, market, merge, page]);

  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Space wrap>
        <Segmented value={mode} onChange={(v) => setMode(v as "current" | "history")} options={[{ value: "current", label: "当前持仓" }, { value: "history", label: "历史持仓" }]} />
        {mode === "history" && <Input placeholder="选择估值日" style={{ width: 140 }} disabled />}
        <Segmented value={sort} onChange={(v) => setSort(v as "market_value" | "nav_weight" | "valuation_gain")} options={[{ value: "market_value", label: "按市值" }, { value: "nav_weight", label: "按权重" }, { value: "valuation_gain", label: "按浮盈亏" }]} />
        <Select allowClear placeholder="账户" style={{ width: 130 }} value={account} onChange={setAccount} options={[{ value: "证券账户A", label: "证券账户A" }, { value: "证券账户B", label: "证券账户B" }]} />
        <Select allowClear placeholder="市场" style={{ width: 120 }} value={market} onChange={setMarket} options={[{ value: "上交所", label: "上交所" }, { value: "深交所", label: "深交所" }]} />
        <Space>
          <Switch checked={merge} onChange={setMerge} size="small" />
          <span className="fd-caption">穿透合并证券</span>
        </Space>
        <Button onClick={() => { exportCsv(data.map((r) => ({ 证券代码: r.security_code, 证券名称: r.security_name, 市场: r.market, 账户: r.account, 数量: r.quantity, 单位成本: r.unit_cost, 成本: r.cost, 市价: r.market_price, 市值: r.market_value, 净值权重: r.nav_weight, 估值增值: r.valuation_gain })), `持仓_${fundId}.csv`); toast.success("已导出持仓"); }}>导出持仓</Button>
      </Space>
      {merge && <div className="fd-caption">穿透合并：按证券代码跨账户归并，账户列显示"穿透合并"。</div>}

      <Card>
        <Table
          className="fd-table"
          rowKey={(r) => r.security_code + r.account}
          size="small"
          loading={loading}
          dataSource={data}
          pagination={{ current: page, pageSize: 50, total: meta.total, onChange: setPage, size: "small" }}
          scroll={{ x: 1100 }}
          columns={[
            { title: "证券代码", dataIndex: "security_code", width: 90, render: (v) => <span className="mono">{v}</span> },
            { title: "证券名称", dataIndex: "security_name", width: 100 },
            { title: "市场", dataIndex: "market", width: 80 },
            { title: "账户", dataIndex: "account", width: 110 },
            { title: "数量", dataIndex: "quantity", align: "right", width: 110, render: (v) => <Num>{dec(v, 0)}</Num> },
            { title: "单位成本", dataIndex: "unit_cost", align: "right", width: 90, render: (v) => <Num>{dec(v, 2)}</Num> },
            { title: "成本", dataIndex: "cost", align: "right", width: 110, render: (v) => <Num>{dec(v, 2)}</Num> },
            { title: "市价", dataIndex: "market_price", align: "right", width: 90, render: (v) => <Num>{dec(v, 2)}</Num> },
            { title: "市值", dataIndex: "market_value", align: "right", width: 120, render: (v) => <Num>{dec(v, 2)}</Num> },
            { title: "净值权重", dataIndex: "nav_weight", align: "right", width: 90, render: (v) => <Num>{weight(v)}</Num> },
            { title: "估值增值", dataIndex: "valuation_gain", align: "right", width: 110, render: (v) => <Num style={{ color: Number(v) >= 0 ? "var(--sage)" : "var(--crimson)" }}>{dec(v, 2)}</Num> },
            { title: "停牌", dataIndex: "suspension_info", width: 70, align: "center", render: (v) => v ? <Tag color="warning">{v}</Tag> : <span className="fd-caption">—</span> },
            { title: "来源", width: 70, align: "center", render: () => <SourceLink hint="定位到原始科目代码和原表位置" /> },
          ]}
        />
      </Card>
    </Space>
  );
}
