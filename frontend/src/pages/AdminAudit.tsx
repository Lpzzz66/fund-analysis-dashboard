import { useEffect, useState } from "react";
import { Table, Card, Select, Input, Tag, DatePicker, Space } from "antd";
import * as api from "@/mock/api";
import * as db from "@/mock/db";
import { PageHeader, StatusRibbon } from "@/components";
import { timeStr } from "@/utils/format";
import { AUDIT_RESULT_LABEL, type AuditResult } from "@/utils/constants";

const { RangePicker } = DatePicker;

export default function AdminAudit() {
  const [data, setData] = useState<db.AuditLogRow[]>([]);
  const [meta, setMeta] = useState({ page: 1, page_size: 20, total: 0 });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<{ action?: string; resource_type?: string; result?: string }>({});
  const [page, setPage] = useState(1);

  async function load() {
    setLoading(true);
    const res = await api.auditLogsList({ ...filters, page, page_size: 20 });
    setData(res.data);
    setMeta(res.meta);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filters, page]);

  return (
    <div className="fd-page">
      <PageHeader title="审计日志" desc="按操作人、动作、资源、时间和结果筛选；日志不可通过普通页面删除" />
      <StatusRibbon asOf="—" version="—" coverage={{ available: 0, total: 0 }} quality="valid" />

      <Card style={{ marginTop: 12 }}>
        <Space wrap className="fd-filterbar">
          <Input allowClear placeholder="动作" style={{ width: 180 }} onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value || undefined }))} />
          <Select allowClear placeholder="资源类型" style={{ width: 160 }} onChange={(v) => setFilters((f) => ({ ...f, resource_type: v }))} options={["fund", "valuation_version", "import_batch", "risk_rule", "mail_sync", "system_settings"].map((v) => ({ value: v, label: v }))} />
          <Select allowClear placeholder="结果" style={{ width: 120 }} onChange={(v) => setFilters((f) => ({ ...f, result: v }))} options={Object.entries(AUDIT_RESULT_LABEL).map(([k, v]) => ({ value: k, label: v }))} />
          <RangePicker />
        </Space>
        <Table
          className="fd-table"
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={data}
          pagination={{ current: page, pageSize: 20, total: meta.total, onChange: setPage, size: "small" }}
          columns={[
            { title: "时间", dataIndex: "created_at", render: timeStr, width: 160 },
            { title: "操作人", dataIndex: "actor_user_id", width: 80, render: (v) => v ? <span className="mono">#{v}</span> : "系统" },
            { title: "动作", dataIndex: "action", width: 160, render: (v) => <span className="mono">{v}</span> },
            { title: "资源类型", dataIndex: "resource_type", width: 130 },
            { title: "资源编号", dataIndex: "resource_id", width: 90, render: (v) => <span className="mono">{v ?? "—"}</span> },
            { title: "原因", dataIndex: "reason", ellipsis: true, render: (v) => v ?? "—" },
            { title: "结果", dataIndex: "result", width: 80, render: (v) => <Tag color={v === "success" ? "success" : "error"}>{AUDIT_RESULT_LABEL[v as AuditResult]}</Tag> },
            { title: "摘要", dataIndex: "summary", ellipsis: true, render: (v) => v ? <span className="mono" style={{ fontSize: 11 }}>{JSON.stringify(v).slice(0, 60)}</span> : "—" },
          ]}
        />
        <div className="fd-caption" style={{ marginTop: 8 }}>接口只返回安全摘要，递归剔除密码、令牌、授权码和数据库连接信息。</div>
      </Card>
    </div>
  );
}
