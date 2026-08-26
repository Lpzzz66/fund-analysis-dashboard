import { useEffect, useState } from "react";
import { Card, Space, Button, Table, Tag, Modal, Descriptions } from "antd";
import * as api from "@/mock/api";
import type * as db from "@/mock/db";
import { Num, useToast, SourceLink } from "@/components";
import { dec, pct, weight, exportCsv } from "@/utils/format";

export function ShareClassesTab({ fundId }: { fundId: number }) {
  const toast = useToast();
  const [data, setData] = useState<db.ShareClassSnapshot[]>([]);
  const [reconOpen, setReconOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await api.shareClasses(fundId);
      setData(res.data);
    })();
  }, [fundId]);

  const totalNet = data.reduce((s, d) => s + Number(d.net_assets), 0);
  const fundNet = 50_000_000; // from snapshot
  const reconDiff = totalNet - fundNet;

  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Space>
        <Button onClick={() => setReconOpen(true)}>查看对账</Button>
        <Button onClick={() => { exportCsv(data.map((d) => ({ 份额代码: d.share_code, 份额名称: d.share_name, 净资产: d.net_assets, 实收资本: d.paid_in_capital, 单位净值: d.unit_nav, 累计净值: d.cumulative_unit_nav, 日收益: d.daily_return })), `份额数据_${fundId}.csv`); toast.success("已导出"); }}>导出份额数据</Button>
      </Space>

      <Card>
        <Table
          className="fd-table"
          rowKey="share_class_id"
          size="small"
          pagination={false}
          dataSource={data}
          columns={[
            { title: "份额代码", dataIndex: "share_code", width: 90, render: (v) => <span className="mono">{v}</span> },
            { title: "份额名称", dataIndex: "share_name", width: 120 },
            { title: "净资产", dataIndex: "net_assets", align: "right", render: (v) => <Num>{dec(v, 2)}</Num> },
            { title: "实收资本", dataIndex: "paid_in_capital", align: "right", render: (v) => <Num>{dec(v, 2)}</Num> },
            { title: "占比", dataIndex: "net_assets", align: "right", width: 90, render: (v) => <Num>{weight((Number(v) / totalNet).toString())}</Num> },
            { title: "单位净值", dataIndex: "unit_nav", align: "right", render: (v) => <Num>{dec(v, 4)}</Num> },
            { title: "累计净值", dataIndex: "cumulative_unit_nav", align: "right", render: (v) => <Num>{dec(v, 4)}</Num> },
            { title: "日收益", dataIndex: "daily_return", align: "right", width: 90, render: (v) => <Num style={{ color: Number(v) >= 0 ? "var(--sage)" : "var(--crimson)" }}>{pct(v)}</Num> },
            { title: "来源", width: 70, align: "center", render: () => <SourceLink hint="份额类别每日快照" /> },
          ]}
        />
      </Card>

      <Modal open={reconOpen} title="份额类别对账" onCancel={() => setReconOpen(false)} footer={null}>
        <Descriptions column={1} style={{ marginTop: 12 }}>
          <Descriptions.Item label="份额类别净资产合计"><Num>{dec(totalNet.toFixed(10), 2)}</Num></Descriptions.Item>
          <Descriptions.Item label="产品净资产"><Num>{dec(fundNet.toFixed(10), 2)}</Num></Descriptions.Item>
          <Descriptions.Item label="差异">
            <Num style={{ color: Math.abs(reconDiff) > 1 ? "var(--crimson)" : "var(--sage)", fontWeight: 600 }}>
              {dec(reconDiff.toFixed(10), 2)}
            </Num>
            {Math.abs(reconDiff) > 1 ? <Tag color="error" style={{ marginLeft: 8 }}>不平</Tag> : <Tag color="success" style={{ marginLeft: 8 }}>对账平衡</Tag>}
          </Descriptions.Item>
        </Descriptions>
        <div className="fd-caption" style={{ marginTop: 12 }}>校验规则：份额类别净资产合计与产品净资产一致（容忍 1 元）。</div>
      </Modal>
    </Space>
  );
}
