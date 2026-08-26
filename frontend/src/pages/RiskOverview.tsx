import { useEffect, useState } from "react";
import { Button, Space, Table, Select, Card, Tag, Form, Input, Modal } from "antd";
import { useSearchParams } from "react-router-dom";
import * as api from "@/mock/api";
import type * as db from "@/mock/db";
import { PageHeader, StatusRibbon, useToast, RoleGuard, SourceLink } from "@/components";
import { dateStr, timeStr } from "@/utils/format";
import {
  RISK_EVENT_STATUS_LABEL,
  RISK_SEVERITY_LABEL,
  type RiskEventStatus,
  type RiskSeverity,
} from "@/utils/constants";

export default function RiskOverview() {
  const [params] = useSearchParams();
  const toast = useToast();
  const [data, setData] = useState<db.RiskEventRow[]>([]);
  const [meta, setMeta] = useState({ page: 1, page_size: 10, total: 0 });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    fund_id: params.get("fund") ? Number(params.get("fund")) : undefined,
    severity: undefined as RiskSeverity | undefined,
    status: undefined as RiskEventStatus | undefined,
    rule_code: undefined,
  });
  const [page, setPage] = useState(1);
  const [handle, setHandle] = useState<{ id: number; open: boolean } | null>(null);
  const [form] = Form.useForm();

  async function load() {
    setLoading(true);
    const res = await api.riskEventsList({ ...filters, page, page_size: 10 });
    setData(res.data);
    setMeta(res.meta);
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, page]);

  const sevColor = (s: RiskSeverity) => (s === "critical" ? "error" : s === "warning" ? "warning" : "default");
  const statusColor = (s: RiskEventStatus) => (s === "open" ? "error" : s === "acknowledged" ? "warning" : s === "resolved" ? "success" : "default");

  async function submitHandle() {
    const v = await form.validateFields();
    await api.handleRiskEvent(handle!.id, v.status, v.handling_note);
    toast.success("风险事件已处理");
    setHandle(null);
    form.resetFields();
    load();
  }

  return (
    <div className="fd-page">
      <PageHeader
        title="风险概览"
        desc="集中处理格式错误、对账差异、净值跳变和风险触发事件"
        extra={
          <Space>
            <Button onClick={() => { setFilters({ fund_id: undefined, severity: undefined, status: undefined, rule_code: undefined }); setPage(1); }}>重置筛选</Button>
            <Button onClick={() => toast.info("导出当前筛选结果")}>导出列表</Button>
          </Space>
        }
      />
      <StatusRibbon asOf="2026-08-22" version="v1 @ 2026-08-22" coverage={{ available: 8, total: 8 }} quality="warning" />

      <Card style={{ marginTop: 12 }}>
        <Space wrap className="fd-filterbar">
          <Select
            allowClear
            placeholder="严重度"
            style={{ width: 120 }}
            value={filters.severity}
            onChange={(v) => { setFilters((f) => ({ ...f, severity: v })); setPage(1); }}
            options={Object.entries(RISK_SEVERITY_LABEL).map(([k, v]) => ({ value: k, label: v }))}
          />
          <Select
            allowClear
            placeholder="处理状态"
            style={{ width: 120 }}
            value={filters.status}
            onChange={(v) => { setFilters((f) => ({ ...f, status: v })); setPage(1); }}
            options={Object.entries(RISK_EVENT_STATUS_LABEL).map(([k, v]) => ({ value: k, label: v }))}
          />
          <Select
            allowClear
            placeholder="风险规则"
            showSearch
            style={{ width: 160 }}
            value={filters.rule_code}
            onChange={(v) => { setFilters((f) => ({ ...f, rule_code: v })); setPage(1); }}
            options={[
              { value: "DR-001", label: "DR-001 日收益下跌" },
              { value: "MD-001", label: "MD-001 最大回撤" },
              { value: "CD-001", label: "CD-001 当前回撤" },
              { value: "SP-001", label: "SP-001 单票权重" },
              { value: "CC-001", label: "CC-001 集中度" },
            ]}
          />
        </Space>
        <Table
          className="fd-table"
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={data}
          pagination={{ current: page, pageSize: 10, total: meta.total, onChange: setPage, showSizeChanger: false, size: "small" }}
          columns={[
            { title: "产品", dataIndex: "fund_name", width: 120 },
            { title: "估值日", dataIndex: "valuation_date", render: dateStr, width: 110 },
            { title: "规则", dataIndex: "rule_code", width: 100 },
            { title: "严重度", dataIndex: "severity", width: 90, render: (v) => <Tag color={sevColor(v)}>{RISK_SEVERITY_LABEL[v as RiskSeverity]}</Tag> },
            { title: "状态", dataIndex: "status", width: 90, render: (v) => <Tag color={statusColor(v as RiskEventStatus)}>{RISK_EVENT_STATUS_LABEL[v as RiskEventStatus]}</Tag> },
            { title: "首次触发", dataIndex: "first_triggered_at", render: timeStr, width: 160 },
            { title: "处理意见", dataIndex: "handling_note", ellipsis: true, render: (v) => v ?? "—" },
            {
              title: "操作", width: 80, align: "center",
              render: (_, r) => (
                <RoleGuard cap="publish">
                  <Button size="small" disabled={r.status !== "open" && r.status !== "acknowledged"} onClick={() => setHandle({ id: r.id, open: true })}>处理</Button>
                </RoleGuard>
              ),
            },
            {
              title: "来源", width: 60, align: "center",
              render: (_, r) => <SourceLink hint={`规则版本 / ${r.valuation_date} / 证据: ${r.evidence_reference ?? "无"}`} />,
            },
          ]}
        />
      </Card>

      <Modal
        open={handle?.open}
        title="处理风险事件"
        onCancel={() => setHandle(null)}
        onOk={submitHandle}
        okText="提交处理"
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item label="处理结果" name="status" rules={[{ required: true, message: "请选择处理结果" }]}>
            <Select
              options={[
                { value: "acknowledged", label: "已确认" },
                { value: "resolved", label: "已解决" },
                { value: "ignored", label: "已忽略" },
              ]}
            />
          </Form.Item>
          <Form.Item label="处理意见" name="handling_note" rules={[{ required: true, message: "请填写处理意见" }, { max: 4000 }]}>
            <Input.TextArea rows={4} placeholder="说明处理情况和结论" maxLength={4000} showCount />
          </Form.Item>
          <Form.Item label="证据引用" name="evidence_reference">
            <Input placeholder="可选，如会议纪要编号" maxLength={1000} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
