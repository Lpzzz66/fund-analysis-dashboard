import { useState } from "react";
import { Form, Input, Button, Alert } from "antd";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/app/auth";
import { useToast } from "@/components";
import { apiErrorMessage } from "@/api/client";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onLogin(v: { username: string; password: string }) {
    setLoading(true);
    setError(null);
    try {
      const s = await login(v.username, v.password);
      toast.success(`欢迎，${s.display_name}`);
      navigate("/dashboard");
    } catch (cause) {
      setError(apiErrorMessage(cause, "登录失败，请稍后重试"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fd-login">
      <div className="fd-login__card">
        <div className="fd-login__brand">Fund Valuation Terminal</div>
        <h1 className="fd-login__title">基金估值分析看板</h1>
        <p className="fd-login__subtitle">登录以查看已发布估值数据</p>

        {error && (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
            message={error}
          />
        )}

        <Form layout="vertical" onFinish={onLogin} requiredMark={false}>
          <Form.Item label="账号" name="username" rules={[{ required: true, message: "请输入账号" }]}>
            <Input size="large" autoComplete="username" />
          </Form.Item>
          <Form.Item label="密码" name="password" rules={[{ required: true, message: "请输入密码" }]}>
            <Input.Password
              size="large"
              autoComplete="current-password"
              placeholder="请输入密码"
              iconRender={(v) => (v ? "隐" : "显")}
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" size="large" block loading={loading}>
            登录
          </Button>
        </Form>
      </div>
    </div>
  );
}
