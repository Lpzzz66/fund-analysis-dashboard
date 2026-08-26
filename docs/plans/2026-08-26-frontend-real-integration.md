# 前端真实接入与范围剔除实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** 将当前完全依赖 mock（模拟数据）的前端改造成只调用真实后端接口的首期系统，并直接删除没有真实数据或接口支撑的页面、按钮、类型与模拟代码。

**Architecture:** 浏览器通过同源 `/api/v1` 调用 FastAPI（后端框架），认证只使用后端签发的 HttpOnly Cookie（禁止脚本读取的会话 Cookie），前端不保存伪造会话或提供角色切换。前端建立一个薄而明确的 HTTP（网页请求）层和按领域划分的类型/接口模块；页面只组合真实接口，不复制业务计算。生产环境使用现有 Caddy（网页服务器）同时提供前端静态文件和 API（接口）反向代理，不增加常驻 Node.js（前端运行时）容器。

**Tech Stack:** React 18（前端框架）、TypeScript（类型语言）、Ant Design（组件库）、Vite（构建工具）、Vitest（测试框架）、FastAPI（后端框架）、SQLAlchemy（数据库访问）、Caddy（网页服务器）、Docker Compose（容器编排）。

---

## 边界原则

1. 唯一业务数据源仍为估值 Excel（电子表格）；不新增行情、基准、行业、基金经理或策略数据源。
2. 直接删除而不是隐藏：模拟数据库、模拟 API、角色切换、虚构数字、无接口页签、演示按钮及其孤立类型。
3. 只补首期真实接入必需的后端缺口；不新增消息队列、缓存、WebSocket（网页长连接）或前端状态框架。
4. 页面权限由前端导航和路由共同约束，但最终以现有后端权限校验为准。
5. 写操作成功后重新读取服务端状态，不在浏览器本地伪造成功结果。
6. 前端文件导出和原始文件下载直接使用受控后端下载接口，不在浏览器重算业务数据。

## 明确删除清单

- `frontend/src/mock/api.ts`
- `frontend/src/mock/db.ts`
- 产品详情中的完整分析概览、资产配置、份额每日三个无页面接口页签及对应文件。
- 独立回撤曲线、峰谷标记、公司历史指数图和公司最大回撤固定卡片。
- 策略、负责人、基金经理、业绩基准字段、筛选和虚构标签。
- “查看版本”“产品页直接查看原表”“穿透合并”“重新解析”“重新校验”“已知例外”“目录导入”“映射导入”“命中样本”“测试规则”“风险试算”“邮件查看附件”等无接口操作。
- 任意密码登录、sessionStorage（会话存储）伪会话、前端切换角色。
- 浏览器端模拟导出、固定日期、固定覆盖率、固定版本和模拟成功提示。

### Task 1: 冻结真实接口契约与初始化状态

**Files:**
- Modify: `backend/app/api/auth.py`
- Modify: `backend/tests/auth/test_login.py`
- Modify: `docs/05-API-接口草案.md`

**Steps:**
1. 先增加失败测试：公开 `GET /api/v1/auth/status` 只返回 `initialized` 布尔值，不返回账号信息。
2. 实现最小查询：判断是否存在任意用户；不创建会话，不暴露用户名。
3. 运行认证目标测试并通过 Ruff（静态检查）和 ty（类型检查）。
4. 更新接口文档，说明登录页根据该接口进入初始化或登录流程。
5. 提交：`feat: expose safe initialization status`。

### Task 2: 建立真实 HTTP 与认证基础层

