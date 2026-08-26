import { useEffect, useState } from "react";
import { Button, Space, Table, Card, Tag, Upload, Modal, Select, Progress, Dropdown, Descriptions } from "antd";
import * as api from "@/mock/api";
import type * as db from "@/mock/db";
import { Num, PageHeader, StatusRibbon, useToast, RoleGuard, SourceLink, useConfirm, usePolling } from "@/components";
import { dateStr, timeStr, exportCsv } from "@/utils/format";
import {
  VALUATION_STATUS_LABEL,
  IMPORT_BATCH_STATUS_LABEL,
  JOB_STATUS_LABEL,
  SOURCE_TYPE_LABEL,
  type ValuationStatus,
} from "@/utils/constants";

const statusColor = (s: ValuationStatus) =>
  s === "published" ? "success" : s === "pending_review" ? "warning" : s === "failed" || s === "rejected" || s === "revoked" ? "error" : s === "superseded" || s === "duplicate" || s === "non_valuation" ? "default" : "processing";

export default function Imports() {
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState<db.ImportBatchRow[]>([]);
  const [meta, setMeta] = useState({ page: 1, page_size: 10, total: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<{ source_type?: string; status?: string }>({});
  const [detail, setDetail] = useState<db.ImportBatchRow | null>(null);
  const [polling, setPolling] = useState<number | null>(null);
  const [pollState, setPollState] = useState<{ status: string; progress: number } | null>(null);

  async function load() {
    setLoading(true);
    const res = await api.importBatchesList({ ...filters, page, page_size: 10 });
    setData(res.data);
    setMeta(res.meta);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filters, page]);

  // Polling for in-progress batch
  usePolling(
    polling !== null,
    (r) => (r as { status: string }).status === "succeeded" || (r as { status: string }).status === "failed",
    async () => (polling ? api.jobStatus(polling) : Promise.resolve({ status: "succeeded" })),
    (r) => setPollState(r as { status: string; progress: number }),
  );

  async function startProcess(batch: db.ImportBatchRow) {
    toast.success(`已开始处理批次 ${batch.id}（演示）`);
    setPolling(batch.id);
    setPollState({ status: "running", progress: 0 });
    load();
  }

  async function publishVersion(versionId: number, hasWarnings: boolean) {
    if (hasWarnings) {
      const ok = await confirm({ title: "该版本存在警告，确认发布？", description: "警告级问题可以在明确提示后发布。", danger: true, okText: "确认发布" });
      if (!ok) return;
    }
    await api.versionAction(versionId, "publish", { confirm_warnings: hasWarnings });
    toast.success("版本已发布");
    if (detail) load();
  }

  async function revokeVersion(versionId: number) {
    const ok = await confirm({ title: "撤回已发布版本", description: "撤回将影响看板数据，必须二次确认并填写原因。", reasonRequired: true, danger: true, okText: "确认撤回" });
    if (!ok) return;
    await api.versionAction(versionId, "revoke", {});
    toast.success("版本已撤回");
    if (detail) load();
  }

  async function restoreVersion(versionId: number) {
    const ok = await confirm({ title: "恢复旧版本", description: "将旧版本作为当前发布版本重新发布，保留完整审计。", reasonRequired: true, okText: "确认恢复" });
    if (!ok) return;
    await api.versionAction(versionId, "restore", {});
    toast.success("版本已恢复");
    if (detail) load();
  }

  const actionItems = (version: { id: number; status: ValuationStatus }) => ({
    items: [
      ...(version.status === "publishable" ? [{ key: "publish", label: "发布" }] : []),
      ...(version.status === "published" ? [{ key: "revoke", label: "作废", danger: true }] : []),
      ...(version.status === "superseded" || version.status === "revoked" ? [{ key: "restore", label: "恢复此版本" }] : []),
      ...(version.status === "published" ? [{ key: "replace", label: "替代当前版本" }] : []),
      { key: "download", label: "下载原文件" },
    ],
    onClick: ({ key }: { key: string }) => {
      if (key === "publish") publishVersion(version.id, false);
      else if (key === "revoke") revokeVersion(version.id);
      else if (key === "restore") restoreVersion(version.id);
      else if (key === "replace") toast.info("上传同产品同日期修订版后使用（演示）");
      else if (key === "download") toast.success("下载原文件（演示）");
    },
  });

  return (
    <div className="fd-page">
      <PageHeader
        title="导入中心"
        desc="统一处理手工上传、邮件附件和历史批量导入"
        extra={
          <Space>
            <RoleGuard cap="imports">
              <Upload multiple accept=".xls,.xlsx" showUploadList={false} beforeUpload={async (file) => {
                const res = await api.createImportBatch("upload", [file.name]);
                toast.success(`已上传 ${file.name}，批次 ${res.data.id}`);
                load();
                return false;
              }}>
                <Button type="primary">上传文件</Button>
              </Upload>
            </RoleGuard>
            <RoleGuard cap="imports"><Button onClick={() => toast.info("选择本地目录后递归扫描，不移动和删除源文件（演示）")}>选择目录导入</Button></RoleGuard>
            <Button onClick={() => toast.success("已重试可重试的失败任务（演示）")}>重试失败任务</Button>
            <Button onClick={() => { exportCsv(data.map((b) => ({ 批次: b.id, 来源: SOURCE_TYPE_LABEL[b.source_type], 文件数: b.file_count, 状态: IMPORT_BATCH_STATUS_LABEL[b.status], 创建: b.created_at })), "导入报告.csv"); toast.success("已导出处理报告"); }}>导出处理报告</Button>
          </Space>
        }
      />
      <StatusRibbon asOf="2026-08-22" version="—" coverage={{ available: 8, total: 8 }} quality="valid" />

      {polling && pollState && (
        <Card size="small" style={{ marginTop: 12 }}>
          <Space>
            <span className="fd-caption">批次 {polling} 处理中</span>
            <Progress percent={pollState.progress} size="small" style={{ width: 200 }} />
            <span className="fd-caption">{JOB_STATUS_LABEL[pollState.status as keyof typeof JOB_STATUS_LABEL]}</span>
            <Button size="small" type="link" onClick={() => { setPolling(null); setPollState(null); }}>停止轮询</Button>
          </Space>
        </Card>
      )}

      <Card style={{ marginTop: 12 }}>
        <Space wrap className="fd-filterbar">
          <Select allowClear placeholder="来源" style={{ width: 130 }} onChange={(v) => { setFilters((f) => ({ ...f, source_type: v })); setPage(1); }} options={Object.entries(SOURCE_TYPE_LABEL).map(([k, v]) => ({ value: k, label: v }))} />
          <Select allowClear placeholder="状态" style={{ width: 130 }} onChange={(v) => { setFilters((f) => ({ ...f, status: v })); setPage(1); }} options={Object.entries(IMPORT_BATCH_STATUS_LABEL).map(([k, v]) => ({ value: k, label: v }))} />
        </Space>
        <Table
          className="fd-table"
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={data}
          pagination={{ current: page, pageSize: 10, total: meta.total, onChange: setPage, size: "small" }}
          columns={[
            { title: "批次", dataIndex: "id", width: 70, render: (v) => <span className="mono">{v}</span> },
            { title: "来源", dataIndex: "source_type", width: 100, render: (v) => SOURCE_TYPE_LABEL[v as never] },
            { title: "文件数", dataIndex: "file_count", width: 70, align: "right" },
            { title: "状态", dataIndex: "status", width: 90, render: (v) => <Tag color={v === "completed" ? "success" : v === "failed" ? "error" : "processing"}>{IMPORT_BATCH_STATUS_LABEL[v as never]}</Tag> },
            { title: "任务状态", render: (_, r) => r.job ? <Tag>{JOB_STATUS_LABEL[r.job.status]}</Tag> : "—", width: 90 },
            { title: "创建时间", dataIndex: "created_at", render: timeStr, width: 160 },
            {
              title: "操作", width: 160, align: "center",
              render: (_, r) => (
                <Space size="small">
                  <Button size="small" type="link" onClick={async () => { const d = await api.importBatchDetail(r.id); setDetail(d.data); }}>详情</Button>
                  <RoleGuard cap="imports">
                    {r.status === "created" && <Button size="small" type="link" onClick={() => startProcess(r)}>开始处理</Button>}
                    {r.job?.can_retry && <Button size="small" type="link" onClick={async () => { await api.retryBatch(r.id); toast.success("已重试"); load(); }}>重试</Button>}
                  </RoleGuard>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Modal open={!!detail} title={`批次详情 ${detail?.id ?? ""}`} onCancel={() => setDetail(null)} footer={null} width={760}>
        {detail && (
          <div style={{ marginTop: 12 }}>
            <Space wrap style={{ marginBottom: 12 }}>
              <Tag>{SOURCE_TYPE_LABEL[detail.source_type]}</Tag>
              <Tag color={detail.status === "completed" ? "success" : detail.status === "failed" ? "error" : "processing"}>{IMPORT_BATCH_STATUS_LABEL[detail.status]}</Tag>
              <span className="fd-caption">{detail.file_count} 个文件 · {timeStr(detail.created_at)}</span>
            </Space>

            <h3 className="fd-section-title" style={{ marginBottom: 8 }}>文件列表</h3>
            <Table
              className="fd-table"
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={detail.files}
              columns={[
                { title: "文件名", dataIndex: "original_filename", ellipsis: true },
                { title: "哈希", dataIndex: "file_hash", width: 120, render: (v) => <span className="mono" style={{ fontSize: 11 }}>{v.slice(0, 12)}…</span> },
                { title: "大小", dataIndex: "file_size", width: 80, align: "right", render: (v) => <Num>{`${(v / 1024).toFixed(0)}KB`}</Num> },
                { title: "重复", dataIndex: "duplicate", width: 60, align: "center", render: (v) => v ? <Tag>是</Tag> : "—" },
              ]}
            />

            {detail.versions && detail.versions.length > 0 && (
              <>
                <h3 className="fd-section-title" style={{ margin: "16px 0 8px" }}>识别结果与版本</h3>
                <Table
                  className="fd-table"
                  rowKey="id"
                  size="small"
                  pagination={false}
                  dataSource={detail.versions}
                  columns={[
                    { title: "产品", dataIndex: "fund_name" },
                    { title: "估值日", dataIndex: "valuation_date", render: dateStr, width: 100 },
                    { title: "版本", dataIndex: "version_no", width: 60, render: (v) => <span className="mono">v{v}</span> },
                    { title: "状态", dataIndex: "status", width: 90, render: (v) => <Tag color={statusColor(v as ValuationStatus)}>{VALUATION_STATUS_LABEL[v as ValuationStatus]}</Tag> },
                    {
                      title: "操作", width: 100, align: "center",
                      render: (_, r) => (
                        <RoleGuard cap="publish">
                          <Dropdown menu={actionItems(r)} trigger={["click"]}>
                            <Button size="small" type="link">操作 ▾</Button>
                          </Dropdown>
                        </RoleGuard>
                      ),
                    },
                  ]}
                />
              </>
            )}

            {detail.job && (
              <>
                <h3 className="fd-section-title" style={{ margin: "16px 0 8px" }}>处理日志</h3>
                <Descriptions size="small" column={2} bordered>
                  <Descriptions.Item label="任务状态">{JOB_STATUS_LABEL[detail.job.status]}</Descriptions.Item>
                  <Descriptions.Item label="尝试次数">{detail.job.attempts} / {detail.job.max_attempts}</Descriptions.Item>
                  <Descriptions.Item label="开始时间">{timeStr(detail.job.started_at)}</Descriptions.Item>
                  <Descriptions.Item label="结束时间">{timeStr(detail.job.finished_at)}</Descriptions.Item>
                  {detail.job.error_code && <Descriptions.Item label="错误编码" span={2}><Tag color="error">{detail.job.error_code}</Tag></Descriptions.Item>}
                </Descriptions>
              </>
            )}
            <div style={{ marginTop: 12 }}>
              <SourceLink label="查看来源" hint="定位到原始文件、哈希、识别结果、校验结果和处理日志" />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
