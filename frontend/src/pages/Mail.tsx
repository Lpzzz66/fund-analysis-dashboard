import { useEffect, useState } from "react";
import { Button, Space, Card, Form, Input, Switch, Tag, Table } from "antd";
import * as api from "@/mock/api";
import type * as db from "@/mock/db";
import { PageHeader, StatusRibbon, useToast, RoleGuard } from "@/components";
import { timeStr } from "@/utils/format";

export default function Mail() {
  const toast = useToast();
  const [settings, setSettings] = useState<db.MailSettings | null>(null);
  const [runs, setRuns] = useState<db.MailSyncRun[]>([]);
  const [paused, setPaused] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    (async () => {
      setSettings((await api.mailSettings()).data);
      setRuns((await api.mailSyncRuns()).data);
    })();
  }, []);

  async function saveConfig() {
    const v = await form.validateFields();
    toast.success("邮箱配置已保存（演示）");
    setSettings({ configured: true, host: v.host, port: v.port, username: v.username });
  }

  async function testConnection() {
    setTesting(true);
    try { await new Promise((r) => setTimeout(r, 1000)); toast.success("连接测试成功：认证通过，可访问收件箱"); }
    finally { setTesting(false); }
  }

  async function syncNow() {
    setSyncing(true);
    try {
      const res = await api.mailSync();
      setRuns((prev) => [res.data, ...prev]);
      toast.success(`同步完成：收到 ${res.data.summary.attachments_imported} 个附件`);
    } finally { setSyncing(false); }
  }

  return (
    <div className="fd-page">
      <PageHeader title="邮件接入" desc="配置和监控专用邮箱的 IMAP 拉取" />
      <StatusRibbon asOf="2026-08-22" version="—" coverage={{ available: 8, total: 8 }} quality="valid" />

      <Space direction="vertical" size={12} style={{ width: "100%", marginTop: 12 }}>
        <Card title={<span className="fd-section-title">邮箱配置</span>} extra={<Tag color={settings?.configured ? "success" : "default"}>{settings?.configured ? "已配置" : "未配置"}</Tag>}>
          <Form form={form} layout="vertical" initialValues={settings ?? { host: "imap.qq.com", port: 993 }}>
            <Space wrap>
              <Form.Item label="邮箱地址" name="username" rules={[{ required: true }]}><Input style={{ width: 240 }} placeholder="valuation@company.com.cn" /></Form.Item>
              <Form.Item label="服务器地址" name="host" rules={[{ required: true }]}><Input style={{ width: 200 }} /></Form.Item>
              <Form.Item label="端口" name="port" rules={[{ required: true }]}><Input style={{ width: 100 }} /></Form.Item>
              <Form.Item label="加密方式"><Tag>SSL/TLS</Tag></Form.Item>
              <Form.Item label="授权码" name="password"><Input.Password placeholder="授权码不回显" visibilityToggle /></Form.Item>
            </Space>
            <div className="fd-caption" style={{ marginBottom: 12 }}>授权码只用于认证，保存后不回显、不写入日志。</div>
            <RoleGuard cap="mail">
              <Space>
                <Button type="primary" onClick={saveConfig}>保存配置</Button>
                <Button onClick={testConnection} loading={testing}>测试连接</Button>
                <Button onClick={syncNow} loading={syncing}>立即同步</Button>
                <Space>
                  <Switch checked={!paused} onChange={(v) => setPaused(!v)} size="small" />
                  <span className="fd-caption">{paused ? "已暂停" : "自动同步中"}</span>
                </Space>
                <Button onClick={() => setPaused(!paused)}>{paused ? "恢复同步" : "暂停同步"}</Button>
              </Space>
            </RoleGuard>
          </Form>
        </Card>

        <Card title={<span className="fd-section-title">同步日志</span>} extra={<Button size="small" onClick={() => toast.info("进入导入中心并带上邮件来源筛选（演示）")}>查看附件</Button>}>
          <Table
            className="fd-table"
            rowKey="run_id"
            size="small"
            pagination={{ pageSize: 5, size: "small" }}
            dataSource={runs}
            columns={[
              { title: "同步编号", dataIndex: "run_id", width: 110, render: (v) => <span className="mono" style={{ fontSize: 11 }}>{v.slice(0, 12)}</span> },
              { title: "状态", dataIndex: "status", width: 80, render: (v) => <Tag color={v === "succeeded" ? "success" : "error"}>{v === "succeeded" ? "成功" : "失败"}</Tag> },
              { title: "同步时间", dataIndex: "created_at", render: timeStr, width: 160 },
              { title: "邮件数", render: (_, r) => r.summary.messages_seen, width: 70, align: "right" },
              { title: "附件数", render: (_, r) => r.summary.attachments_imported, width: 70, align: "right" },
              { title: "重复数", render: (_, r) => r.summary.duplicate_attachments, width: 70, align: "right" },
              { title: "忽略数", render: (_, r) => r.summary.ignored_attachments, width: 70, align: "right" },
              { title: "失败数", render: (_, r) => r.summary.failed_attachments, width: 70, align: "right" },
              { title: "错误", render: (_, r) => r.summary.error_codes.length > 0 ? <Tag color="error">{r.summary.error_codes.join(", ")}</Tag> : "—", width: 140 },
            ]}
          />
          <div style={{ marginTop: 8 }}>
            <span className="fd-caption">记录邮件发件人、主题、邮件时间、邮件编号和附件哈希，为后续白名单和主题规则保留入口。</span>
          </div>
        </Card>
      </Space>
    </div>
  );
}
