# 私募基金估值分析看板 — 前端 Demo

自包含的 Vite + React 18 + TypeScript 单页应用，完整实现 `docs/02-页面与交互设计.md`
中定义的全部 16 个页面与 6 个详情页签，内置贴合真实后端契约的 mock 数据层，无需启动后端即可演示全部交互。

## 技术栈

| 层 | 选型 |
|---|---|
| 框架 | React 18 + TypeScript（strict） |
| 构建 | Vite 5 |
| 组件库 | Ant Design 5（经 ThemeConfig + CSS 变量定制，刻意偏离默认观感） |
| 路由 | React Router 6（`createBrowserRouter` + 懒加载 + `Suspense`） |
| 图表 | Recharts 2 |
| 日期 | dayjs |
| 数据 | 内置 `src/mock/` 契约级 mock（`{data,meta}` 包络、decimal 字符串、enum 字符串） |

## 快速开始

```bash
cd frontend
npm install
npm run dev      # 开发服务器，默认 http://127.0.0.1:5173
npm run build    # 类型检查 + 生产构建，产物在 dist/
npm run preview  # 预览生产构建
```

## 角色与登录

登录页可切换三种角色，导航随角色变化：

| 角色 | 账号 | 可见导航 |
|---|---|---|
| 管理员 admin | `admin` | 全部 5 组 16 页 |
| 业务员 operator | `operator` | 总览、产品分析、数据运营、基础配置、审计日志 |
| 普通看板 viewer | `viewer` | 总览、产品分析 |

任意密码均可登录（demo）。普通看板角色隐藏所有写操作按钮（`RoleGuard` + `can()` 权限函数）。

## 页面清单

| # | 页面 | 路由 | 角色 |
|---|---|---|---|
| 1 | 登录 | `/login` | — |
| 2 | 首次初始化 | `/initialize` | — |
| 3 | 公司总览 | `/dashboard` | 全部 |
| 4 | 风险概览 | `/risk` | 全部 |
| 5 | 产品列表 | `/funds` | 全部 |
| 6 | 产品详情 | `/funds/:id` | 全部 |
| 6.1 | ├ 概览 | | |
| 6.2 | ├ 净值和回撤 | | |
| 6.3 | ├ 资产配置 | | |
| 6.4 | ├ 持仓 | | |
| 6.5 | ├ 份额类别 | | |
| 6.6 | └ 数据质量 | | |
| 7 | 导入中心 | `/imports` | admin/operator |
| 8 | 异常复核 | `/reviews` | admin/operator |
| 9 | 邮件接入 | `/mail` | admin/operator |
| 10 | 产品管理 | `/admin/funds` | admin/operator |
| 11 | 科目与模板 | `/admin/subjects` | admin/operator |
| 12 | 风险规则 | `/admin/risk-rules` | admin/operator |
| 13 | 账号管理 | `/admin/users` | admin |
| 14 | 审计日志 | `/admin/audit` | admin/operator |
| 15 | 系统设置 | `/admin/settings` | admin |
| 16 | 数据保留和备份 | `/admin/retention` | admin |

## 跨页面交互约定（文档 §1，已全部落实）

- 所有列表支持分页、筛选、排序。
- 每个数据页顶部「状态栏」（签名元素）：数据截至 / 已发布版本 / 覆盖率 / 质量状态。
- 进行中任务轮询（2s → 连续无变化后 5s，页面离开或完成即停）。
- 破坏性操作二次确认 + 填写原因（`ConfirmProvider` + `useConfirm`）。
- 普通看板隐藏写按钮（`RoleGuard` + `can()`）。
- 关键数字旁「查看来源」入口（`SourceLink`）。
- 导出只导出当前筛选数据，文件写入导出时间（`exportCsv`，Blob 下载）。

## 设计方向

遵循 `emil-design-eng` 动效框架与反模板审美（避开 cream+serif+terracotta / near-black+acid-green /
newspaper-hairlines 三个 AI 默认）：

