import { useEffect, useState } from "react";
import { Tabs, Table, Button, Card, Form, Input, DatePicker, Tag, Space, Modal, Drawer, Timeline, Select } from "antd";
import { useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import * as db from "@/mock/db";
import { Num, PageHeader, StatusRibbon, useToast, RoleGuard, useConfirm } from "@/components";
import { dateStr } from "@/utils/format";
import { strategyOptions } from "@/mock/db";

export default function AdminFunds() {
  const [params] = useSearchParams();
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState("basic");
  const [funds] = useState(db.funds);
  const [selected, setSelected] = useState(db.funds.find((f) => f.id === Number(params.get("fund"))) ?? db.funds[0]);
  const [form] = Form.useForm();
  const [aliasForm] = Form.useForm();
  const [scForm] = Form.useForm();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [scOpen, setScOpen] = useState(false);

  useEffect(() => {
    form.setFieldsValue({
      ...selected,
      establishment_date: selected.establishment_date ? dayjs(selected.establishment_date) : undefined,
    });
  }, [selected]);

  async function saveBasic() {
    await form.validateFields();
    toast.success("产品基本信息已保存（演示）");
  }

  async function toggleFundStatus() {
    const action = selected.status === "active" ? "停用" : "启用";
    const ok = await confirm({ title: `${action}产品：${selected.name}`, reasonLabel: "原因", reasonRequired: selected.status === "active", danger: selected.status === "active", okText: action });
    if (!ok) return;
    toast.success(`已${action}（演示）`);
  }

  async function addAlias() {
    const v = await aliasForm.validateFields();
    toast.success(`已添加别名"${v.alias}"，冲突检查通过（演示）`);
    aliasForm.resetFields();
  }

  return (
    <div className="fd-page">
      <PageHeader title="产品管理" desc="由业务员和管理员维护产品主数据，不把产品信息硬编码到程序中" />
      <StatusRibbon asOf="2026-08-22" version="—" coverage={{ available: 7, total: 8 }} quality="valid" />

      <Space direction="vertical" size={12} style={{ width: "100%", marginTop: 12 }}>
        <Card size="small">
          <Space wrap>
            <Select style={{ width: 240 }} value={selected.id} onChange={(v) => setSelected(funds.find((f) => f.id === v)!)} options={funds.map((f) => ({ value: f.id, label: f.name }))} />
          </Space>
        </Card>

        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            { key: "basic", label: "9.1 基本信息", children: (
              <Card>
                <Form form={form} layout="vertical" style={{ maxWidth: 600 }}>
                  <Form.Item label="标准名称" name="name" rules={[{ required: true }]}><Input /></Form.Item>
                  <Form.Item label="产品代码" name="product_code"><Input /></Form.Item>
                  <Form.Item label="成立日期" name="establishment_date"><DatePicker style={{ width: "100%" }} /></Form.Item>
                  <Form.Item label="策略说明" name="strategy"><Select options={strategyOptions.map((s) => ({ value: s, label: s }))} /></Form.Item>
                  <Form.Item label="负责人" name="manager"><Input /></Form.Item>
                  <Form.Item label="状态" name="status"><Input disabled /></Form.Item>
                  <Form.Item label="备注" name="notes"><Input.TextArea rows={2} /></Form.Item>
                  <RoleGuard cap="adminFunds">
                    <Space>
                      <Button type="primary" onClick={saveBasic}>保存</Button>
                      <Button danger={selected.status === "active"} onClick={toggleFundStatus}>{selected.status === "active" ? "停用" : "启用"}</Button>
                      <Button onClick={() => setHistoryOpen(true)}>查看变更记录</Button>
                    </Space>
                  </RoleGuard>
                </Form>
              </Card>
            )},
            { key: "shares", label: "9.2 份额类别", children: (
              <Card title={<span className="fd-section-title">份额类别</span>} extra={<RoleGuard cap="adminFunds"><Button size="small" type="primary" onClick={() => setScOpen(true)}>新增份额</Button></RoleGuard>}>
                <Table className="fd-table" rowKey="id" size="small" pagination={false} dataSource={selected.share_classes}
                  columns={[
                    { title: "份额代码", dataIndex: "share_code", width: 90, render: (v) => <span className="mono">{v}</span> },
                    { title: "份额名称", dataIndex: "share_name" },
                    { title: "启用日期", dataIndex: "enabled_from", render: dateStr, width: 110 },
                    { title: "停用日期", dataIndex: "disabled_from", render: dateStr, width: 110 },
                    { title: "状态", dataIndex: "status", width: 80, render: (v) => <Tag color={v === "active" ? "success" : "default"}>{v === "active" ? "启用" : "停用"}</Tag> },
                    { title: "操作", width: 140, render: (_, r) => <RoleGuard cap="adminFunds"><Space size="small"><Button size="small" type="link">编辑</Button><Button size="small" type="link">{r.status === "active" ? "停用" : "恢复"}</Button><Button size="small" type="link">历史</Button></Space></RoleGuard> },
                  ]}
                />
              </Card>
            )},
            { key: "aliases", label: "9.3 识别别名", children: (
              <Card title={<span className="fd-section-title">识别别名</span>} extra={
                <RoleGuard cap="adminFunds">
                  <Form form={aliasForm} layout="inline" onFinish={addAlias}>
                    <Form.Item name="alias" rules={[{ required: true }]}><Input placeholder="输入别名后回车" style={{ width: 200 }} /></Form.Item>
                    <Form.Item><Button type="primary" htmlType="submit" size="small">新增别名</Button></Form.Item>
                  </Form>
                </RoleGuard>
              }>
                <Table className="fd-table" rowKey="id" size="small" pagination={false} dataSource={selected.aliases}
                  columns={[
                    { title: "别名", dataIndex: "alias" },
                    { title: "来源位置", dataIndex: "source_location", width: 120 },
                    { title: "匹配优先级", dataIndex: "match_priority", width: 100, align: "right", render: (v) => <Num>{v}</Num> },
                    { title: "有效期", width: 160, render: (_, r) => `${dateStr(r.valid_from)} ~ ${dateStr(r.valid_to)}` },
                    { title: "操作", width: 80, render: () => <RoleGuard cap="adminFunds"><Button size="small" type="link" danger>删除</Button></RoleGuard> },
                  ]}
                />
                <div className="fd-caption" style={{ marginTop: 8 }}>别名保存后执行冲突检查，防止一个别名匹配多个产品。</div>
              </Card>
            )},
          ]}
        />
      </Space>

      <Drawer open={historyOpen} title="变更记录" onClose={() => setHistoryOpen(false)} width={480}>
        <Timeline items={[
          { children: "2026-08-22 · 停用产品，原因：产品清盘" },
          { children: "2026-06-15 · 修改策略说明为股票多头" },
          { children: "2026-01-15 · 创建产品" },
        ]} />
      </Drawer>

      <Modal open={scOpen} title="新增份额类别" onCancel={() => setScOpen(false)} onOk={async () => { await scForm.validateFields(); toast.success("份额类别已新增（演示）"); setScOpen(false); scForm.resetFields(); }} okText="保存">
        <Form form={scForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item label="份额代码" name="share_code" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="份额名称" name="share_name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="启用日期" name="enabled_from"><DatePicker style={{ width: "100%" }} /></Form.Item>
          <Form.Item label="备注" name="notes"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
