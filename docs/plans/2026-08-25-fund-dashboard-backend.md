# 私募基金估值分析看板后端实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 建立一个可在 2C4G 阿里云 Debian 服务器稳定运行的估值表接入、版本管理、分析计算和查询接口后端，并为网页版和 Windows 客户端提供同一套接口。

**Architecture:** 采用 FastAPI（Python 后端框架）模块化单体、PostgreSQL（关系型数据库）、数据库任务表和独立任务进程。原始文件、标准化数据、分析结果和展示查询分层保存；解析、校验、发布和分析通过稳定的深模块接口连接，历史修订只产生新版本并触发受影响日期重算。Windows 客户端只封装网页前端，不复制业务逻辑。

**Tech Stack:** Python 3.12、FastAPI、SQLAlchemy、Alembic、PostgreSQL 16、pytest（测试框架）、React、TypeScript、Tauri 2、Caddy、Docker Compose。

---

## 设计依据

- `docs/01-产品设计基线.md`
- `docs/02-页面与交互设计.md`
- `docs/03-系统架构与部署.md`
- `docs/04-数据模型与导入状态.md`
- `docs/05-API-接口草案.md`
- `docs/06-历史数据迁移清单.md`

## 预期代码目录

```text
backend/
  app/
    auth/
    catalog/
    imports/
    parser/
    validation/
    publishing/
    analytics/
    dashboard/
    risk/
    mail/
    system/
    db/
    api/
  tests/
frontend/
desktop/
deploy/
docs/
```

## Task 1: 创建项目骨架和开发约束

**Files:**

- Create: `backend/pyproject.toml`
- Create: `backend/app/main.py`
- Create: `backend/app/config.py`
- Create: `backend/tests/test_health.py`
- Create: `frontend/package.json`
- Create: `deploy/compose.dev.yml`
- Modify: `docs/README.md`

**Step 1: Write the failing test**

编写健康检查测试，验证应用可以创建并返回固定结构的健康状态。

**Step 2: Run test to verify it fails**

Run: `cd backend; uv run pytest tests/test_health.py -q`

Expected: FAIL because the application factory does not exist。

**Step 3: Write minimal implementation**

创建应用工厂、配置读取、健康检查路由和最小前端占位页；配置只从环境变量读取，禁止把数据库密码和邮箱授权码写进代码。

**Step 4: Run test to verify it passes**

Run: `cd backend; uv run pytest tests/test_health.py -q`

Expected: PASS。

**Step 5: Verify formatting and types**

Run: `cd backend; uv run ruff check .; uv run ty check app`

Expected: 无错误。

## Task 2: 建立数据库结构和迁移机制

**Files:**

- Create: `backend/app/db/base.py`
- Create: `backend/app/db/session.py`
- Create: `backend/app/db/models/catalog.py`
- Create: `backend/app/db/models/imports.py`
- Create: `backend/app/db/models/valuation.py`
- Create: `backend/app/db/models/analytics.py`
- Create: `backend/app/db/models/security.py`
- Create: `backend/alembic.ini`
- Create: `backend/alembic/versions/0001_initial_schema.py`
- Create: `backend/tests/db/test_schema.py`

**Step 1: Write the failing test**

测试产品、估值版本和原始文件的唯一约束：同一文件哈希不能重复接收；同一产品同一估值日只能有一个已发布版本。

**Step 2: Run test to verify it fails**

Run: `cd backend; uv run pytest tests/db/test_schema.py -q`

Expected: FAIL because the tables and constraints do not exist。

**Step 3: Write minimal implementation**

建立文档中定义的核心表，金额和比例使用 PostgreSQL `numeric`（高精度数值），日期使用 `date`，所有版本明细关联 `valuation_version_id`。为产品日期、状态、任务状态和审计查询建立必要索引。

**Step 4: Run test to verify it passes**

Run: `cd backend; uv run pytest tests/db/test_schema.py -q`

Expected: PASS。

**Step 5: Verify migration**

Run: `cd backend; uv run alembic upgrade head; uv run alembic downgrade -1; uv run alembic upgrade head`

Expected: 可重复升级和回退，不能丢失已有结构。

## Task 3: 实现本地账号、会话和权限

**Files:**

- Create: `backend/app/auth/service.py`
- Create: `backend/app/auth/dependencies.py`
- Create: `backend/app/api/auth.py`
- Create: `backend/tests/auth/test_login.py`
- Create: `backend/tests/auth/test_permissions.py`

**Step 1: Write the failing test**

覆盖首次创建管理员、正确登录、错误密码、会话撤销、管理员重置密码和三种角色权限。

**Step 2: Run test to verify it fails**

Run: `cd backend; uv run pytest tests/auth -q`

Expected: FAIL because认证和权限依赖尚未实现。

**Step 3: Write minimal implementation**

使用 Argon2id（密码哈希算法）保存密码；使用安全随机会话令牌的哈希值保存会话；所有写接口通过统一依赖检查角色。实现登录失败限制、账号禁用和审计记录。

