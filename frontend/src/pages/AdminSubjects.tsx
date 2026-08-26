import { useEffect, useState } from "react";
import { Button, Space, Table, Card, Tag, Select, Modal, Form, Input, Switch, DatePicker, Drawer } from "antd";
import * as api from "@/mock/api";
import * as db from "@/mock/db";
import { PageHeader, StatusRibbon, useToast, RoleGuard, useConfirm } from "@/components";
import { dateStr } from "@/utils/format";
import { MAPPING_STATUS_LABEL, type MappingStatus } from "@/utils/constants";

export default function AdminSubjects() {
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState<db.SubjectMappingRow[]>([]);
  const [meta, setMeta] = useState({ page: 1, page_size: 10, total: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [createOpen, setCreateOpen] = useState(false);
  const [sampleOpen, setSampleOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [form] = Form.useForm();

  async function load() {
    setLoading(true);
    const res = await api.subjectMappingsList({ status: statusFilter, page, page_size: 10 });
    setData(res.data);
    setMeta(res.meta);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [statusFilter, page]);

  async function createMapping() {
    const v = await form.validateFields();
    await api.createSubjectMapping(v);
    toast.success("科目映射已新增");
    setCreateOpen(false); form.resetFields(); load();
  }

  async function disableMapping(id: number) {
    const ok = await confirm({ title: "停用映射", description: "停用后只影响未来解析，不修改已发布历史结果。", reasonLabel: "停用原因", okText: "确认停用" });
    if (!ok) return;
    await api.disableSubjectMapping(id);
    toast.success("映射已停用");
    load();
  }

  return (
    <div className="fd-page">
      <PageHeader
        title="科目与模板"
        desc="维护原始科目到标准资产、负债和分析类别的映射"
        extra={
          <RoleGuard cap="adminSubjects">
            <Space>
              <Button onClick={() => setCreateOpen(true)}>新增映射</Button>
              <Button onClick={() => toast.info("导入经过模板校验的映射表（演示）")}>导入映射</Button>
              <Button onClick={() => setTestOpen(true)}>测试规则</Button>
            </Space>
          </RoleGuard>
        }
      />
      <StatusRibbon asOf="—" version="v2026.01" coverage={{ available: 0, total: 0 }} quality="valid" />

      <Card style={{ marginTop: 12 }}>
        <Space wrap className="fd-filterbar">
          <Select allowClear placeholder="状态" style={{ width: 120 }} onChange={(v) => { setStatusFilter(v); setPage(1); }} options={Object.entries(MAPPING_STATUS_LABEL).map(([k, v]) => ({ value: k, label: v }))} />
        </Space>
        <Table
          className="fd-table"
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={data}
          pagination={{ current: page, pageSize: 10, total: meta.total, onChange: setPage, size: "small" }}
          columns={[
            { title: "科目代码/前缀", dataIndex: "subject_code_or_prefix", width: 130, render: (v) => <span className="mono">{v ?? "—"}</span> },
            { title: "原始名称匹配", dataIndex: "raw_name_pattern", width: 130, render: (v) => <span className="mono">{v ?? "—"}</span> },
            { title: "标准类别", dataIndex: "standard_category" },
            { title: "叶子", dataIndex: "is_leaf", width: 60, align: "center", render: (v) => v ? <Tag>是</Tag> : "否" },
            { title: "计入持仓", dataIndex: "include_in_holdings", width: 80, align: "center", render: (v) => v ? <Tag color="success">是</Tag> : "否" },
            { title: "有效期", width: 180, render: (_, r) => `${dateStr(r.valid_from)} ~ ${dateStr(r.valid_to)}` },
            { title: "规则版本", dataIndex: "rule_version", width: 90, render: (v) => <span className="mono">{v}</span> },
            { title: "状态", dataIndex: "status", width: 80, render: (v) => <Tag color={v === "active" ? "success" : "default"}>{MAPPING_STATUS_LABEL[v as MappingStatus]}</Tag> },
            {
              title: "操作", width: 200, align: "center",
              render: (_, r) => (
                <RoleGuard cap="adminSubjects">
                  <Space size="small">
                    <Button size="small" type="link">编辑</Button>
                    {r.status === "active" && <Button size="small" type="link" danger onClick={() => disableMapping(r.id)}>停用</Button>}
                    <Button size="small" type="link" onClick={() => setSampleOpen(true)}>命中样本</Button>
                  </Space>
                </RoleGuard>
              ),
            },
          ]}
        />
        <div className="fd-caption" style={{ marginTop: 8 }}>页面把"科目识别规则"和"原始文件数据"分开。业务员可维护映射，但不能直接改写原始数据。</div>
      </Card>

      <Modal open={createOpen} title="新增科目映射" onCancel={() => setCreateOpen(false)} onOk={createMapping} okText="保存" width={560}>
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Space wrap>
            <Form.Item label="科目代码/前缀" name="subject_code_or_prefix"><Input style={{ width: 200 }} /></Form.Item>
            <Form.Item label="原始名称匹配" name="raw_name_pattern"><Input style={{ width: 200 }} /></Form.Item>
          </Space>
          <div className="fd-caption" style={{ marginBottom: 12 }}>至少填写代码/前缀或名称匹配之一。</div>
          <Form.Item label="标准类别" name="standard_category" rules={[{ required: true }]}><Input /></Form.Item>
          <Space wrap>
            <Form.Item label="是否叶子" name="is_leaf" valuePropName="checked" initialValue={true}><Switch /></Form.Item>
            <Form.Item label="计入持仓" name="include_in_holdings" valuePropName="checked" initialValue={false}><Switch /></Form.Item>
          </Space>
          <Form.Item label="有效期" name="valid_range"><DatePicker.RangePicker style={{ width: "100%" }} /></Form.Item>
        </Form>
      </Modal>

      <Drawer open={sampleOpen} title="最近命中样本" onClose={() => setSampleOpen(false)} width={520}>
        <Table className="fd-table" rowKey="id" size="small" pagination={false}
          dataSource={[{ id: 1, fund: "明远一号", date: "2026-08-22", raw: "110101 沪深A股" }, { id: 2, fund: "星河量化", date: "2026-08-22", raw: "110101 沪深A股" }]}
          columns={[{ title: "产品", dataIndex: "fund" }, { title: "日期", dataIndex: "date", render: dateStr }, { title: "原始科目", dataIndex: "raw", render: (v) => <span className="mono">{v}</span> }]}
        />
      </Drawer>

      <Modal open={testOpen} title="测试规则（试跑）" onCancel={() => setTestOpen(false)} onOk={() => { toast.success("试算完成：将触发 0 个历史事件（演示）"); setTestOpen(false); }} okText="试算">
        <Form layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item label="选择日期范围"><DatePicker.RangePicker style={{ width: "100%" }} /></Form.Item>
        </Form>
        <div className="fd-caption">使用历史文件试跑，不写入正式数据。</div>
      </Modal>
    </div>
  );
}
