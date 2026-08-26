import { useEffect, useState } from "react";
import { Card, Space, Button, Table, Tag, Empty, Modal } from "antd";
import { useNavigate } from "react-router-dom";
import * as api from "@/mock/api";
import { Num, useToast, LevelTag, QualityBadge, SourceLink, RoleGuard } from "@/components";
import { dec } from "@/utils/format";
import { VALIDATION_LEVEL_LABEL, type QualityStatus, type ValidationLevel } from "@/utils/constants";

export function QualityTab({ fundId }: { fundId: number }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [q, setQ] = useState<{ version_id: number | null; valuation_date: string | null; quality_status: QualityStatus; validation: api.QualityFinding[] } | null>(null);
  const [diff, setDiff] = useState<api.VersionDiffItem[] | null>(null);
  const [diffOpen, setDiffOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await api.quality(fundId);
      setQ(res.data);
    })();
  }, [fundId]);

  const grouped = (q?.validation ?? []).reduce(
    (acc, f) => { (acc[f.level] ??= []).push(f); return acc; },
    {} as Record<ValidationLevel, api.QualityFinding[]>,
  );

  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Space wrap>
        <span className="fd-caption">版本 <Num>{q?.version_id ? `v${q.version_id}` : "—"}</Num> · 估值日 <Num>{q?.valuation_date ?? "—"}</Num></span>
        <span className="fd-caption">质量 <QualityBadge status={q?.quality_status ?? "pending"} /></span>
        <RoleGuard cap="publish">
          <Button onClick={() => { toast.success("已重新执行校验，版本不变（演示）"); (async () => setQ((await api.quality(fundId)).data))(); }}>重新校验</Button>
        </RoleGuard>
        <Button onClick={async () => { const d = await api.versionDiff(fundId); setDiff(d.data); setDiffOpen(true); }}>查看差异</Button>
        <Button onClick={() => navigate("/reviews?fund=" + fundId)}>进入复核</Button>
      </Space>

      {grouped.critical && grouped.critical.length > 0 && (
        <Card size="small" title={<Tag color="error">{VALIDATION_LEVEL_LABEL.critical} · {grouped.critical.length}</Tag>}>
          <FindingTable rows={grouped.critical} level="critical" />
        </Card>
      )}
      {grouped.warning && grouped.warning.length > 0 ? (
        <Card size="small" title={<Tag color="warning">{VALIDATION_LEVEL_LABEL.warning} · {grouped.warning.length}</Tag>}>
          <FindingTable rows={grouped.warning} level="warning" />
        </Card>
      ) : (
        <Card size="small"><Empty description="无警告级校验" image={Empty.PRESENTED_IMAGE_SIMPLE} /></Card>
      )}
      {grouped.info && grouped.info.length > 0 && (
        <Card size="small" title={<Tag>{VALIDATION_LEVEL_LABEL.info} · {grouped.info.length}</Tag>}>
          <FindingTable rows={grouped.info} level="info" />
        </Card>
      )}
      {(!grouped.critical || grouped.critical.length === 0) && (!grouped.warning || grouped.warning.length === 0) && (!grouped.info || grouped.info.length === 0) && (
        <Card><Empty description="当前版本无校验异常" image={Empty.PRESENTED_IMAGE_SIMPLE} /></Card>
      )}

      <Modal open={diffOpen} title="版本差异对比" onCancel={() => setDiffOpen(false)} footer={null} width={600}>
        {diff && (
          <Table
            className="fd-table"
            rowKey="field"
            size="small"
            pagination={false}
            dataSource={diff}
            columns={[
              { title: "字段", dataIndex: "field" },
              { title: "上一版本", dataIndex: "previous", align: "right", render: (v) => <Num>{v}</Num> },
              { title: "当前版本", dataIndex: "current", align: "right", render: (v) => <Num>{v}</Num> },
              { title: "变化", dataIndex: "change", align: "right", render: (v) => <span style={{ color: "var(--accent)" }}>{v}</span> },
            ]}
          />
        )}
        <div className="fd-caption" style={{ marginTop: 8}}>对比默认比较净资产、持仓、净值、份额和校验结果。无法比较的字段不默认为零。</div>
      </Modal>
    </Space>
  );
}

function FindingTable({ rows }: { rows: api.QualityFinding[]; level: ValidationLevel }) {
  return (
    <Table
      className="fd-table"
      rowKey="rule_code"
      size="small"
      pagination={false}
      dataSource={rows}
      columns={[
        { title: "规则编号", dataIndex: "rule_code", width: 180, render: (v) => <span className="mono">{v}</span> },
        { title: "等级", dataIndex: "level", width: 80, render: (v) => <LevelTag level={v} /> },
        { title: "实际值", dataIndex: "actual_value", align: "right", width: 140, render: (v) => <Num>{dec(v, 2)}</Num> },
        { title: "期望值", dataIndex: "expected_value", align: "right", width: 140, render: (v) => <Num>{dec(v, 2)}</Num> },
        { title: "差异", dataIndex: "difference", align: "right", width: 100, render: (v) => <Num>{dec(v, 2)}</Num> },
        { title: "来源定位", dataIndex: "source_location", width: 140, render: (v) => <span className="mono">{v ?? "—"}</span> },
        { title: "说明", dataIndex: "message", ellipsis: true },
        { title: "", width: 60, align: "center", render: () => <SourceLink label="查看来源" hint="定位到原始工作表、行列和字段来源" /> },
      ]}
    />
  );
}
