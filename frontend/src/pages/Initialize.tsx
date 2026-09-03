import { useState } from "react";
import { Form, Input, Button, Alert, Progress } from "antd";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/components";
import { useAuth } from "@/app/auth";
import { apiErrorMessage, isApiError } from "@/api/client";

export default function Initialize() {
  const navigate = useNavigate();
  const toast = useToast();
  const { initialize, refresh } = useAuth();
  const [loading, setLoading] = useState(false);
  const [strength, setStrength] = useState(0);
  const [error, setError] = useState<string | null>(null);

  function calcStrength(v: string) {
    let s = 0;
    if (v.length >= 8) s += 25;
    if (/[A-Z]/.test(v)) s += 25;
    if (/[0-9]/.test(v)) s += 25;
    if (/[^A-Za-z0-9]/.test(v)) s += 25;
    setStrength(s);
  }

  async function onFinish(v: { username: string; password: string; display_name: string }) {
    setLoading(true);
    setError(null);
    try {
      await initialize({
        username: v.username,
        password: v.password,
        display_name: v.display_name || undefined,
      });
      toast.success("管理员创建成功");
      navigate("/dashboard", { replace: true });
    } catch (cause) {
      if (isApiError(cause, 409)) {
        await refresh().catch(() => null);
        navigate("/login", { replace: true });
        return;
      }
      setError(apiErrorMessage(cause, "初始化失败，请稍后重试"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fd-login fd-login--setup">
      <div className="fd-login__card">
        <div className="fd-login__brand">First-time Setup</div>
        <h1 className="fd-login__title">系统初始化</h1>
        <p className="fd-login__subtitle">检测到系统没有管理员账号，请创建首个管理员</p>
        <Alert type="info" showIcon style={{ marginBottom: 20 }} message="初始化完成后该页面将永久关闭" />
        {error && <Alert type="error" showIcon style={{ marginBottom: 16 }} message={error} />}
        <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Form.Item label="管理员账号" name="username" rules={[{ required: true }]}>
            <Input size="large" placeholder="admin" />
          </Form.Item>
          <Form.Item label="显示名称" name="display_name">
            <Input size="large" placeholder="系统管理员" />
          </Form.Item>
          <Form.Item
            label="密码"
            name="password"
            rules={[
              { required: true },
              { min: 8, message: "密码至少 8 位" },
              {
                validator: (_, v) =>
                  v && /[A-Z]/.test(v) && /[0-9]/.test(v)
                    ? Promise.resolve()
                    : Promise.reject(new Error("需包含大写字母和数字")),
              },
            ]}
          >
            <Input.Password size="large" placeholder="至少 8 位，含大写字母和数字" onChange={(e) => calcStrength(e.target.value)} />
          </Form.Item>
          {strength > 0 && (
            <div style={{ marginBottom: 16 }}>
              <Progress percent={strength} size="small" showInfo={false} strokeColor={strength < 50 ? "var(--crimson)" : strength < 75 ? "var(--amber)" : "var(--sage)"} />
            </div>
          )}
          <Form.Item label="确认密码" name="confirm" dependencies={["password"]} rules={[{ required: true }, ({ getFieldValue }) => ({ validator(_, v) { return v === getFieldValue("password") ? Promise.resolve() : Promise.reject(new Error("两次密码不一致")); } })]}>
            <Input.Password size="large" />
          </Form.Item>
          <Button type="primary" htmlType="submit" size="large" block loading={loading}>
            创建管理员并登录
          </Button>
        </Form>
      </div>
    </div>
  );
}
