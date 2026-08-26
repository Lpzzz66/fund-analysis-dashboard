import { useEffect, useState } from "react";
import { Segmented, Card, Space, Button, Table, Switch, Tag } from "antd";
import { PieChart, Pie, Cell, Tooltip as RTooltip, ResponsiveContainer, Legend } from "recharts";
import * as api from "@/mock/api";
import type * as db from "@/mock/db";
import { Num, useToast, SourceLink } from "@/components";
import { dec, weight, exportCsv } from "@/utils/format";

const COLORS = ["var(--accent)", "var(--ink-3)", "var(--sage)", "var(--amber)", "#7E92B0"];

export function AllocationTab({ fundId }: { fundId: number }) {
  const toast = useToast();
  const [mode, setMode] = useState<"current" | "history">("current");
  const [denom, setDenom] = useState<"net_assets" | "total_assets">("net_assets");
  const [expanded, setExpanded] = useState(false);
  const [items, setItems] = useState<db.AllocationItem[]>([]);
  const [total, setTotal] = useState("0");

  useEffect(() => {
    (async () => {
      const res = await api.allocation(fundId, denom);
      setItems(res.data.items);
      setTotal(res.data.total_market_value);
    })();
  }, [fundId, denom]);

  const chartData = items.map((i) => ({ name: i.category, value: Number(i.market_value) }));

  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Space wrap>
        <Segmented value={mode} onChange={(v) => setMode(v as "current" | "history")} options={[{ value: "current", label: "当前配置" }, { value: "history", label: "配置趋势" }]} />
        <Segmented value={denom} onChange={(v) => setDenom(v as "net_assets" | "total_assets")} options={[{ value: "net_assets", label: "按净资产" }, { value: "total_assets", label: "按总资产" }]} />
        <Space>
          <Switch checked={expanded} onChange={setExpanded} size="small" />
          <span className="fd-caption">展开到原始科目</span>
        </Space>
        <Button onClick={() => { exportCsv(items.map((i) => ({ 资产类别: i.category, 市值: i.market_value, 权重: i.weight })), `资产配置_${fundId}.csv`); toast.success("已导出"); }}>导出配置</Button>
        <span className="fd-caption">分母：{denom === "net_assets" ? "基金资产净值" : "总资产"}</span>
      </Space>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <Card title={<span className="fd-section-title">资产配置占比</span>} style={{ flex: "1 1 320px", minWidth: 320 }}>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2}>
                {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <RTooltip contentStyle={{ borderRadius: 6, borderColor: "var(--rule)", fontFamily: "var(--mono)", fontSize: 12 }} formatter={(v: number) => [dec(String(v), 2) + " 元", "市值"]} />
              <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
        <Card title={<span className="fd-section-title">配置明细</span>} style={{ flex: "1 1 480px", minWidth: 480 }}>
          <Table
            className="fd-table"
            rowKey="category"
            size="small"
            pagination={false}
            dataSource={items}
            columns={[
              { title: "标准类别", dataIndex: "category" },
              { title: expanded ? "原始科目" : "标准科目", render: () => expanded ? <Tag>110101 沪深A股</Tag> : <span className="fd-caption">—</span>, width: 160 },
              { title: "市值", dataIndex: "market_value", align: "right", render: (v) => <Num>{dec(v, 2)}</Num> },
              { title: "权重", dataIndex: "weight", align: "right", render: (v) => <Num>{weight(v)}</Num> },
              { title: "来源", width: 70, align: "center", render: () => <SourceLink hint="定位到原始科目代码和原表位置" /> },
            ]}
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0}>合计</Table.Summary.Cell>
                <Table.Summary.Cell index={1} />
                <Table.Summary.Cell index={2} align="right"><Num>{dec(total, 2)}</Num></Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="right">100.00%</Table.Summary.Cell>
                <Table.Summary.Cell index={4} />
              </Table.Summary.Row>
            )}
          />
        </Card>
      </div>
    </Space>
  );
}