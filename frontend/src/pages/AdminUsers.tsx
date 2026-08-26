import { useEffect, useState } from "react";
import { Button, Space, Table, Card, Tag, Select, Modal, Form, Input, Drawer, Timeline } from "antd";
import * as api from "@/mock/api";
import * as db from "@/mock/db";
import { PageHeader, StatusRibbon, useToast, useConfirm } from "@/components";
import { timeStr } from "@/utils/format";
import { ROLE_LABEL, USER_STATUS_LABEL, type UserRole, type UserStatus } from "@/utils/constants";

export default function AdminUsers() {
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState<db.UserRow[]>([]);
  const [meta, setMeta] = useState({ page: 1, page_size: 20, total: 0 });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<{ q?: string; role?: string; status?: string }>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState<db.UserRow | null>(null);
  const [loginOpen, setLoginOpen] = useState<db.UserRow | null>(null);
  const [form] = Form.useForm();
  const [resetForm] = Form.useForm();

  async function load() {
    setLoading(true);
    const res = await api.usersList(filters);
    setData(res.data);
    setMeta(res.meta);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filters]);

  async function createUser() {
    await form.validateFields();
    toast.success(`账号已创建（演示）`);
    setCreateOpen(false); form.resetFields(); load();
  }

  async function changeRole(u: db.UserRow, role: UserRole) {
    const ok = await confirm({ title: `修改 ${u.display_name} 的角色为 ${ROLE_LABEL[role]}`, description: "角色变更将写入审计日志。", okText: "确认修改" });
    if (!ok) return;
    await api.userAction(u.id, "role", { role });
    toast.success("角色已修改");
    load();
  }

  async function toggleUser(u: db.UserRow) {
    const action = u.status === "active" ? "禁用" : "启用";
    const ok = await confirm({ title: `${action}账号 ${u.username}`, reasonLabel: "原因", reasonRequired: u.status === "active", danger: u.status === "active", okText: action });
    if (!ok) return;
    await api.userAction(u.id, u.status === "active" ? "disable" : "enable");
    toast.success(`已${action}`);
    load();
  }

  async function resetPassword() {
    await resetForm.validateFields();
    toast.success(`已重置 ${resetOpen?.username} 的密码（演示），原会话已撤销`);
    setResetOpen(null); resetForm.resetFields();
  }

  return (
    <div className="fd-page">
      <PageHeader
        title="账号管理"
        desc="管理员维护账号、角色和会话，任何变更都写入审计日志"
        extra={<Button type="primary" onClick={() => setCreateOpen(true)}>新增账号</Button>}
      />
      <StatusRibbon asOf="—" version="—" coverage={{ available: 0, total: 0 }} quality="valid" />

      <Card style={{ marginTop: 12 }}>
        <Space wrap className="fd-filterbar">
          <Input.Search allowClear placeholder="账号关键字" style={{ width: 180 }} onSearch={(v) => setFilters((f) => ({ ...f, q: v }))} />
          <Select allowClear placeholder="角色" style={{ width: 130 }} onChange={(v) => setFilters((f) => ({ ...f, role: v }))} options={Object.entries(ROLE_LABEL).map(([k, v]) => ({ value: k, label: v }))} />
          <Select allowClear placeholder="状态" style={{ width: 120 }} onChange={(v) => setFilters((f) => ({ ...f, status: v }))} options={Object.entries(USER_STATUS_LABEL).map(([k, v]) => ({ value: k, label: v }))} />
        </Space>
        <Table
          className="fd-table"
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={data}
          pagination={{ pageSize: 20, total: meta.total, size: "small" }}
          columns={[
            { title: "账号", dataIndex: "username", render: (v) => <span className="mono">{v}</span> },
            { title: "显示名称", dataIndex: "display_name" },
            { title: "角色", dataIndex: "role", width: 110, render: (v, r) => (
              <Select size="small" value={v} onChange={(nv) => changeRole(r, nv as UserRole)} style={{ width: 100 }} options={Object.entries(ROLE_LABEL).map(([k, val]) => ({ value: k, label: val }))} />
            ) },
            { title: "状态", dataIndex: "status", width: 80, render: (v) => <Tag color={v === "active" ? "success" : "error"}>{USER_STATUS_LABEL[v as UserStatus]}</Tag> },
            { title: "失败次数", dataIndex: "failed_login_count", width: 80, align: "right" },
            { title: "最后登录", dataIndex: "last_login_at", render: timeStr, width: 160 },
            {
              title: "操作", width: 280, align: "center",
              render: (_, r) => (
                <Space size="small">
                  <Button size="small" type="link" onClick={() => setResetOpen(r)}>重置密码</Button>
                  <Button size="small" type="link" onClick={() => toggleUser(r)} danger={r.status === "active"}>{r.status === "active" ? "禁用" : "启用"}</Button>
                  <Button size="small" type="link" onClick={() => toast.success("已强制退出该账号会话（演示）")}>强制退出</Button>
                  <Button size="small" type="link" onClick={() => setLoginOpen(r)}>登录记录</Button>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Modal open={createOpen} title="新增账号" onCancel={() => setCreateOpen(false)} onOk={createUser} okText="创建">
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item label="账号" name="username" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="显示名称" name="display_name"><Input /></Form.Item>
          <Form.Item label="角色" name="role" rules={[{ required: true }]}>
            <Select options={Object.entries(ROLE_LABEL).map(([k, v]) => ({ value: k, label: v }))} />
          </Form.Item>
          <Form.Item label="初始密码" name="password" rules={[{ required: true }, { min: 8, message: "至少 8 位" }]}><Input.Password /></Form.Item>
        </Form>
      </Modal>

      <Modal open={!!resetOpen} title={`重置密码：${resetOpen?.username}`} onCancel={() => setResetOpen(null)} onOk={resetPassword} okText="重置">
        <Form form={resetForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item label="新密码" name="password" rules={[{ required: true }, { min: 8 }]}><Input.Password /></Form.Item>
          <div className="fd-caption">重置后将撤销该账号所有会话。必须记录原因。</div>
        </Form>
      </Modal>

      <Drawer open={!!loginOpen} title={`登录记录：${loginOpen?.username}`} onClose={() => setLoginOpen(null)} width={480}>
        <Timeline items={[
          { children: `${timeStr(loginOpen?.last_login_at)} · 登录成功 · 192.168.1.10` },
          { children: "2026-08-25 09:12 · 登录成功 · 192.168.1.10" },
          { children: "2026-08-24 18:30 · 退出登录" },
        ]} />
      </Drawer>
    </div>
  );
}