**Step 4: Run test to verify it passes**

Run: `cd backend; uv run pytest tests/auth -q`

Expected: PASS。

**Step 5: Verify security checks**

Run: `cd backend; uv run pytest tests/auth -q -m security`

Expected: 不返回密码、令牌或数据库异常原文。

## Task 4: 实现原始文件接收和导入任务

**Files:**

- Create: `backend/app/imports/storage.py`
- Create: `backend/app/imports/service.py`
- Create: `backend/app/imports/tasks.py`
- Create: `backend/app/api/imports.py`
- Create: `backend/tests/imports/test_upload.py`
- Create: `backend/tests/imports/test_idempotency.py`

**Step 1: Write the failing test**

验证上传文件写入随机对象名、计算哈希、重复文件幂等、非法扩展名拒绝、任务失败可重试。

**Step 2: Run test to verify it fails**

Run: `cd backend; uv run pytest tests/imports -q`

Expected: FAIL because文件存储和任务服务尚未实现。

**Step 3: Write minimal implementation**

实现临时目录上传、哈希去重、原始文件元数据、任务表领取和有限重试。不要让接口进程直接解析 Excel；接口只创建任务。

**Step 4: Run test to verify it passes**

Run: `cd backend; uv run pytest tests/imports -q`

Expected: PASS。

## Task 5: 实现 `.xls` 和 `.xlsx` 解析器

**Files:**

- Create: `backend/app/parser/interface.py`
- Create: `backend/app/parser/excel_reader.py`
- Create: `backend/app/parser/valuation_parser.py`
- Create: `backend/app/parser/normalizers.py`
- Create: `backend/tests/parser/fixtures/`
- Create: `backend/tests/parser/test_samples.py`
- Create: `backend/tests/parser/test_normalizers.py`

**Step 1: Write the failing test**

使用三份样本和历史目录中的代表文件，验证能识别产品、估值日、单位净值、累计单位净值、基金资产净值、资产负债和持仓叶子行。

**Step 2: Run test to verify it fails**

Run: `cd backend; uv run pytest tests/parser -q`

Expected: FAIL because解析器尚未实现。

**Step 3: Write minimal implementation**

解析器必须按字段名和科目树工作，不按固定行号工作；统一 `20260402` 和 `2026-04-02`，统一带千分位金额，统一百分数单位，保留原始文本和工作表、行、列来源。产品识别通过产品别名和表内标题完成，未识别时进入复核而不是猜测。

**Step 4: Run test to verify it passes**

Run: `cd backend; uv run pytest tests/parser -q`

Expected: PASS，三份样本全部得到稳定的标准化结果。

**Step 5: Run a historical smoke test**

Run: `cd backend; uv run python -m app.parser.smoke_test --root 'F:\AgentWorks\估值表A'`

Expected: 估值表读取失败数为 0，并输出未识别产品、日期、字段和科目映射统计。

## Task 6: 实现校验、复核、发布和版本替代

**Files:**

- Create: `backend/app/validation/rules.py`
- Create: `backend/app/validation/service.py`
- Create: `backend/app/publishing/service.py`
- Create: `backend/app/api/reviews.py`
- Create: `backend/tests/validation/test_reconciliation.py`
- Create: `backend/tests/publishing/test_versioning.py`

**Step 1: Write the failing test**

覆盖资产负债平衡、份额净资产合计、数量乘市价、净值日收益、重复版本、发布后替代、撤回和恢复旧版本。

**Step 2: Run test to verify it fails**

Run: `cd backend; uv run pytest tests/validation tests/publishing -q`

Expected: FAIL。

**Step 3: Write minimal implementation**

实现阻断、警告、提示三级结果；实现待复核队列和发布事务。已发布版本明细禁止就地更新；历史修订只能生成新版本。

**Step 4: Run test to verify it passes**

Run: `cd backend; uv run pytest tests/validation tests/publishing -q`

Expected: PASS。

## Task 7: 实现产品和公司分析计算

**Files:**

- Create: `backend/app/analytics/nav.py`
- Create: `backend/app/analytics/drawdown.py`
- Create: `backend/app/analytics/allocation.py`
- Create: `backend/app/analytics/concentration.py`
- Create: `backend/app/analytics/company.py`
- Create: `backend/app/risk/evaluator.py`
- Create: `backend/tests/analytics/test_nav.py`
- Create: `backend/tests/analytics/test_company_index.py`
- Create: `backend/tests/analytics/test_drawdown.py`

**Step 1: Write the failing test**

使用固定小样本验证累计净值收益、派现、最大回撤、当前回撤、资产权重、单票权重、前五大权重和公司加权指数。

**Step 2: Run test to verify it fails**

Run: `cd backend; uv run pytest tests/analytics -q`

Expected: FAIL。

**Step 3: Write minimal implementation**

分析函数只接受标准化已发布数据，返回纯结果；公司指数使用前一日净资产权重，缺报产品不静默沿用，结果携带有效产品数。修订历史后整段重算，先保证一致性再优化性能。

