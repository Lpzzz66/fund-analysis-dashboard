import { useCallback, useEffect, useState } from "react";
import { Alert, Card, Collapse, Empty, Space, Table, Tag } from "antd";
import * as fundsApi from "@/api/funds";
import { isApiError } from "@/api/client";
import type { FundQuality, ImportValidationFinding } from "@/api/types";
import { LevelTag, QualityBadge, Num, Truncate } from "@/components";
import { dec } from "@/utils/format";
import { type ValidationLevel } from "@/utils/constants";
import { useAuth } from "@/app/auth";

export function QualityTab({ fundId }: { fundId: number }) {
  const { session } = useAuth();
  const [quality, setQuality] = useState<FundQuality | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await fundsApi.quality(fundId);
      setQuality(r.data);
    } catch (caught) {
      const detail = isApiError(caught) ? caught.detail : "请刷新重试";
      console.error("quality load failed", { fundId, status: isApiError(caught) ? caught.status : undefined, detail });
      setError(`数据质量加载失败（${isApiError(caught) ? caught.status : "unknown"}）：${detail}`);
    }
  }, [fundId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <Alert type="error" showIcon message={error} />;
  if (!quality) return <Card loading />;
  const criticalRows = quality.validation.filter((f) => f.level === "critical");
  const warningRows = quality.validation.filter((f) => f.level === "warning");
  const infoRows = quality.validation.filter((f) => f.level === "info");
  const issueRows = [...criticalRows, ...warningRows];
  const isViewer = session?.role === "viewer";
  return (
    <div>
      <Card className="fd-quality-summary" style={{ marginBottom: 12 }}>
        <div className="fd-quality-summary__head">
          <div>
            <div className="fd-quality-summary__label">数据质量</div>
            <strong className="fd-quality-summary__title">
              {issueRows.length ? `发现 ${issueRows.length} 项需要关注` : "校验通过"}
            </strong>
            <div className="fd-quality-summary__meta">估值日：{quality.valuation_date ?? "—"}</div>
          </div>
          <QualityBadge status={quality.quality_status} showLabel />
        </div>
        <Space wrap className="fd-quality-summary__stats">
          <Tag color={criticalRows.length ? "error" : "default"}>阻断级 {criticalRows.length}</Tag>
          <Tag color={warningRows.length ? "warning" : "default"}>警告级 {warningRows.length}</Tag>
          <Tag color="success">基础校验通过 {infoRows.length}</Tag>
        </Space>
      </Card>

      {issueRows.length ? (
        <Card size="small" title={<Tag color="warning">需要关注 · {issueRows.length} 项</Tag>} style={{ marginBottom: 12 }}>
          {isViewer ? (
            <div className="fd-quality-issues">
              {issueRows.map((finding, index) => (
                <div className="fd-quality-issue" key={`${finding.rule_code}-${index}`}>
                  <LevelTag level={finding.level} />
                  <span>{finding.message}</span>
                </div>
              ))}
            </div>
          ) : <FindingTable rows={issueRows} />}
        </Card>
      ) : (
        <Card size="small" title="异常明细" style={{ marginBottom: 12 }}>
          <Empty description="当前没有阻断级或警告级问题" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </Card>
      )}

      {infoRows.length > 0 && (
        isViewer ? (
          <Card size="small" title={`已通过校验 · ${infoRows.length} 项`}>
            资产负债、份额净资产、持仓市值等基础一致性检查均已完成，无需处理。
          </Card>
        ) : (
          <Collapse
            items={[{ key: "technical", label: `查看技术校验明细（${infoRows.length} 项已通过）`, children: <FindingTable rows={infoRows} /> }]}
          />
        )
      )}
    </div>
  );
}

function FindingTable({ rows }: { rows: ImportValidationFinding[] }) {
  return (
    <Table
      rowKey={(r, index) => `${r.rule_code}-${index ?? 0}`}
      size="small"
      pagination={false}
      dataSource={rows}
      columns={[
        { title: "规则编号", dataIndex: "rule_code" },
        { title: "等级", dataIndex: "level", render: (v: ValidationLevel) => <LevelTag level={v} /> },
        { title: "实际值", dataIndex: "actual_value", render: (v: string | null) => <Num>{dec(v, 2)}</Num> },
        { title: "期望值", dataIndex: "expected_value", render: (v: string | null) => <Num>{dec(v, 2)}</Num> },
        { title: "差异", dataIndex: "difference", render: (v: string | null) => <Num>{dec(v, 2)}</Num> },
        { title: "来源位置", dataIndex: "source_location", render: (v: string | null) => <Truncate value={v ?? ""} /> },
        { title: "说明", dataIndex: "message", render: (v: string | null) => <Truncate value={v ?? ""} /> },
      ]}
    />
  );
}
