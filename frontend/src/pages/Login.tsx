import { useState } from "react";
import { Form, Input, Button, Divider, Segmented, Alert } from "antd";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/app/auth";
import { useToast } from "@/components";
import type { UserRole } from "@/utils/constants";
import { ROLE_LABEL } from "@/utils/constants";
import * as api from "@/mock/api";

export default function Login() {
  const { login, switchRole } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [locked, setLocked] = useState<{ seconds: number } | null>(null);
  const [role, setRole] = useState<UserRole>("admin");

  async function onLogin(v: { username: string; password: string }) {
    if (locked) return;
    setLoading(true);
    try {
      const username = role === "admin" ? "admin" : role === "operator" ? "operator" : "viewer";
      const s = await login(username, v.password || "demo");
      toast.success(`欢迎，${s.display_name}`);
      navigate("/dashboard");
    } catch {
      // Demo: simulate lockout after 5 failures with a 15-min countdown.
      setLocked({ seconds: 900 });
      toast.error("账号或密码错误");
    } finally {
      setLoading(false);
    }
  }

  // countdown timer
  if (locked) {
    setTimeout(() => {
      setLocked((p) => (p && p.seconds > 1 ? { seconds: p.seconds - 1 } : null));
    }, 1000);
  }

  return (
    <div className="fd-login">
      <div className="fd-login__card">
        <div className="fd-login__brand">Fund Valuation Terminal</div>
        <h1 className="fd-login__title">基金估值分析看板</h1>
        <p className="fd-login__subtitle">登录以查看已发布估值数据</p>

        <Segmented
          block
          value={role}
          onChange={(v) => {
            setRole(v as UserRole);
            switchRole(v as UserRole);
          }}
          options={[
            { value: "admin", label: ROLE_LABEL.admin },
            { value: "operator", label: ROLE_LABEL.operator },
            { value: "viewer", label: ROLE_LABEL.viewer },
          ]}
          style={{ marginBottom: 16 }}
        />

        {locked && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message={`账号已临时锁定，请等待 ${Math.floor(locked.seconds / 60)} 分 ${locked.seconds % 60} 秒后重试`}
          />
        )}

        <Form layout="vertical" onFinish={onLogin} requiredMark={false}>
          <Form.Item label="账号" name="username" initialValue={role === "admin" ? "admin" : role === "operator" ? "operator" : "viewer"}>
            <Input size="large" autoComplete="username" disabled />
          </Form.Item>
          <Form.Item label="密码" name="password" rules={[{ required: true, message: "请输入密码" }]}>
            <Input.Password
              size="large"
              autoComplete="current-password"
              placeholder="演示密码任意输入"
              iconRender={(v) => (v ? "隐" : "显")}
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" size="large" block loading={loading} disabled={!!locked}>
            登录
          </Button>
        </Form>

        <Divider style={{ margin: "16px 0 12px", borderColor: "var(--rule)" }} />
        <div className="fd-caption" style={{ textAlign: "center" }}>
          演示环境 · 切换上方角色查看不同权限的导航
        </div>
        <Button type="link" size="small" block onClick={async () => {
          await api.initialize("admin", "系统管理员");
          navigate("/dashboard");
        }}>
          首次初始化（创建管理员）
        </Button>
      </div>
    </div>
  );
}
