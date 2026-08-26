import { lazy, Suspense } from "react";
import { Spin } from "antd";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppLayout } from "./layout";
import { useAuth } from "./auth";
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
  const { session } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  return children;
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
  { path: "/login", element: <Page><Login /></Page> },
  { path: "/initialize", element: <Page><Initialize /></Page> },
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
      { path: "/imports", element: <Page><Imports /></Page> },
      { path: "/reviews", element: <Page><Reviews /></Page> },
      { path: "/mail", element: <Page><Mail /></Page> },
      { path: "/admin/funds", element: <Page><AdminFunds /></Page> },
      { path: "/admin/subjects", element: <Page><AdminSubjects /></Page> },
      { path: "/admin/risk-rules", element: <Page><AdminRiskRules /></Page> },
      { path: "/admin/users", element: <Page><AdminUsers /></Page> },
      { path: "/admin/audit", element: <Page><AdminAudit /></Page> },
      { path: "/admin/settings", element: <Page><AdminSettings /></Page> },
      { path: "/admin/retention", element: <Page><AdminRetention /></Page> },
    ],
  },
  { path: "*", element: <Navigate to="/dashboard" replace /> },
]);
