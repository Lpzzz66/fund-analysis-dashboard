import { useEffect, useState } from "react";
import { Button, Space, Table, Input, Select, DatePicker, Card, Tag, Modal, Form } from "antd";
import { useNavigate } from "react-router-dom";
import * as api from "@/mock/api";
import { Num, PageHeader, StatusRibbon, useToast, RoleGuard, QualityBadge, SourceLink, useConfirm } from "@/components";
import { dateStr, pct, dec, exportCsv } from "@/utils/format";
import { strategyOptions } from "@/mock/db";
import type { QualityStatus } from "@/utils/constants";

const { RangePicker } = DatePicker;

export default function Funds() {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState<api.FundListItem[]>([]);
  const [meta, setMeta] = useState({ page: 1, page_size: 10, total: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<api.FundListParams>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();

  async function load() {
    setLoading(true);
    const res = await api.fundsList({ ...filters, page, page_size: 10 });
    setData(res.data);
    setMeta(res.meta);
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, page]);

  async function onCreate() {
    const v = await form.validateFields();
    if (!v.aliases || v.aliases.length === 0) {
      toast.error("必须填写至少一个别名");
      return;
    }
    toast.success("产品已创建（演示）");
    setCreateOpen(false);
    form.resetFields();
    load();
  }

  async function toggleStatus(fund: api.FundListItem) {
    const action = fund.status === "active" ? "停用" : "启用";
    const ok = await confirm({
      title: `${action}产品：${fund.name}`,
      description: fund.status === "active" ? "停用产品将不再进入看板查询，但不删除历史数据。" : "启用后产品将重新进入看板。",
      reasonLabel: fund.status === "active" ? "停用原因" : "启用原因",
      reasonRequired: fund.status === "active",
      danger: fund.status === "active",
      okText: action,
    });
    if (!ok) return;
    toast.success(`已${action}（演示）`);
    load();
  }

  return (
    <div className="fd-page">
      <PageHeader
        title="产品列表"
        desc="按产品查看最新状态、快速进入详情和维护产品主数据"
        extra={
          <Space>
            <Button onClick={() => { exportCsv(data.map((f) => ({ 产品: f.name, 代码: f.product_code, 状态: f.status, 估值日: f.valuation_date, 单位净值: f.unit_nav, 日收益: f.daily_return })), "产品列表.csv", "2026-08-22"); toast.success("已导出列表"); }}>导出列表</Button>
            <RoleGuard cap="write">
              <Button type="primary" onClick={() => setCreateOpen(true)}>新增产品</Button>
            </RoleGuard>
          </Space>
        }
      />
      <StatusRibbon asOf="2026-08-22" version="v1 @ 2026-08-22" coverage={{ available: 7, total: 8 }} quality="valid" />

      <Card style={{ marginTop: 12 }}>
        <Space wrap className="fd-filterbar">
          <Input.Search allowClear placeholder="产品名称" style={{ width: 180 }} onSearch={(v) => { setFilters((f) => ({ ...f, q: v })); setPage(1); }} />
          <Select allowClear placeholder="状态" style={{ width: 120 }} onChange={(v) => { setFilters((f) => ({ ...f, status: v })); setPage(1); }} options={[{ value: "active", label: "启用" }, { value: "inactive", label: "停用" }]} />
          <Select allowClear placeholder="策略" style={{ width: 140 }} onChange={(v) => { setFilters((f) => ({ ...f, strategy: v })); setPage(1); }} options={strategyOptions.map((s) => ({ value: s, label: s }))} />
          <Select allowClear placeholder="数据质量" style={{ width: 120 }} onChange={(v) => { setFilters((f) => ({ ...f, quality: v })); setPage(1); }} options={[{ value: "valid", label: "有效" }, { value: "warning", label: "警告" }, { value: "pending", label: "处理中" }]} />
          <Select allowClear placeholder="有无风险" style={{ width: 120 }} onChange={(v) => { setFilters((f) => ({ ...f, has_risk: v })); setPage(1); }} options={[{ value: true, label: "有风险事件" }, { value: false, label: "无风险事件" }]} />
          <RangePicker style={{ width: 240 }} onChange={() => { setFilters((f) => ({ ...f })); setPage(1); }} />
        </Space>
        <Table
          className="fd-table"
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={data}
          pagination={{ current: page, pageSize: 10, total: meta.total, onChange: setPage, showSizeChanger: false, size: "small" }}
          columns={[
            { title: "产品名称", dataIndex: "name", render: (v, r) => <a onClick={() => navigate(`/funds/${r.id}`)}>{v}</a> },
            { title: "代码", dataIndex: "product_code", width: 100, render: (v) => <span className="mono">{v ?? "—"}</span> },
            { title: "策略", dataIndex: "strategy", width: 110 },
            { title: "负责人", dataIndex: "manager", width: 90 },
            { title: "状态", dataIndex: "status", width: 80, render: (v) => <Tag color={v === "active" ? "success" : "default"}>{v === "active" ? "启用" : "停用"}</Tag> },
            { title: "估值日", dataIndex: "valuation_date", render: dateStr, width: 110 },
            { title: "单位净值", dataIndex: "unit_nav", align: "right", width: 100, render: (v) => <Num>{dec(v, 4)}</Num> },
            { title: "日收益", dataIndex: "daily_return", align: "right", width: 100, render: (v) => <Num style={{ color: Number(v) >= 0 ? "var(--sage)" : "var(--crimson)" }}>{pct(v)}</Num> },
            { title: "质量", dataIndex: "quality_status", width: 90, align: "center", render: (v) => <QualityBadge status={(v as QualityStatus) ?? "valid"} showLabel={false} /> },
            { title: "风险", dataIndex: "has_risk", width: 70, align: "center", render: (v) => v ? <Tag color="error">有</Tag> : <span className="fd-caption">—</span> },
            {
              title: "操作", width: 200, align: "center",
              render: (_, r) => (
                <Space size="small">
                  <Button size="small" type="link" onClick={() => navigate(`/funds/${r.id}`)}>详情</Button>
                  <RoleGuard cap="adminFunds">
                    <Button size="small" type="link" onClick={() => navigate(`/admin/funds?fund=${r.id}`)}>编辑</Button>
                    <Button size="small" type="link" danger={r.status === "active"} onClick={() => toggleStatus(r)}>{r.status === "active" ? "停用" : "启用"}</Button>
                  </RoleGuard>
                </Space>
              ),
            },
            { title: "来源", width: 60, align: "center", render: (_, r) => <SourceLink hint={`产品 / ${r.valuation_date} / v1 / 原始文件`} /> },
          ]}
        />
      </Card>

      <Modal open={createOpen} title="新增产品" onCancel={() => setCreateOpen(false)} onOk={onCreate} okText="保存" destroyOnClose width={560}>
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item label="标准名称" name="standard_name" rules={[{ required: true, message: "请填写标准名称" }]}>
            <Input placeholder="如：明远一号" />
          </Form.Item>
          <Form.Item label="产品代码" name="product_code">
            <Input placeholder="可选" />
          </Form.Item>
          <Form.Item label="成立日期" name="establishment_date">
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item label="策略说明" name="strategy">
            <Select allowClear options={strategyOptions.map((s) => ({ value: s, label: s }))} />
          </Form.Item>
          <Form.Item label="负责人" name="manager"><Input /></Form.Item>
          <Form.Item label="产品别名（至少一个）" name="aliases" rules={[{ required: true }]}>
            <Select mode="tags" placeholder="输入别名后回车，可添加多个" tokenSeparators={[","]} />
          </Form.Item>
          <div className="fd-caption">别名保存前将执行去重和冲突检查，防止一个别名匹配多个产品。</div>
        </Form>
      </Modal>
    </div>
  );
}
