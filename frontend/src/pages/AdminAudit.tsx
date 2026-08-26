import { useEffect, useState } from "react";
import { Alert, Card, Input, Select, Space, Table, Tag } from "antd";
import * as systemApi from "@/api/system";
import type { AuditLog } from "@/api/types";
import { PageHeader, Truncate } from "@/components";
import { AUDIT_RESULT_LABEL, type AuditResult } from "@/utils/constants";
import { timeStr } from "@/utils/format";

export default function AdminAudit() {
  const [rows, setRows] = useState<AuditLog[]>([]); const [total, setTotal] = useState(0); const [page, setPage] = useState(1); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [filters, setFilters] = useState<systemApi.AuditParams>({});
  async function load() { setLoading(true); setError(null); try { const result = await systemApi.listAuditLogs({ ...filters, page, page_size: 20 }); setRows(result.data); setTotal(result.meta.total); } catch { setError("审计日志加载失败，请刷新重试"); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, [page, filters]);
  function updateFilter(key: "action" | "resource_type" | "result", value: string | undefined) { setPage(1); setFilters((current) => ({ ...current, [key]: value || undefined })); }
  return <div className="fd-page"><PageHeader title="审计日志" desc="按操作、资源和结果查询安全摘要；日志不可通过页面删除" />{error && <Alert type="error" showIcon message={error} />}<Card style={{ marginTop: 12 }}><Space wrap className="fd-filterbar"><Input allowClear placeholder="动作" style={{ width: 180 }} onChange={(e) => updateFilter("action", e.target.value)} /><Select allowClear placeholder="资源类型" style={{ width: 160 }} onChange={(v) => updateFilter("resource_type", v)} options={["fund", "fund_alias", "share_class", "subject_mapping", "valuation_version", "import_batch", "risk_rule", "system_settings", "maintenance"].map((v) => ({ value: v, label: v }))} /><Select allowClear placeholder="结果" style={{ width: 120 }} onChange={(v) => updateFilter("result", v)} options={Object.entries(AUDIT_RESULT_LABEL).map(([value, label]) => ({ value, label }))} /></Space><Table rowKey="id" size="small" loading={loading} dataSource={rows} pagination={{ current: page, pageSize: 20, total, onChange: setPage, showSizeChanger: false }} columns={[{ title: "时间", dataIndex: "created_at", render: timeStr }, { title: "操作人", dataIndex: "actor_user_id", render: (v: number | null) => v ? `#${v}` : "系统" }, { title: "动作", dataIndex: "action" }, { title: "资源", dataIndex: "resource_type" }, { title: "编号", dataIndex: "resource_id" }, { title: "原因", dataIndex: "reason", render: (v: string | null) => <Truncate value={v ?? ""} /> }, { title: "结果", dataIndex: "result", render: (v: AuditResult) => <Tag color={v === "success" ? "success" : "error"}>{AUDIT_RESULT_LABEL[v]}</Tag> }, { title: "摘要", dataIndex: "summary", render: (v: unknown) => <Truncate value={v as object} maxChars={120} /> }]} scroll={{ x: 900 }} /><div className="fd-caption">接口仅返回脱敏摘要，密码、令牌、授权码和数据库连接信息不会展示。</div></Card></div>;
}
