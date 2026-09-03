# 基金估值分析看板

面向私募基金内部运营和管理层的估值数据分析系统。系统接收日常估值 Excel（电子表格），在服务端完成安全归档、标准化、质量校验、符合条件时自动发布、异常人工复核、后台分析和风险事件生成，再通过网页看板和 CSV（逗号分隔文件）导出提供结果。

> 当前定位：后端、API（接口）、后台任务、生产部署和正式网页前端已经形成可运行闭环；Windows 客户端安装包、外部数据接入和复杂量化模型不在当前版本范围内。

## 项目价值

私募基金估值文件通常来自邮件或业务员手工上传，格式和文件名可能不稳定，且需要保留原始文件以便复核。本项目把这条链路收敛为可审计的数据流程：

- 同一套解析、校验和发布状态贯穿手工上传、邮件附件和历史迁移，减少多套逻辑产生的口径差异。
- 原始文件用 SHA-256（安全哈希）去重并以服务端随机对象名保存，下载受权限、批次关联和路径安全控制。
- 估值版本不可就地修改；修订通过新版本、复核、发布和替代完成，历史结果有迹可循。
- 发布后的分析通过数据库任务和独立 worker（后台任务进程）执行，看板优先读取持久化结果，并明确返回分析是否就绪或过期。
- 关键写操作、下载、导出、备份和清理均写入脱敏审计记录。
- 面向十几个产品、每天十几至几十个文件和 2C4G（2 核 4 GB）服务器设计，使用 PostgreSQL 任务表，不引入不必要的缓存集群或消息队列。

## 重要边界

业务数据唯一来自估值 Excel。邮件、上传和历史迁移只是接入方式，不是额外的数据源。产品策略、管理人、别名、份额类别、科目映射、风险规则和账号是人工维护配置。

当前可以可靠提供：净资产、资产负债、单位净值、累计单位净值、累计派现、日/周/月/季/年初/累计收益（以 Excel 有值为前提）、份额快照、科目和持仓、市值权重、资产类别聚合、集中度、产品回撤、公司加权指数、质量校验和基于这些字段的风险规则。

当前不承诺：外部基准、Alpha（阿尔法）、Beta（贝塔）、跟踪误差、信息比率、行业/主题/风格穿透、VaR（风险价值）、压力测试、精确流动性天数、交易归因、申赎现金流、合同或监管限额判断。这些能力需要新的数据源和经过批准的业务口径，不能从现有 Excel 的偶然字段推断。

## 功能概览

### 数据接入和治理

- 手工批次上传 `.xls`（旧版 Excel）和 `.xlsx`（新版 Excel）。
- QQ 邮箱 IMAP（邮件接收协议）只读同步附件，支持连接测试、立即同步、同步记录、管理员更新邮箱账号和授权码、暂停/恢复自动同步。
- 文件头、大小、扩展名、临时目录、路径、工作簿规模和哈希检查。
- 解析器按表头和内容识别，不依赖固定行号；未知产品/日期和同日内容冲突进入人工复核。
- 任务失败可按明确技术失败条件重试，不提供无限制重试或手工篡改版本。

### 估值版本和分析

- 导入后形成估值版本，执行资产负债、份额净资产、日收益和持仓市值等校验。
- 无阻断级且无警告的导入版本自动发布；阻断级问题进入待复核；只有警告的版本保留为可发布并需要明确确认。
- 发布、驳回、撤回、恢复和同日替代均受状态机、数据库约束和审计保护。
- 发布后创建分析运行任务，计算产品日指标、公司指标和风险事件并落库。

### 查询和导出

- 公司总览：净资产合计、产品覆盖、公司日收益、公司指数、开放风险数量和质量状态。
- 产品列表和详情：净值序列、收益、回撤/峰值指标、持仓分页和数据质量。
- 风险事件查询和处理。
- 总览、产品列表、产品摘要、净值序列、资产配置、持仓、份额和导入报告 CSV 导出。
- 所有可见数据只来自活动产品的已发布版本；未发布和待复核数据不进入看板。

### 配置和运维

- 产品、别名、份额类别、科目映射和风险规则维护。
- 三类账号：管理员、业务员、普通看板只读用户。
- 审计查询、系统设置、worker 心跳、任务队列、备份状态和磁盘摘要。
- 原始文件清理必须先预演，再使用固定确认语句执行；标准化数据和审计日志不随原始文件清理。

## 系统架构