- **配色**：5 个命名 token（`--ink` 海军蓝 / `--paper` 画布底 / `--rule` 分隔线 / `--accent` 信号蓝
  / `--amber` + `--crimson` + `--sage` 三色语义克制）。
- **字体**：正文无衬线 + 所有数字用等宽 `ui-monospace / JetBrains Mono`，数字成为视觉记忆点。
- **签名元素**：状态栏四格横条，质量格用语义圆点（有效=sage 常驻，警告=amber 呼吸，阻断=crimson 静态，处理中=sage 脉冲）。
- **动效**：列表 hover 极简（仅背景，无 transform），页面无入场动画，键盘动作零动画；抽屉/弹窗 240ms
  `cubic-bezier(0.23,1,0.32,1)`；按钮 `:active` `scale(0.97)` 140ms；`prefers-reduced-motion` 关闭所有 transform。
- 破坏性操作「慢按快放」：确认刻意，反馈即时。

## 文件结构

```
frontend/
  package.json  tsconfig.json  tsconfig.node.json  vite.config.ts  index.html  .gitignore
  src/
    main.tsx                          # 入口：ConfigProvider + AntdApp + AuthProvider + Router
    app/
      theme.ts                        # AntD ThemeConfig + palette
      auth.tsx                        # AuthProvider（sessionStorage，登录/登出/切换角色）
      router.tsx                      # createBrowserRouter + 懒加载 + 角色守卫
      layout.tsx                      # AppLayout（可折叠暗色侧栏 + 顶栏角色切换）
    mock/
      db.ts                           # 种子数据（8 只基金、60 交易日序列、导入批次、风险、审计等）
      api.ts                          # 异步函数集，返回 {data,meta} 包络，180-420ms 延迟
    components/
      index.tsx                       # Num / QualityBadge / StatusRibbon / PageHeader / RoleGuard
                                      # ConfirmProvider+useConfirm / SourceLink / LevelTag
                                      # EmptyState / usePolling / useToast
    utils/
      constants.ts                    # 所有 TS 类型 + 中文标签映射 + SETTING_DEFINITIONS
      permissions.ts                  # 角色权限矩阵 + can() + navForRole()
      format.ts                       # dec/pct/weight/dateStr/timeStr/exportCsv/sleep
    styles/
      globals.css                     # CSS 变量 + .num 等宽 + .q-dot 语义圆点 + reduced-motion
    pages/
      Login.tsx  Initialize.tsx  Dashboard.tsx  RiskOverview.tsx
      Funds.tsx  FundDetail/index.tsx
      FundDetail/tabs/{Overview,NavDrawdown,Allocation,Positions,ShareClasses,Quality}.tsx
      Imports.tsx  Reviews.tsx  Mail.tsx
      AdminFunds.tsx  AdminSubjects.tsx  AdminRiskRules.tsx
      AdminUsers.tsx  AdminAudit.tsx  AdminSettings.tsx  AdminRetention.tsx
```

## Mock 数据层

`src/mock/db.ts` 生成完整种子数据，`src/mock/api.ts` 提供与真实后端契约对齐的异步接口：

- **字段名**：与后端模型列名逐一对应（`fund_daily_snapshot`、`account_subject_daily`、
  `position_daily`、`share_class_daily_snapshot`、`drawdown_result`、`company_metric_daily` 等）。
- **序列化**：decimal 用字符串（如 `"1.2500000000"`），enum 用字符串值（如 `"published"`、`"critical"`）。
- **响应包络**：统一 `{ data, meta }`，列表增加 `{ page, page_size, total }`。
- **版本状态机**：`received → parsing → validating → publishable → published`，
  `published → superseded/revoked`，`superseded → restored → published`。

## 对接真实后端

`src/mock/api.ts` 中的每个函数对应一个后端端点。替换为真实 `fetch` 调用时，
保持返回值的 `{data,meta}` 结构不变即可零改动接入。`vite.config.ts` 已配置
`/api` 和 `/health` 代理到 `http://127.0.0.1:8000`。
