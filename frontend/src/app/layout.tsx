import { useMemo, useState } from "react";
import { Avatar, Dropdown } from "antd";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { ROLE_LABEL } from "@/utils/constants";
import { navForRole } from "@/utils/permissions";
import { useAuth } from "@/app/auth";

interface NavItem {
  key: string;
  label: string;
  path: string;
  group: string;
  icon: string;
}

const ALL_NAV: NavItem[] = [
  { key: "dashboard", label: "公司总览", path: "/dashboard", group: "总览", icon: "◐" },
  { key: "risk", label: "风险概览", path: "/risk", group: "总览", icon: "!" },
  { key: "funds", label: "产品列表", path: "/funds", group: "产品分析", icon: "▦" },
  { key: "imports", label: "导入中心", path: "/imports", group: "数据运营", icon: "↑" },
  { key: "reviews", label: "异常复核", path: "/reviews", group: "数据运营", icon: "✓" },
  { key: "mail", label: "邮件接入", path: "/mail", group: "数据运营", icon: "@" },
  { key: "adminFunds", label: "产品管理", path: "/admin/funds", group: "基础配置", icon: "▥" },
  { key: "adminSubjects", label: "科目与模板", path: "/admin/subjects", group: "基础配置", icon: "≡" },
  { key: "adminRiskRules", label: "风险规则", path: "/admin/risk-rules", group: "基础配置", icon: "◇" },
  { key: "adminUsers", label: "账号管理", path: "/admin/users", group: "系统管理", icon: "◉" },
  { key: "adminAudit", label: "审计日志", path: "/admin/audit", group: "系统管理", icon: "↗" },
  { key: "adminSettings", label: "系统设置", path: "/admin/settings", group: "系统管理", icon: "⚙" },
  { key: "adminRetention", label: "数据保留与备份", path: "/admin/retention", group: "系统管理", icon: "◷" },
];

const GROUP_EN: Record<string, string> = {
  "总览": "Overview",
  "产品分析": "Funds",
  "数据运营": "Operations",
  "基础配置": "Catalog",
  "系统管理": "System",
};

function Brand() {
  return (
    <div className="fd-brand">
      <div className="fd-brand-mark" aria-hidden="true"><i /><i /><i /><i /></div>
      <div>
        <strong>基金运营看板</strong>
        <span>Fund Operations</span>
      </div>
    </div>
  );
}

export function AppLayout() {
  const { session, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const loc = useLocation();
  const allowed = useMemo(() => new Set(navForRole(session?.role ?? "viewer")), [session?.role]);
  const visibleNav = useMemo(() => ALL_NAV.filter((item) => allowed.has(item.key)), [allowed]);
  const groups = useMemo(() => Array.from(new Set(visibleNav.map((item) => item.group))), [visibleNav]);
  const selected = ALL_NAV.find((item) => loc.pathname.startsWith(item.path));
  const userMenu = {
    items: [{ key: "logout", label: "退出登录", danger: true }],
    onClick: async ({ key }: { key: string }) => {
      if (key !== "logout") return;
      try { await logout(); } finally { navigate("/login", { replace: true }); }
    },
  };

  function go(path: string) {
    navigate(path);
    setMobileOpen(false);
  }

  return (
    <div className="fd-shell">
      <div className={`fd-mobile-backdrop ${mobileOpen ? "is-visible" : ""}`} onClick={() => setMobileOpen(false)} />
      <aside className={`fd-sidebar ${mobileOpen ? "is-open" : ""}`} aria-label="主导航">
        <Brand />
        <nav className="fd-nav">
          {groups.map((group) => (
            <section className="fd-nav-group" key={group}>
              <div className="fd-nav-label"><span>{group}</span><small>{GROUP_EN[group]}</small></div>
              {visibleNav.filter((item) => item.group === group).map((item) => (
                <button
                  type="button"
                  key={item.key}
                  className={`fd-nav-item ${selected?.path === item.path ? "is-active" : ""}`}
                  onClick={() => go(item.path)}
                >
                  <span className="fd-nav-icon" aria-hidden="true">{item.icon}</span>
                  <span>{item.label}</span>
                  {item.key === "risk" && <span className="fd-nav-signal" aria-label="风险事件提醒" />}
                </button>
              ))}
            </section>
          ))}
        </nav>
        <div className="fd-sidebar-footer">
          <Avatar size={34} className="fd-user-avatar">{(session?.display_name ?? "?").slice(0, 1)}</Avatar>
          <div className="fd-user-copy">
            <strong>{session?.display_name ?? "未登录"}</strong>
            <span>{session ? `${ROLE_LABEL[session.role]} · 内部系统` : ""}</span>
          </div>
          <Dropdown menu={userMenu} placement="topRight">
            <button type="button" className="fd-icon-button" aria-label="打开用户菜单" title="用户菜单">...</button>
          </Dropdown>
        </div>
      </aside>
      <main className="fd-main">
        <header className="fd-topbar">
          <div className="fd-topbar-left">
            <button type="button" className="fd-mobile-menu" aria-label="打开导航" onClick={() => setMobileOpen(true)}>☰</button>
            <span className="fd-breadcrumb">{selected?.label ?? "基金运营"}</span>
            <span className="fd-breadcrumb-separator">/</span>
            <span className="fd-breadcrumb-muted">数据工作台</span>
          </div>
        </header>
        <div className="fd-content"><Outlet /></div>
      </main>
    </div>
  );
}