```text
浏览器 / 未来 Windows 薄壳
          |
          v
Caddy（静态文件、同源 HTTPS、/api 反向代理）
          |
          v
FastAPI API（认证、接入、查询、配置、导出、维护）
          |                         \
          v                          v
PostgreSQL（业务数据和任务表）   原始文件卷
          ^                          ^
          |                          |
独立 worker（解析、校验、分析）  受控下载/清理
```

生产 Docker Compose（容器编排）包含四个服务：

| 服务 | 职责 |
| --- | --- |
| `caddy` | 提供前端静态文件、SPA（单页应用）路由回退、HTTPS 和 `/api`/`/health` 反向代理 |
| `api` | 认证、上传、查询、复核发布、配置、导出、邮件操作和维护 API；不在请求内解析 Excel |
| `worker` | 从数据库任务表领取导入/分析任务，执行解析、校验、指标和风险事件落库 |
| `db` | PostgreSQL 16，保存账号、配置、原始文件元数据、估值、分析、风险、任务和审计 |

不使用 Redis、Celery、Kubernetes（集群编排）或独立 Node.js（JavaScript 运行时）生产前端服务。Caddy 镜像在构建时打包前端静态资源。

## 数据处理流程

```text
上传 / 邮件附件 / 历史迁移
        -> 临时文件和安全检查
        -> source_file（原始文件元数据）与 import_batch（导入批次）
        -> worker 领取任务
        -> Excel 解析、产品/日期识别、字段标准化
        -> valuation_version（估值版本）和明细
        -> 校验：干净版本自动发布；warning（警告）版本 publishable（可发布）；critical（阻断）版本 pending_review（待复核）
        -> 每产品合并分析任务；异常版本按需人工复核与发布
        -> analysis_run（分析运行）任务
        -> 产品指标、公司指标、风险事件落库
        -> 看板只读取已发布数据和可用分析结果
```

金额、净值、收益和权重在数据库中使用十进制定点数；JSON（结构化数据）中通常以字符串返回，避免 JavaScript 浮点误差。日期使用 `YYYY-MM-DD`，时间使用 ISO 8601（国际日期时间格式）。

## 角色

| 角色 | 能力 |
| --- | --- |
| `admin`（管理员） | 全部看板、导入、复核发布、目录/规则、账号、系统设置、审计、邮箱账号/授权码和原始文件清理 |
| `operator`（业务员） | 全部看板、导入、复核发布、目录/风险规则、邮件运营和审计查询 |
| `viewer`（普通看板） | 全部已发布看板和风险读取，不得写入或下载原始文件 |

前端菜单只改善体验，后端鉴权才是安全边界。会话使用 HttpOnly（脚本不可读取）Cookie；当前网页登录不使用 Bearer（令牌授权）头。

## 仓库结构

```text
backend/app/api/              HTTP 路由和响应组装
backend/app/auth/             账号、密码、会话和权限
backend/app/db/               SQLAlchemy 模型、枚举和会话
backend/app/parser/           Excel 读取、解析和标准化
backend/app/imports/          文件、批次、任务领取和处理
backend/app/publishing/       复核、发布、替代、撤回和恢复
backend/app/analytics/        产品/公司指标和持久化分析
backend/app/validation/       校验规则
backend/app/risk/             风险规则和事件
backend/app/mail/             IMAP 同步和凭据文件
backend/app/system/           健康、备份、清理和系统设置
backend/app/migration/        历史目录迁移
frontend/src/                 正式 React 页面和 API 适配器
tools/valuation_inventory/    只读历史文件盘点工具
deploy/                       Compose、Caddy 和配置模板
docs/                         权威文档
```

## 本地开发

环境要求：Windows 11 或 Debian 12、Python 3.12+、Node.js 20.19+、Docker（容器运行时）和 npm（Node.js 包管理器）。

### 后端

```powershell
Set-Location F:\AgentWorks\基金分析看板
python -m venv .venv
\.venv\Scripts\python.exe -m pip install -e "backend[test]"
\.venv\Scripts\python.exe -m alembic -c backend/alembic.ini upgrade head
\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --reload
```

开发默认 SQLite（本地数据库）为 `data/dev.db`；生产环境若 `APP_ENV=production`（生产环境）未提供 PostgreSQL `DATABASE_URL`（数据库连接地址）、上传临时目录和源文件目录，应用会拒绝启动。

