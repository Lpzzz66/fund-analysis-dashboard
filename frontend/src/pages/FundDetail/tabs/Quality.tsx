import { useEffect, useState } from "react";
import { Alert, Card, Empty, Table, Tag } from "antd";
import * as fundsApi from "@/api/funds";
import type { FundQuality, ImportValidationFinding } from "@/api/types";
import { LevelTag, QualityBadge, Num } from "@/components";
import { dec } from "@/utils/format";
import { VALIDATION_LEVEL_LABEL, type ValidationLevel } from "@/utils/constants";

export function QualityTab({ fundId }: { fundId: number }) {
  const [quality, setQuality] = useState<FundQuality | null>(null); const [error, setError] = useState<string | null>(null);
  useEffect(() => { void fundsApi.quality(fundId).then((r) => setQuality(r.data)).catch(() => setError("数据质量加载失败，请刷新重试")); }, [fundId]);
  if (error) return <Alert type="error" showIcon message={error} />;
  if (!quality) return <Card loading />;
  const levels: ValidationLevel[] = ["critical", "warning", "info"];
  return <div><div style={{ marginBottom: 12 }}>质量状态：<QualityBadge status={quality.quality_status} /> · 估值日：{quality.valuation_date ?? "—"}</div>{levels.map((level) => { const rows = quality.validation.filter((f) => f.level === level); return <Card key={level} size="small" title={<Tag color={level === "critical" ? "error" : level === "warning" ? "warning" : "default"}>{VALIDATION_LEVEL_LABEL[level]} · {rows.length}</Tag>} style={{ marginBottom: 12 }}>{rows.length ? <FindingTable rows={rows} /> : <Empty description={`无${VALIDATION_LEVEL_LABEL[level]}校验项`} image={Empty.PRESENTED_IMAGE_SIMPLE} />}</Card>; })}</div>;
}
function FindingTable({ rows }: { rows: ImportValidationFinding[] }) {
  return <Table rowKey={(r) => r.rule_code} size="small" pagination={false} dataSource={rows} columns={[{ title: "规则编号", dataIndex: "rule_code" }, { title: "等级", dataIndex: "level", render: (v: ValidationLevel) => <LevelTag level={v} /> }, { title: "实际值", dataIndex: "actual_value", render: (v: string | null) => <Num>{dec(v, 2)}</Num> }, { title: "期望值", dataIndex: "expected_value", render: (v: string | null) => <Num>{dec(v, 2)}</Num> }, { title: "差异", dataIndex: "difference", render: (v: string | null) => <Num>{dec(v, 2)}</Num> }, { title: "来源位置", dataIndex: "source_location", render: (v: string | null) => v ?? "—" }, { title: "说明", dataIndex: "message" }]} />;
}
