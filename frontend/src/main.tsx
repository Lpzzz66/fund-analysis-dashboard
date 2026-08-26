import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConfigProvider, App as AntdApp } from "antd";
import zhCN from "antd/locale/zh_CN";
import { RouterProvider } from "react-router-dom";
import { theme } from "@/app/theme";
import { AuthProvider } from "@/app/auth";
import { ConfirmProvider } from "@/components";
import { router } from "@/app/router";
import "@/styles/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConfigProvider theme={theme} locale={zhCN}>
      <AntdApp>
        <AuthProvider>
          <ConfirmProvider>
            <RouterProvider router={router} />
          </ConfirmProvider>
        </AuthProvider>
      </AntdApp>
    </ConfigProvider>
  </StrictMode>,
);