首次做界面联调时，可在迁移完成后写入一套仅限本地的演示数据：

```powershell
Set-Location F:\AgentWorks\基金分析看板\backend
..\.venv\Scripts\python.exe -m app.dev_seed
```

该脚本生成 15 只基金、45 个估值日、净值序列、最新持仓和少量风险样例；数据使用 `DEMO-` 产品代码标记，重复执行会自动跳过，不会读取或写入生产配置。

### 前端

另开一个终端：

```powershell
Set-Location F:\AgentWorks\基金分析看板\frontend
npm ci
npm run dev
```

访问 `http://127.0.0.1:5173`。Vite 会把 `/api` 和 `/health` 代理到 `http://127.0.0.1:8000`。更详细的页面边界和前端检查见 `frontend/README.md`。

## 质量检查

```powershell
Set-Location F:\AgentWorks\基金分析看板
\.venv\Scripts\python.exe -m ruff check backend tools/valuation_inventory
\.venv\Scripts\python.exe -m ruff format --check backend tools/valuation_inventory
\.venv\Scripts\python.exe -m ty check backend/app
\.venv\Scripts\python.exe -m pytest backend/tests -q
\.venv\Scripts\python.exe -m pytest tools/valuation_inventory/tests -q

Set-Location frontend
npm test -- --run
npm run typecheck
npm run build
```

GitHub Actions 会在推送和合并请求中执行同等门禁。测试不依赖生产数据库、真实邮箱或历史源目录。

## API 入口

登录、看板、导入、复核、目录、风险、邮件、维护和导出接口的完整说明见 `docs/API接口说明.md`。运行实例还提供：

- `/health/live`：无需登录的进程存活检查；
- `/docs`：交互式接口文档；
- `/openapi.json`：机器可读接口描述。

普通成功响应通常使用 `data`，需要分页时附带 `meta`；文件导出返回 CSV 流。错误状态主要为 `400`（语义错误）、`401`（未认证）、`403`（无权限）、`404`（资源不存在）、`409`（状态/唯一性冲突）、`413`（文件过大）和 `422`（参数校验失败）。

## 生产部署

生产目标为阿里云 Debian 12，域名为 `danyintouzi.com`。先准备 DNS（域名系统）解析、80/443 端口、安全组、防火墙和 Docker，再在服务器创建不入库的 `deploy/.env` 和邮箱凭据文件。Caddy 会在域名可访问后自动申请和续期证书。

```bash
git clone https://github.com/jzcangshu/fund-analysis-dashboard.git
cd fund-analysis-dashboard
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
docker compose --env-file deploy/.env -f deploy/compose.prod.yml build
docker compose --env-file deploy/.env -f deploy/compose.prod.yml up -d
docker compose --env-file deploy/.env -f deploy/compose.prod.yml ps
```

生产 `deploy/.env` 必须替换所有密码、数据库连接地址、域名和邮箱配置占位符。不要把 `deploy/.env`、授权码、私钥或生产数据提交到 Git。完整初始化、数据库迁移、备份恢复、清理、升级和回滚以 `docs/runbook.md` 为准。

## 备份、保留和安全

- PostgreSQL 使用 `pg_dump`（数据库逻辑备份命令）生成 custom format（自定义格式）备份，默认保留 30 天；原始 Excel 不包含在数据库备份内。
- 原始文件默认保留 365 天，清理服务会检查待复核、任务、审计和备份保护；网页执行必须先预演并输入固定确认语句。
- 当前没有异地原始文件备份适配器，单服务器磁盘损坏时不能承诺原始文件完整恢复，这是明确的生产风险。
- API 和数据库只在 Compose 内网可见，Caddy 是公网入口；上传、下载、导出、账号、发布、备份和清理均记录审计。
- 密码使用 Argon2id（密码哈希算法），会话数据库只保存高熵令牌的 SHA-256 摘要，授权码只保存在受控文件或环境变量中。

## 文档和贡献

开发前先阅读 `docs/README.md`。长期文档包括产品范围、UX 设计指南、系统架构、API、历史迁移指南和生产运行手册；过期的过程计划和交接材料已从正式文档树移除，不再作为实现依据。提交前应同步代码、测试、OpenAPI、文档和迁移说明，并确认没有敏感信息。

项目当前没有单独的 Windows 客户端；未来如需桌面体验，建议使用 Tauri（桌面应用封装）复用正式网页前端，而不复制一套业务逻辑。
