import { lazy, Suspense } from "react";
import { Spin } from "antd";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppLayout } from "./layout";
import { useAuth } from "./auth";
import { can } from "@/utils/permissions";
import type { JSX } from "react";

const Login = lazy(() => import("@/pages/Login"));
const Initialize = lazy(() => import("@/pages/Initialize"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const RiskOverview = lazy(() => import("@/pages/RiskOverview"));
const Funds = lazy(() => import("@/pages/Funds"));
const FundDetail = lazy(() => import("@/pages/FundDetail"));
const Imports = lazy(() => import("@/pages/Imports"));
const Reviews = lazy(() => import("@/pages/Reviews"));
const Mail = lazy(() => import("@/pages/Mail"));
const AdminFunds = lazy(() => import("@/pages/AdminFunds"));
const AdminSubjects = lazy(() => import("@/pages/AdminSubjects"));
const AdminRiskRules = lazy(() => import("@/pages/AdminRiskRules"));
const AdminUsers = lazy(() => import("@/pages/AdminUsers"));
const AdminAudit = lazy(() => import("@/pages/AdminAudit"));
const AdminSettings = lazy(() => import("@/pages/AdminSettings"));
const AdminRetention = lazy(() => import("@/pages/AdminRetention"));

function Guard({ children }: { children: JSX.Element }) {
  const { loading, initialized, session } = useAuth();
  if (loading) return <Loading />;
  if (!initialized) return <Navigate to="/initialize" replace />;
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

function EntryGuard({ mode, children }: { mode: "login" | "initialize"; children: JSX.Element }) {
  const { loading, initialized, session } = useAuth();
  if (loading) return <Loading />;
  if (!initialized && mode !== "initialize") return <Navigate to="/initialize" replace />;
  if (initialized && mode === "initialize") return <Navigate to={session ? "/dashboard" : "/login"} replace />;
  if (initialized && session && mode === "login") return <Navigate to="/dashboard" replace />;
  return children;
}

function RoleGuard({ capability, children }: { capability: Parameters<typeof can>[1]; children: JSX.Element }) {
  const { session } = useAuth();
  return can(session?.role, capability) ? children : <Navigate to="/dashboard" replace />;
}

function Loading() {
  return <div style={{ padding: 80, textAlign: "center" }}><Spin /></div>;
}

function Page({ children }: { children: JSX.Element }) {
  return (
    <Suspense
      fallback={
        <div style={{ padding: 80, textAlign: "center" }}>
          <Spin />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

export const router = createBrowserRouter([
  { path: "/login", element: <EntryGuard mode="login"><Page><Login /></Page></EntryGuard> },
  { path: "/initialize", element: <EntryGuard mode="initialize"><Page><Initialize /></Page></EntryGuard> },
  {
    element: (
      <Guard>
        <AppLayout />
      </Guard>
    ),
    children: [
      { path: "/", element: <Navigate to="/dashboard" replace /> },
      { path: "/dashboard", element: <Page><Dashboard /></Page> },
      { path: "/risk", element: <Page><RiskOverview /></Page> },
      { path: "/funds", element: <Page><Funds /></Page> },
      { path: "/funds/:id", element: <Page><FundDetail /></Page> },
      { path: "/imports", element: <RoleGuard capability="imports"><Page><Imports /></Page></RoleGuard> },
      { path: "/reviews", element: <RoleGuard capability="reviews"><Page><Reviews /></Page></RoleGuard> },
      { path: "/mail", element: <RoleGuard capability="mail"><Page><Mail /></Page></RoleGuard> },
      { path: "/admin/funds", element: <RoleGuard capability="adminFunds"><Page><AdminFunds /></Page></RoleGuard> },
      { path: "/admin/subjects", element: <RoleGuard capability="adminSubjects"><Page><AdminSubjects /></Page></RoleGuard> },
      { path: "/admin/risk-rules", element: <RoleGuard capability="adminRiskRules"><Page><AdminRiskRules /></Page></RoleGuard> },
      { path: "/admin/users", element: <RoleGuard capability="adminUsers"><Page><AdminUsers /></Page></RoleGuard> },
      { path: "/admin/audit", element: <RoleGuard capability="adminAudit"><Page><AdminAudit /></Page></RoleGuard> },
      { path: "/admin/settings", element: <RoleGuard capability="adminSettings"><Page><AdminSettings /></Page></RoleGuard> },
      { path: "/admin/retention", element: <RoleGuard capability="adminRetention"><Page><AdminRetention /></Page></RoleGuard> },
    ],
  },
  { path: "*", element: <Navigate to="/dashboard" replace /> },
]);
