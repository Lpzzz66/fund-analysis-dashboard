import { useEffect, useState } from "react";
import { Card, Form, InputNumber, Button, Select, Descriptions, Tag, Space } from "antd";
import * as api from "@/mock/api";
import { PageHeader, StatusRibbon, useToast } from "@/components";
import { SETTING_DEFINITIONS, type SettingKey } from "@/utils/constants";

export default function AdminSettings() {
  const toast = useToast();
  const [settings, setSettings] = useState<Record<string, { value: number | string; source: string }>>({});
  const [note, setNote] = useState("");
  const [form] = Form.useForm();

  useEffect(() => {
    (async () => {
      const res = await api.systemSettings();
      setSettings(res.data);
      setNote(res.meta.runtime_note);
      form.setFieldsValue(
        Object.fromEntries(Object.entries(res.data).map(([k, v]) => [k, v.value])),
      );
    })();
  }, []);

  async function save() {
    const v = await form.validateFields();
    await api.updateSystemSettings(v);
    toast.success("系统设置已更新，已写入审计");
    const res = await api.systemSettings();
    setSettings(res.data);
  }

  const numericKeys = Object.keys(SETTING_DEFINITIONS).filter((k) => k !== "timezone") as SettingKey[];

  return (
    <div className="fd-page">
      <PageHeader title="系统设置" desc="管理员维护原始文件保留、任务并发、数据迟到容忍等白名单设置" extra={<Button type="primary" onClick={save}>保存设置</Button>} />
      <StatusRibbon asOf="—" version="—" coverage={{ available: 0, total: 0 }} quality="valid" />

      <Space direction="vertical" size={12} style={{ width: "100%", marginTop: 12 }}>
        <Card title={<span className="fd-section-title">设置项</span>}>
          <Form form={form} layout="vertical" style={{ maxWidth: 560 }}>
            {numericKeys.map((k) => {
              const def = SETTING_DEFINITIONS[k];
              return (
                <Form.Item key={k} label={def.label} name={k} rules={[{ required: true }]}>
                  <InputNumber min={"min" in def ? def.min : 0} max={"max" in def ? def.max : 9999} style={{ width: 200 }} />
                </Form.Item>
              );
            })}
            <Form.Item label={SETTING_DEFINITIONS.timezone.label} name="timezone" rules={[{ required: true }]}>
              <Select showSearch options={[{ value: "Asia/Shanghai", label: "Asia/Shanghai (UTC+8)" }, { value: "UTC", label: "UTC" }, { value: "America/New_York", label: "America/New_York" }]} />
            </Form.Item>
          </Form>
        </Card>

        <Card title={<span className="fd-section-title">来源标识</span>} size="small">
          <Descriptions column={1} size="small">
            {Object.entries(settings).map(([k, v]) => (
              <Descriptions.Item key={k} label={SETTING_DEFINITIONS[k as SettingKey]?.label ?? k}>
                <Space>
                  <Tag>{String(v.value)}</Tag>
                  <Tag color={v.source === "database" ? "success" : v.source === "environment" ? "blue" : "default"}>{v.source}</Tag>
                </Space>
              </Descriptions.Item>
            ))}
          </Descriptions>
        </Card>

        <Card size="small">
          <div className="fd-caption">{note}</div>
        </Card>
      </Space>
    </div>
  );
}
