import { useEffect, useState } from "react";
import { Button, Space, Card, Tag, Select, Input, Form, Modal, DatePicker, Empty, Descriptions, Row, Col } from "antd";
import { useSearchParams } from "react-router-dom";
import * as api from "@/mock/api";
import type * as db from "@/mock/db";
import { Num, PageHeader, StatusRibbon, useToast, RoleGuard, SourceLink, LevelTag, useConfirm } from "@/components";
import { dec, dateStr } from "@/utils/format";
import { VALIDATION_LEVEL_LABEL } from "@/utils/constants";

export default function Reviews() {
  const [params] = useSearchParams();
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState<db.ReviewItem[]>([]);
  const [selected, setSelected] = useState<db.ReviewItem | null>(null);
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof api.reviewDetail>>["data"] | null>(null);
  const [filters, setFilters] = useState<{ severity?: string; status?: string }>({});
  const [ackOpen, setAckOpen] = useState(false);
  const [exceptionOpen, setExceptionOpen] = useState(false);
  const [form] = Form.useForm();
  const [excForm] = Form.useForm();

  useEffect(() => {
    (async () => {
      const res = await api.reviewsList();
      let filtered = res.data;
      const fundFilter = params.get("fund");
      if (fundFilter) filtered = filtered.filter((r) => r.fund_id === Number(fundFilter));
      if (filters.severity === "critical") filtered = filtered.filter((r) => r.critical_count > 0);
      if (filters.severity === "warning") filtered = filtered.filter((r) => r.warning_count > 0 && r.critical_count === 0);
      setItems(filtered);
    })();
  }, [params, filters]);

  useEffect(() => {
    if (selected) (async () => setDetail((await api.reviewDetail(selected.id)).data))();
    else setDetail(null);
  }, [selected]);

  async function ackAndPublish() {
    const v = await form.validateFields();
    await api.versionAction(selected!.id, "acknowledge", { note: v.note, allow_publish: v.allow_publish });
    toast.success("已确认并发布");
    setAckOpen(false); form.resetFields(); setSelected(null);
    (async () => setItems((await api.reviewsList()).data))();
  }

  async function reject() {
    const ok = await confirm({ title: "驳回版本", description: "填写驳回原因后状态变为已驳回。", reasonLabel: "驳回原因", reasonRequired: true, danger: true, okText: "确认驳回" });
    if (!ok) return;
    await api.versionAction(selected!.id, "reject", {});
    toast.success("已驳回");
    setSelected(null);
    (async () => setItems((await api.reviewsList()).data))();
  }

  async function markException() {
    await excForm.validateFields();
    toast.success("已标记为已知例外（演示）");
    setExceptionOpen(false); excForm.resetFields();
  }

  return (
    <div className="fd-page">
      <PageHeader title="异常复核" desc="集中处理格式错误、对账差异、重复日期、模板变化和异常跳变" />
      <StatusRibbon asOf="2026-08-22" version="—" coverage={{ available: 8, total: 8 }} quality="warning" />

      <Row gutter={12} style={{ marginTop: 12 }}>
        <Col xs={24} lg={9}>
          <Card title={<span className="fd-section-title">复核队列</span>} size="small" styles={{ body: { padding: 12 } }}>
            <Space wrap className="fd-filterbar">
              <Select allowClear placeholder="严重度" style={{ width: 110 }} onChange={(v) => setFilters((f) => ({ ...f, severity: v }))} options={[{ value: "critical", label: "阻断级" }, { value: "warning", label: "警告级" }]} />
              <Select allowClear placeholder="处理状态" style={{ width: 110 }} onChange={(v) => setFilters((f) => ({ ...f, status: v }))} options={[{ value: "pending", label: "待处理" }]} />
            </Space>
            <div style={{ maxHeight: 520, overflow: "auto" }}>
              {items.length === 0 ? <Empty description="无待复核项" image={Empty.PRESENTED_IMAGE_SIMPLE} /> : items.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setSelected(item)}
                  style={{
                    padding: "10px 12px",
                    marginBottom: 6,
                    borderRadius: 6,
                    cursor: "pointer",
                    border: selected?.id === item.id ? "1px solid var(--accent)" : "1px solid var(--rule)",
                    background: selected?.id === item.id ? "#F0F5FB" : "#fff",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{item.fund_name}</span>
                    <span className="fd-caption mono">{item.valuation_date}</span>
                  </div>
                  <Space size={4} style={{ marginTop: 4 }}>
                    <Tag color={item.critical_count > 0 ? "error" : "default"} style={{ marginInlineEnd: 0 }}>{VALIDATION_LEVEL_LABEL.critical} {item.critical_count}</Tag>
                    <Tag color="warning" style={{ marginInlineEnd: 0 }}>{VALIDATION_LEVEL_LABEL.warning} {item.warning_count}</Tag>
                    <span className="mono" style={{ fontSize: 11, color: "var(--text-2)" }}>v{item.version_no}</span>
                  </Space>
                </div>
              ))}
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={15}>
          <Card title={<span className="fd-section-title">异常详情</span>} size="small">
            {!selected || !detail ? (
              <Empty description="从左侧选择待复核项查看详情" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <div>
                <Descriptions size="small" column={2} style={{ marginBottom: 12 }}>
                  <Descriptions.Item label="产品">{detail.item?.fund_name}</Descriptions.Item>
                  <Descriptions.Item label="估值日">{dateStr(detail.item?.valuation_date)}</Descriptions.Item>
                  <Descriptions.Item label="版本"><span className="mono">v{detail.item?.version_no}</span></Descriptions.Item>
                  <Descriptions.Item label="是否影响看板"><Tag color="warning">是，当前为待复核</Tag></Descriptions.Item>
                </Descriptions>

                <h4 className="fd-eyebrow" style={{ margin: "12px 0 8px" }}>校验发现</h4>
                {detail.findings.length === 0 ? <Empty description="无校验发现" image={Empty.PRESENTED_IMAGE_SIMPLE} /> : detail.findings.map((f, i) => (
                  <Card key={i} size="small" style={{ marginBottom: 8 }}>
                    <Space align="start" direction="vertical" size={2}>
                      <Space>
                        <LevelTag level={f.level} />
                        <span className="mono" style={{ fontSize: 12, color: "var(--text-2)" }}>规则 {f.rule_code}</span>
                      </Space>
                      <span>{f.message}</span>
                      <Space size="large">
                        <span className="fd-caption">实际值 <Num>{dec(f.actual_value, 2)}</Num></span>
                        <span className="fd-caption">期望值 <Num>{dec(f.expected_value, 2)}</Num></span>
                        <span className="fd-caption">差异 <Num>{dec(f.difference, 2)}</Num></span>
                        <span className="fd-caption">容忍 ±5,000</span>
                      </Space>
                      <span className="fd-caption">来源定位 <span className="mono">{f.source_location}</span> · <SourceLink hint="原始文件信息和字段来源" /></span>
                    </Space>
                  </Card>
                ))}

                <h4 className="fd-eyebrow" style={{ margin: "12px 0 8px" }}>版本差异</h4>
                <Card size="small">
                  <Space direction="vertical" size={2}>
                    {detail.diff.map((d, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                        <span>{d.field}</span>
                        <Space>
                          <span className="mono" style={{ color: "var(--text-2)" }}>{d.previous}</span>
                          <span>→</span>
                          <span className="mono">{d.current}</span>
                          <span className="mono" style={{ color: "var(--accent)" }}>{d.change}</span>
                        </Space>
                      </div>
                    ))}
                  </Space>
                </Card>

                <RoleGuard cap="publish">
                  <Space wrap style={{ marginTop: 16 }}>
                    <Button onClick={() => toast.info("使用当前解析规则重新生成标准化结果（演示）")}>重新解析</Button>
                    <Button type="primary" onClick={() => setAckOpen(true)}>确认无误并发布</Button>
                    <Button danger onClick={reject}>驳回</Button>
                    <Button onClick={() => setExceptionOpen(true)}>标记为已知例外</Button>
                    <Button onClick={() => toast.info("管理员可用，撤销已知例外（演示）")}>撤销例外</Button>
                  </Space>
                </RoleGuard>
              </div>
            )}
          </Card>
        </Col>
      </Row>

      <Modal open={ackOpen} title="确认无误并发布" onCancel={() => setAckOpen(false)} onOk={ackAndPublish} okText="确认发布">
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item label="复核意见" name="note" rules={[{ required: true, message: "请填写复核意见" }]}>
            <Input.TextArea rows={3} placeholder="说明复核结论" maxLength={1000} showCount />
          </Form.Item>
          <Form.Item label="允许发布" name="allow_publish" valuePropName="checked" initialValue={true}>
            <Select options={[{ value: true, label: "是，确认为正常版本" }, { value: false, label: "否，仅记录意见" }]} defaultValue={true} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal open={exceptionOpen} title="标记为已知例外" onCancel={() => setExceptionOpen(false)} onOk={markException} okText="确认标记">
        <Form form={excForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item label="有效期" name="valid_range" rules={[{ required: true }]}>
            <DatePicker.RangePicker style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item label="适用范围" name="scope" rules={[{ required: true }]}>
            <Input placeholder="如：仅该产品 / 全部产品" />
          </Form.Item>
          <Form.Item label="理由" name="reason" rules={[{ required: true }]}>
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
        <div className="fd-caption">已知例外需填写有效期和适用范围，避免永久吞掉真实异常。</div>
      </Modal>
    </div>
  );
}
