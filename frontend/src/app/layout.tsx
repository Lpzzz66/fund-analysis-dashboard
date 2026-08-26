import { useMemo, useState } from "react";
import { Layout, Menu, Avatar, Dropdown, Typography } from "antd";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { ROLE_LABEL } from "@/utils/constants";
import { navForRole } from "@/utils/permissions";
import { useAuth } from "@/app/auth";

const { Sider, Header, Content } = Layout;

interface NavItem {
  key: string;
  label: string;
  path: string;
  group: string;
}

const ALL_NAV: NavItem[] = [
  { key: "dashboard", label: "公司总览", path: "/dashboard", group: "总览" },
  { key: "risk", label: "风险概览", path: "/risk", group: "总览" },
  { key: "funds", label: "产品列表", path: "/funds", group: "产品分析" },
  { key: "imports", label: "导入中心", path: "/imports", group: "数据运营" },
  { key: "reviews", label: "异常复核", path: "/reviews", group: "数据运营" },
  { key: "mail", label: "邮件接入", path: "/mail", group: "数据运营" },
  { key: "adminFunds", label: "产品管理", path: "/admin/funds", group: "基础配置" },
  { key: "adminSubjects", label: "科目与模板", path: "/admin/subjects", group: "基础配置" },
  { key: "adminRiskRules", label: "风险规则", path: "/admin/risk-rules", group: "基础配置" },
  { key: "adminUsers", label: "账号管理", path: "/admin/users", group: "系统管理" },
  { key: "adminAudit", label: "审计日志", path: "/admin/audit", group: "系统管理" },
  { key: "adminSettings", label: "系统设置", path: "/admin/settings", group: "系统管理" },
  { key: "adminRetention", label: "数据保留与备份", path: "/admin/retention", group: "系统管理" },
];

export function AppLayout() {
  const { session, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const loc = useLocation();

  const allowed = useMemo(
    () => new Set(navForRole(session?.role ?? "viewer")),
    [session?.role],
  );

  const items = useMemo(() => {
    const visible = ALL_NAV.filter((n) => allowed.has(n.key));
    const groups = Array.from(new Set(visible.map((v) => v.group)));
    return groups.map((g) => ({
      key: g,
      label: g,
      children: visible
        .filter((v) => v.group === g)
        .map((v) => ({ key: v.path, label: v.label })),
    }));
  }, [allowed]);

  const selected = useMemo(() => {
    const match = ALL_NAV.find((n) => loc.pathname.startsWith(n.path));
    return match ? [match.path] : [loc.pathname];
  }, [loc.pathname]);

  const openKeys = useMemo(
    () => Array.from(new Set(ALL_NAV.filter((n) => allowed.has(n.key)).map((n) => n.group))),
    [allowed],
  );

  const userMenu = {
    items: [
      { key: "logout", label: "退出登录", danger: true },
    ],
    onClick: async ({ key }: { key: string }) => {
      if (key === "logout") {
        try {
          await logout();
        } catch {
          // The provider has already cleared the local session.
        } finally {
          navigate("/login", { replace: true });
        }
      }
    },
  };

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider
        className="fd-sider"
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={212}
        breakpoint="lg"
        style={{ position: "sticky", top: 0, height: "100vh", overflow: "auto" }}
      >
        <div
          style={{
            height: 56,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "0 18px",
            color: "#fff",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: "var(--accent)",
              display: "grid",
              placeItems: "center",
              fontFamily: "var(--mono)",
              fontWeight: 700,
              fontSize: 14,
              flexShrink: 0,
            }}
          >
            FD
          </div>
          {!collapsed && (
            <div style={{ lineHeight: 1.2 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>基金估值看板</div>
              <div style={{ fontSize: 11, color: "#7E92B0", fontFamily: "var(--mono)" }}>
                valuation · v0.1
              </div>
            </div>
          )}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={selected}
          defaultOpenKeys={openKeys}
          items={items}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: "#fff",
            borderBottom: "1px solid var(--rule)",
            padding: "0 24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            height: 56,
            position: "sticky",
            top: 0,
            zIndex: 10,
          }}
        >
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            {ALL_NAV.find((n) => loc.pathname.startsWith(n.path))?.label ?? ""}
          </Typography.Text>
          <Dropdown menu={userMenu} placement="bottomRight">
            <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <Avatar size={30} style={{ background: "var(--ink)", fontFamily: "var(--mono)", fontSize: 12 }}>
                {(session?.display_name ?? "?").slice(0, 1)}
              </Avatar>
              <div style={{ lineHeight: 1.2 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{session?.display_name}</div>
                <div style={{ fontSize: 11, color: "var(--text-2)" }}>
                  {session ? ROLE_LABEL[session.role] : ""}
                </div>
              </div>
            </div>
          </Dropdown>
        </Header>
        <Content>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
