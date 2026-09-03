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
      <div className="fd-login__ambient" aria-hidden="true" />
      <section className="fd-login__showcase">
        <div className="fd-login__badge">PRIVATE FUND OPERATIONS</div>
        <div className="fd-login__hero-copy">
          <p className="fd-login__eyebrow">让每日估值成为清晰的经营视图</p>
          <h1>一处查看全部基金的<br />规模、收益与风险。</h1>
          <p className="fd-login__hero-desc">统一接收估值文件，保留来源与审计轨迹，让团队在同一张经营视图上协作。</p>
        </div>
        <div className="fd-login__stats">
          <div><strong>15</strong><span>基金统一管理</span></div>
          <div><strong>3级</strong><span>角色权限</span></div>
          <div><strong>100%</strong><span>发布数据可追溯</span></div>
        </div>
      </section>
      <section className="fd-login__card">
        <div className="fd-login__brand-row">
          <div className="fd-brand-mark" aria-hidden="true"><i /><i /><i /><i /></div>
          <div><strong>基金运营看板</strong><span>Fund Operations</span></div>
        </div>
        <div className="fd-login__copy">
          <span className="fd-eyebrow">内部数据工作台</span>
          <h2 className="fd-login__title">欢迎回来</h2>
          <p className="fd-login__subtitle">登录后查看已发布估值、风险和数据质量。</p>
        </div>

        {error && <Alert type="error" showIcon style={{ marginBottom: 16 }} message={error} />}

        <Form layout="vertical" onFinish={onLogin} requiredMark={false}>
          <Form.Item label="账号" name="username" rules={[{ required: true, message: "请输入账号" }]}>
            <Input size="large" autoComplete="username" placeholder="输入账号" />
          </Form.Item>
          <Form.Item label="密码" name="password" rules={[{ required: true, message: "请输入密码" }]}>
            <Input.Password size="large" autoComplete="current-password" placeholder="输入密码" />
          </Form.Item>
          <Button type="primary" htmlType="submit" size="large" block loading={loading}>
            登录系统
          </Button>
        </Form>
        <p className="fd-login__security">会话使用 HttpOnly Cookie，敏感信息不保存在浏览器。</p>
      </section>
    </div>
  );
}
