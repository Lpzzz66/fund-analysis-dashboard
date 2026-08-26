import { useEffect, useState } from "react";
import { Card, Descriptions, Tag, Table, Button, Space, Row, Col } from "antd";
import * as api from "@/mock/api";
import * as db from "@/mock/db";
import { PageHeader, StatusRibbon, useToast, Num } from "@/components";
import { timeStr } from "@/utils/format";

export default function AdminRetention() {
  const toast = useToast();
  const [status, setStatus] = useState<db.RetentionStatus | null>(null);

  useEffect(() => {
    (async () => setStatus((await api.retentionStatus()).data))();
  }, []);

  return (
    <div className="fd-page">
      <PageHeader title="数据保留与备份" desc="原始文件滚动清理状态、备份策略与最近备份结果" />
      <StatusRibbon asOf="—" version="—" coverage={{ available: 0, total: 0 }} quality="valid" />

      <Space direction="vertical" size={12} style={{ width: "100%", marginTop: 12 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={8}>
            <Card className="fd-kpi">
              <div className="fd-kpi__label">原始文件总数</div>
              <div className="fd-kpi__value">{status ? <Num>{status.total_files}</Num> : "—"}</div>
              <div className="fd-kpi__sub">保留期内</div>
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card className="fd-kpi">
              <div className="fd-kpi__label">即将到期</div>
              <div className="fd-kpi__value" style={{ color: "var(--amber)" }}>{status ? <Num>{status.expiring_soon}</Num> : "—"}</div>
              <div className="fd-kpi__sub">7 天内到期</div>
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card className="fd-kpi">
              <div className="fd-kpi__label">最近备份</div>
              <div className="fd-kpi__value" style={{ color: status?.last_backup_result === "success" ? "var(--sage)" : "var(--crimson)" }}>
                {status?.last_backup_result === "success" ? "成功" : status?.last_backup_result === "failure" ? "失败" : "—"}
              </div>
              <div className="fd-kpi__sub">{status ? timeStr(status.last_backup_at) : "—"}</div>
            </Card>
          </Col>
        </Row>

        <Card title={<span className="fd-section-title">清理与备份状态</span>}>
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="保留天数">365 天</Descriptions.Item>
            <Descriptions.Item label="备份保留天数">30 天</Descriptions.Item>
            <Descriptions.Item label="上次清理时间">{status ? timeStr(status.last_cleanup_at) : "—"}</Descriptions.Item>
            <Descriptions.Item label="上次备份时间">{status ? timeStr(status.last_backup_at) : "—"}</Descriptions.Item>
            <Descriptions.Item label="清理执行前检查">
              <Space direction="vertical" size={2}>
                <span><Tag color="success">待复核任务</Tag> 无引用</span>
                <span><Tag color="success">任务状态</Tag> 已完成</span>
                <span><Tag color="success">审计锁</Tag> 未锁定</span>
                <span><Tag color="success">备份</Tag> 已完成</span>
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="清理范围">
              只清理 source_file 对应的原始对象，不删除标准化数据和审计记录。
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <Card title={<span className="fd-section-title">清理规则</span>} extra={<Space><Button onClick={() => toast.info("预演清理（演示）")}>预演清理</Button><Button onClick={() => toast.success("已执行清理并写入审计日志（演示）")}>执行清理</Button></Space>}>
          <div className="fd-caption" style={{ marginBottom: 12 }}>执行前检查四项：到期日、待复核任务引用、审计锁定、备份完成。</div>
          <Table
            className="fd-table"
            rowKey="step"
            size="small"
            pagination={false}
            dataSource={[
              { step: 1, rule: "到期日是否已到", check: "是" },
              { step: 2, rule: "是否仍有待复核任务引用", check: "否" },
              { step: 3, rule: "是否已经完成备份", check: "是" },
              { step: 4, rule: "是否被审计锁定", check: "否" },
            ]}
            columns={[
              { title: "步骤", dataIndex: "step", width: 60, align: "center" },
              { title: "检查项", dataIndex: "rule" },
              { title: "结果", dataIndex: "check", width: 100, render: (v) => <Tag color={v === "是" ? "success" : "default"}>{v}</Tag> },
            ]}
          />
        </Card>
      </Space>
    </div>
  );
}