**Files:**
- Create: `frontend/src/api/http.ts`
- Create: `frontend/src/api/types.ts`
- Create: `frontend/src/api/auth.ts`
- Create: `frontend/src/api/dashboard.ts`
- Create: `frontend/src/api/operations.ts`
- Create: `frontend/src/api/admin.ts`
- Create: `frontend/src/api/downloads.ts`
- Modify: `frontend/src/app/auth.tsx`
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/app/layout.tsx`
- Modify: `frontend/src/utils/permissions.ts`
- Modify: `frontend/src/pages/Login.tsx`
- Modify: `frontend/src/pages/Initialize.tsx`
- Test: `frontend/src/api/http.test.ts`
- Test: `frontend/src/app/auth.test.tsx`

**Steps:**
1. 增加 Vitest（测试框架）、jsdom（浏览器环境模拟）和 Testing Library（组件测试库），不引入状态管理库。
2. 先写失败测试：所有请求包含 `credentials: "include"`；204 无内容可处理；非 2xx 转换为统一 `ApiError`；401 触发会话失效。
3. 实现薄 HTTP 层；请求和响应均使用明确 TypeScript（类型语言）类型。
4. AuthProvider（认证上下文）启动时调用 `/auth/status` 和 `/auth/me`，登录、初始化、退出全部调用真实接口；删除 sessionStorage 和角色切换。
5. 路由在认证状态加载期间显示加载态；未初始化进入初始化页；已初始化未登录进入登录页；无权限路由重定向到首个可访问页面。
6. 登录页删除演示账号、任意密码说明和角色选择；初始化页提交真实账号密码。
7. 顶栏只展示真实用户和退出操作。
8. 运行前端单元测试、类型检查和构建。
9. 提交：`feat: connect frontend authentication`。

### Task 3: 接入真实只读分析页面并删除无接口页签

**Files:**
- Modify: `frontend/src/pages/Dashboard.tsx`
- Modify: `frontend/src/pages/Funds.tsx`
- Modify: `frontend/src/pages/FundDetail/index.tsx`
- Create: `frontend/src/pages/FundDetail/tabs/NavSeries.tsx`
- Modify: `frontend/src/pages/FundDetail/tabs/Positions.tsx`
- Modify: `frontend/src/pages/FundDetail/tabs/Quality.tsx`
- Delete: `frontend/src/pages/FundDetail/tabs/Overview.tsx`
- Delete: `frontend/src/pages/FundDetail/tabs/Allocation.tsx`
- Delete: `frontend/src/pages/FundDetail/tabs/ShareClasses.tsx`
- Delete: `frontend/src/pages/FundDetail/tabs/NavDrawdown.tsx`
- Modify: `frontend/src/pages/RiskOverview.tsx`
- Modify: `frontend/src/utils/constants.ts`
- Modify: `frontend/src/utils/format.ts`
- Test: `frontend/src/pages/Dashboard.test.tsx`

**Steps:**
1. 先写失败测试：公司总览只展示真实响应字段，不出现最大回撤固定值、公司历史曲线、模拟来源链接。
2. 总览接入 `/dashboard/overview`，保留总净资产、公司日收益、风险事件数、覆盖率和真实产品概览；导出调用 `/exports/overview`。
3. 产品列表只保留 `q/status/as_of/page/page_size`，接入真实分页；导出调用 `/exports/funds`；新增/维护移到产品管理页。
4. 产品详情头部使用真实详情摘要；页签只保留净值序列、持仓、数据质量。
5. 净值页接入真实日期区间和导出，不展示独立回撤、峰谷或不存在的指标。
6. 持仓页接入真实分页和估值日；市场/账户按可空字段显示；不展示来源、成本等响应未提供字段。
7. 质量页只展示真实校验结果，不提供重新校验、差异或来源入口。
8. 风险页接入真实风险事件分页/筛选和处理接口，不根据日收益自行伪造风险产品。
9. 删除四个无接口页签文件及其类型、常量和引用。
10. 运行前端测试、类型检查和构建。
11. 提交：`feat: connect published analysis pages`。

### Task 4: 接入真实导入、复核和邮件运营页面

**Files:**
- Modify: `frontend/src/pages/Imports.tsx`
- Modify: `frontend/src/pages/Reviews.tsx`
- Modify: `frontend/src/pages/Mail.tsx`
- Test: `frontend/src/pages/Imports.test.tsx`
- Test: `frontend/src/pages/Mail.test.tsx`

**Steps:**
1. 导入中心实现真实流程：创建批次 -> 逐文件上传 -> 完成批次 -> 轮询批次任务；上传结果只展示文件名、哈希、大小、重复状态。
2. 列表只展示批次和任务状态；详情只展示真实返回字段；校验结果通过独立接口读取；原文件通过受控下载接口获取。
3. 删除目录导入、识别结果、版本列表、完整处理日志、单文件作废、替代版本和模拟进度。
4. 复核页只展示最小摘要；实现确认、发布、驳回、撤回、恢复的真实版本操作和原因/警告确认；删除复杂筛选、详情、差异、来源、重新解析和已知例外。
5. 邮件页主机/端口/账号只读；管理员可更新授权码、测试、暂停/恢复；管理员和业务员可立即同步；同步记录显示真实摘要。
6. 授权码提交后立即清空输入框，错误中不得回显输入。
7. 运行目标测试、类型检查和构建。
8. 提交：`feat: connect data operations pages`。

### Task 5: 接入真实基础配置和系统管理页面

**Files:**
- Modify: `frontend/src/pages/AdminFunds.tsx`
- Modify: `frontend/src/pages/AdminSubjects.tsx`
- Modify: `frontend/src/pages/AdminRiskRules.tsx`
- Modify: `frontend/src/pages/AdminUsers.tsx`
- Modify: `frontend/src/pages/AdminAudit.tsx`
- Modify: `frontend/src/pages/AdminSettings.tsx`
- Modify: `frontend/src/pages/AdminRetention.tsx`
- Modify: `backend/app/api/auth.py`
- Modify: `backend/app/api/risk.py`
- Modify: `backend/tests/auth/test_permissions.py`
- Modify: `backend/tests/api/test_risk_system.py`
- Test: `frontend/src/pages/AdminSettings.test.tsx`

**Steps:**
1. 产品管理接入产品新增/修改/启停、别名和份额主数据接口；表单只包含名称、代码、成立日、状态、备注和真实别名/份额字段。
2. 科目映射接入列表、新增、修改和停用接口；删除试跑、导入和命中样本。
3. 风险规则接入六类规则的查询、创建和版本化修改；删除试算。
4. 账号管理接入新增、角色修改、启停、重置密码和撤销会话。
5. 审计、系统设置、运维摘要、清理预演和确认执行全部接入真实接口。
6. 将用户和风险规则列表改为数据库 `count + offset + limit`，避免前端接入后继续全表加载。
7. 清理执行必须要求用户先完成预演，再输入固定确认短语和非空原因。
8. 运行前后端目标测试、静态检查、类型检查和构建。
9. 提交：`feat: connect administration pages`。

### Task 6: 删除模拟层和死代码

**Files:**
- Delete: `frontend/src/mock/api.ts`
- Delete: `frontend/src/mock/db.ts`
- Modify: `frontend/src/components/index.tsx`
- Modify: `frontend/src/utils/constants.ts`
- Modify: `frontend/src/utils/format.ts`
- Modify: `frontend/README.md`

**Steps:**
1. 用 `rg` 确认所有生产代码不再引用 `src/mock`。
2. 删除模拟目录和只服务于模拟功能的组件、类型、状态标签、导出工具和轮询假实现。
3. 删除所有“演示”“固定日期”“v1 固定版本”“模拟成功”等生产可见文案。
4. 更新 README（说明文档）为真实前端运行、测试、接口和权限说明。
5. 运行未使用引用搜索、测试、类型检查和构建。
6. 提交：`refactor: remove frontend simulation layer`。

### Task 7: 完成生产静态部署

**Files:**
- Create: `deploy/Caddy.Dockerfile`
- Modify: `deploy/Caddyfile`
- Modify: `deploy/compose.prod.yml`
- Modify: `deploy/compose.dev.yml`
- Modify: `deploy/.env.example`
- Modify: `docs/runbook.md`

**Steps:**
1. 多阶段镜像使用 Node.js（前端构建环境）执行 `npm ci && npm run build`，最终仅把 `dist` 静态文件复制进 Caddy（网页服务器）镜像。
2. Caddy 对 `/api/*` 和 `/health/*` 反向代理，其余路径使用 SPA（单页应用）回退到 `index.html`。
3. 生产运行时不保留 Node.js 进程，维持 2C4G 资源友好边界。
4. 开发编排补前端开发服务或在运行手册中明确本机双进程启动方式。
5. 验证 Docker Compose（容器编排）配置和镜像构建。
6. 提交：`deploy: serve integrated web dashboard`。

### Task 8: 前后端联调与端到端验收

**Files:**
- Create: `docs/08-前后端真实接入验收报告.md`
- Modify: `docs/02-页面与交互设计.md`
- Modify: `docs/05-API-接口草案.md`
- Modify: `docs/07-Excel能力边界与前端Demo审计.md`

**Steps:**
1. 使用独立本地 SQLite（轻量测试数据库）启动后端，执行数据库迁移并初始化管理员。
2. 启动前端，通过真实浏览器完成：初始化/登录、权限导航、总览、产品列表与详情、上传导入、复核、邮件设置、基础配置、账号、审计、系统设置、清理预演。
3. 对真实浏览器网络请求确认：没有 `src/mock`、没有固定业务数据、Cookie 会话工作、401/403/409/422 错误可理解。
4. 执行后端全量测试、盘点工具测试、Ruff（静态检查）、格式、ty（类型检查）、前端测试、类型检查、构建和 Docker Compose（容器编排）检查。
5. 执行敏感信息扫描，确认 `.env`、授权码、密码、令牌和 `.zcode` 未进入提交。
6. 更新验收报告，列出删除文件、真实接口覆盖、测试结果和仍明确延期能力。
7. 进行规格审查和五轴代码质量审查；所有 Required（必须修复）问题闭环。
8. 提交：`test: verify integrated dashboard workflow`。
9. 通过 `http://127.0.0.1:7897` 代理推送 `feature/scope-convergence`。

