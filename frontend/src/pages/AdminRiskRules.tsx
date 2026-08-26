import { useEffect, useState } from "react";
import { Button, Space, Table, Card, Tag, Select, Modal, Form, Input, InputNumber, DatePicker, Switch } from "antd";
import { useNavigate } from "react-router-dom";
import * as api from "@/mock/api";
import * as db from "@/mock/db";
import { Num, PageHeader, StatusRibbon, useToast, RoleGuard } from "@/components";
import { dec, dateStr } from "@/utils/format";
import { RISK_RULE_TYPES, RISK_SEVERITY_LABEL, type RiskSeverity } from "@/utils/constants";

export default function AdminRiskRules() {
  const toast = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState<db.RiskRuleRow[]>([]);
  const [meta, setMeta] = useState({ page: 1, page_size: 10, total: 0, include_history: false });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<{ rule_code?: string; enabled?: boolean; include_history?: boolean }>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [trialOpen, setTrialOpen] = useState(false);
  const [form] = Form.useForm();
  const [trialForm] = Form.useForm();

  async function load() {
    setLoading(true);
    const res = await api.riskRulesList({ ...filters, page, page_size: 10 });
    setData(res.data);
    setMeta(res.meta);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filters, page]);

  async function createRule() {
    const v = await form.validateFields();
    await api.createRiskRule(v);
    toast.success("风险规则已新建");
    setCreateOpen(false); form.resetFields(); load();
  }

  async function toggleRule(r: db.RiskRuleRow) {
    const action = r.enabled ? "停用" : "启用";
    toast.success(`已${action}规则 ${r.rule_code}（演示，创建新版本）`);
    load();
  }

  async function copyRule(r: db.RiskRuleRow) {
    form.setFieldsValue({ ...r, version: String(Number(r.version) + 1) });
    setCreateOpen(true);
    toast.info("已复制规则，修改后保存生成新版本");
  }

  return (
    <div className="fd-page">
      <PageHeader
        title="风险规则"
        desc="维护日收益、回撤、集中度等风险规则，版本化管理"
        extra={
          <RoleGuard cap="adminRiskRules">
            <Space>
              <Button type="primary" onClick={() => setCreateOpen(true)}>新建规则</Button>
              <Button onClick={() => setTrialOpen(true)}>试算</Button>
            </Space>
          </RoleGuard>
        }
      />
      <StatusRibbon asOf="—" version="—" coverage={{ available: 0, total: 0 }} quality="valid" />

      <Card style={{ marginTop: 12 }}>
        <Space wrap className="fd-filterbar">
          <Input allowClear placeholder="规则编码" style={{ width: 160 }} onChange={(e) => setFilters((f) => ({ ...f, rule_code: e.target.value || undefined }))} />
          <Select allowClear placeholder="启用状态" style={{ width: 120 }} onChange={(v) => setFilters((f) => ({ ...f, enabled: v }))} options={[{ value: true, label: "启用" }, { value: false, label: "停用" }]} />
          <Switch checked={filters.include_history} onChange={(v) => setFilters((f) => ({ ...f, include_history: v }))} size="small" />
          <span className="fd-caption">包含历史版本</span>
        </Space>
        <Table
          className="fd-table"
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={data}
          pagination={{ current: page, pageSize: 10, total: meta.total, onChange: setPage, size: "small" }}
          columns={[
            { title: "规则编码", dataIndex: "rule_code", width: 110, render: (v) => <span className="mono">{v}</span> },
            { title: "规则类型", dataIndex: "rule_type", width: 130, render: (v) => ({ daily_return: "日收益下跌", max_drawdown: "最大回撤", current_drawdown: "当前回撤", single_position_weight: "单票权重", top_five_weight: "前五大权重", concentration: "集中度" } as Record<string, string>)[v] ?? v },
            { title: "适用范围", dataIndex: "scope", width: 80 },
            { title: "阈值", dataIndex: "threshold", align: "right", width: 110, render: (v) => <Num>{dec(v, 4)}</Num> },
            { title: "严重度", dataIndex: "severity", width: 80, render: (v) => <Tag color={v === "critical" ? "error" : v === "warning" ? "warning" : "default"}>{RISK_SEVERITY_LABEL[v as RiskSeverity]}</Tag> },
            { title: "有效期", width: 180, render: (_, r) => `${dateStr(r.valid_from)} ~ ${dateStr(r.valid_to)}` },
            { title: "版本", dataIndex: "version", width: 60, align: "center", render: (v) => <span className="mono">v{v}</span> },
            { title: "状态", dataIndex: "enabled", width: 80, align: "center", render: (v) => <Tag color={v ? "success" : "default"}>{v ? "启用" : "停用"}</Tag> },
            {
              title: "操作", width: 220, align: "center",
              render: (_, r) => (
                <RoleGuard cap="adminRiskRules">
                  <Space size="small">
                    <Button size="small" type="link" onClick={() => toggleRule(r)}>{r.enabled ? "停用" : "启用"}</Button>
                    <Button size="small" type="link" onClick={() => copyRule(r)}>复制规则</Button>
                    <Button size="small" type="link" onClick={() => navigate("/risk?rule=" + r.rule_code)}>触发记录</Button>
                  </Space>
                </RoleGuard>
              ),
            },
          ]}
        />
        <div className="fd-caption" style={{ marginTop: 8 }}>复制规则后生成新版本，避免直接修改历史口径。启用/停用同样通过新版本表达。</div>
      </Card>

      <Modal open={createOpen} title="新建风险规则" onCancel={() => setCreateOpen(false)} onOk={createRule} okText="保存" width={520}>
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item label="规则编码" name="rule_code" rules={[{ required: true }]}><Input placeholder="如 DR-002" /></Form.Item>
          <Form.Item label="规则类型" name="rule_type" rules={[{ required: true }]}>
            <Select options={RISK_RULE_TYPES.map((t) => ({ value: t, label: ({ daily_return: "日收益下跌", max_drawdown: "最大回撤", current_drawdown: "当前回撤", single_position_weight: "单票权重", top_five_weight: "前五大权重", concentration: "集中度" } as Record<string, string>)[t] ?? t }))} />
          </Form.Item>
          <Form.Item label="适用范围" name="scope" initialValue="all"><Input placeholder="all 或 fund:1,2" /></Form.Item>
          <Form.Item label="阈值" name="threshold" rules={[{ required: true }]}><InputNumber style={{ width: "100%" }} step={0.01} /></Form.Item>
          <Form.Item label="严重度" name="severity" rules={[{ required: true }]}>
            <Select options={Object.entries(RISK_SEVERITY_LABEL).map(([k, v]) => ({ value: k, label: v }))} />
          </Form.Item>
          <Form.Item label="有效期" name="valid_range"><DatePicker.RangePicker style={{ width: "100%" }} /></Form.Item>
          <Form.Item label="启用" name="enabled" valuePropName="checked" initialValue={true}><Switch /></Form.Item>
        </Form>
      </Modal>

      <Modal open={trialOpen} title="试算（不生成正式事件）" onCancel={() => setTrialOpen(false)} onOk={async () => { await trialForm.validateFields(); toast.success("试算完成：将触发 3 个历史事件（演示）"); setTrialOpen(false); }} okText="试算">
        <Form form={trialForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item label="选择日期范围" name="range" rules={[{ required: true }]}><DatePicker.RangePicker style={{ width: "100%" }} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