**Step 4: Run test to verify it passes**

Run: `cd backend; uv run pytest tests/analytics -q`

Expected: PASS。

## Task 8: 实现看板查询接口和导出

**Files:**

- Create: `backend/app/api/dashboard.py`
- Create: `backend/app/api/funds.py`
- Create: `backend/app/api/risk.py`
- Create: `backend/app/api/exports.py`
- Create: `backend/tests/api/test_dashboard.py`
- Create: `backend/tests/api/test_funds.py`

**Step 1: Write the failing test**

验证总览、产品列表、产品净值序列、持仓、质量状态、覆盖率、分页、筛选和权限。

**Step 2: Run test to verify it fails**

Run: `cd backend; uv run pytest tests/api -q`

Expected: FAIL。

**Step 3: Write minimal implementation**

按 `docs/05-API-接口草案.md` 实现统一响应、请求编号、质量元数据和错误码。所有看板查询只读已发布数据，所有原文件下载产生审计日志。

**Step 4: Run test to verify it passes**

Run: `cd backend; uv run pytest tests/api -q`

Expected: PASS。

## Task 9: 实现 QQ 邮箱同步、保留和备份任务

**Files:**

- Create: `backend/app/mail/imap_client.py`
- Create: `backend/app/mail/service.py`
- Create: `backend/app/api/mail.py`
- Create: `backend/app/system/retention.py`
- Create: `backend/app/system/backup.py`
- Create: `backend/tests/mail/test_sync.py`
- Create: `backend/tests/system/test_retention.py`

**Step 1: Write the failing test**

验证邮件附件按 Message-ID 和文件哈希幂等，非估值表附件可记录并忽略，过期原始文件不会删除待复核和审计锁定文件。

**Step 2: Run test to verify it fails**

Run: `cd backend; uv run pytest tests/mail tests/system -q`

Expected: FAIL。

**Step 3: Write minimal implementation**

实现 IMAP 拉取、同步游标、附件接收、非估值表记录、每日清理、数据库备份和备份状态。授权码不返回前端；邮件同步默认只拉取，不删除或移动邮箱原邮件。

**Step 4: Run test to verify it passes**

Run: `cd backend; uv run pytest tests/mail tests/system -q`

Expected: PASS。

## Task 10: 实现历史目录迁移工具

**Files:**

- Create: `backend/app/migration/inventory.py`
- Create: `backend/app/migration/uploader.py`
- Create: `backend/app/api/migration.py`
- Create: `backend/tests/migration/test_inventory.py`
- Create: `docs/migration/README.md`

**Step 1: Write the failing test**

验证主目录优先、同哈希去重、哈希冲突进入复核、交易记录 `.xlsx` 被识别为非估值表、源文件不被移动或删除。

**Step 2: Run test to verify it fails**

Run: `cd backend; uv run pytest tests/migration -q`

Expected: FAIL。

**Step 3: Write minimal implementation**

实现本地清单、断点上传和迁移报告。历史迁移工具调用正式导入接口，不使用一套隐藏的“特权导入逻辑”。

**Step 4: Run test to verify it passes**

Run: `cd backend; uv run pytest tests/migration -q`

Expected: PASS。

## Task 11: 部署、监控和验收

**Files:**

- Create: `deploy/compose.prod.yml`
- Create: `deploy/Caddyfile`
- Create: `deploy/.env.example`
- Create: `deploy/backup/README.md`
- Create: `docs/runbook.md`
- Create: `backend/tests/e2e/test_import_publish_dashboard.py`

**Step 1: Write the failing test**

编写端到端测试：上传样本、解析、校验、发布、重算，然后查询产品和公司总览。

**Step 2: Run test to verify it fails**

Run: `cd backend; uv run pytest tests/e2e -q`

Expected: FAIL。

**Step 3: Write minimal implementation**

完成生产容器、健康检查、任务进程、Caddy HTTPS、日志轮转、备份和清理任务配置。生产密钥只通过服务器安全配置注入，不提交真实 `.env` 文件。

**Step 4: Run test to verify it passes**

Run: `cd backend; uv run pytest tests/e2e -q`

Expected: PASS。

**Step 5: Run the full verification gate**

Run:

```text
cd backend
uv run ruff check .
uv run ty check app
uv run pytest -q
docker compose -f ../deploy/compose.prod.yml config
```

Expected：静态检查、类型检查、单元测试、端到端测试全部通过，生产编排配置可以解析。

## 完成标准

- 三份样本可稳定导入，字段来源可追溯。
- 历史主目录 1,434 张估值表可批量导入，失败文件和质量问题有报告。
- `gz` 重复文件不重复污染业务数据，冲突文件进入复核。
- 同产品同日期修订不覆盖原版本，恢复和替代可审计。
- 普通看板只能读取已发布数据，业务员和管理员可以完成业务操作。
- 产品净值、回撤、持仓、资产配置和公司总览查询有覆盖率和质量状态。
- 服务器重启、任务重试、数据库备份和原始文件清理都有可验证结果。

