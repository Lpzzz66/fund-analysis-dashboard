# 估值看板范围收敛与真实数据闭环实施计划

> 实施要求：用户确认第 1 节决策后，按批次执行并在每个批次结束时统一审计。

**目标：** 以 Excel（电子表格）唯一业务数据源为硬边界，修复确定性解析缺口，删除或隐藏无真实依据的页面承诺，并让保留页面全部通过正式后端接口读取可追溯数据。

**架构：** 保留现有模块化单体、PostgreSQL（关系型数据库）、独立 worker（任务进程）和 React（前端框架）结构。解析器只负责把工作簿转换为明确的规范模型；导入处理器负责持久化；分析任务只消费已发布规范数据；查询路由负责页面所需的只读投影；前端只有一个正式 HTTP（网页接口）适配器，不复制业务计算。此次不引入 Redis（内存数据库）、消息中间件、外部行情或新的组织权限层。

**技术栈：** FastAPI（后端框架）、SQLAlchemy（数据库映射）、Alembic（数据库迁移）、pytest（测试框架）、React（前端框架）、TypeScript（类型语言）、Ant Design（界面库）、Recharts（图表库）、Vite（构建工具）。

---

状态：2026-08-26 用户已批准执行；决策 A、B、C、E 采用推荐方案，决策 D 按用户要求增加邮箱授权码维护、自动同步暂停/恢复和手工清理。

## 1. 开工前决策

以下决策会改变数据模型或页面范围，不能由开发过程自行猜测。

### 决策 A：非 Excel 主数据

推荐：首期页面删除“策略、负责人、基金经理、业绩基准”字段和筛选。数据库现有可空列不做破坏性删除，只停止承诺、停止展示和停止导出。

备选：保留为人工维护的可选主数据，并在页面明确标记来源为“人工维护”。这会扩展“Excel 唯一业务数据源”的原始边界。

### 决策 B：本轮新增解析字段

推荐本轮只补四项确定性缺口：

1. 季度净值增长率。
2. 累计派现金额。
3. 份额实收资本。
4. 份额日收益。

年初单位净值、已实现收益、可分配利润虽然在 2,787 张表中存在，但当前产品基线没有必须展示，推荐暂不扩展。

### 决策 C：账户、市场和来源追溯深度

推荐：

- 从科目层级提取账户和市场，允许为空；筛选选项只根据真实数据动态生成。
- 暂不开放“穿透合并证券”按钮，集中度计算仍在后端按证券代码归并。
- 汇总字段追溯到原文件、工作表和单元格。
- 持仓追溯到原文件、工作表、原始科目代码和行号。
- 计算指标追溯到估值版本、分析运行和方法版本，不伪装成单个 Excel 单元格来源。

### 决策 D：未闭环运营按钮

本轮隐藏而不是补做：重新解析、重新校验、已知例外、科目映射试跑、风险规则试算和网页版目录导入。

保留并接真实接口：上传、开始处理、重试单个失败批次、复核、发布、驳回、撤回、恢复、下载原文件、邮件授权码保存、邮件测试连接、立即同步、自动同步暂停/恢复、风险事件处理、系统运维状态、原始文件清理预演和管理员手工执行清理。

### 决策 E：历史数据权威范围

推荐：正式迁移只使用主目录 1,434 张估值表。`gz`（归档目录）仅保留盘点和冲突证据，不进入首轮业务库；6 组同日内容冲突继续保持人工复核状态，不自动覆盖主目录。

## 2. 执行纪律

- 新建 `feature/scope-convergence`（范围收敛功能分支），不直接在 `main`（主分支）开发。
- 现有前端 Demo（演示）先形成独立基线提交，再开始修正，便于审计真实改动。
- `.zcode`、环境文件、授权码、数据库密码、会话令牌和生产配置不得提交。
- 不删除或移动文件。模拟数据文件保留原路径，但停止被生产入口引用，并通过说明文件明确标记为仅供演示；是否最终删除另行请求用户授权。
- 每个开发批次包含 2--4 个相关任务后统一做一次规格审计和质量审计，避免每个小步骤反复交接。
- 每个逻辑任务保持独立提交；每批次完成后推送 GitHub（代码托管平台）。
- 后端行为先写失败测试，再做最小实现；前端至少为接口适配、权限和关键口径函数补单元测试。
- 不引入与本轮目标无关的缓存、事件总线、通用仓储层或额外服务层。
- 已在提交 `1a5785d` 至 `1c216c9` 完成并验收的目录路由拆分、数据库分页、导入别名查询、保留策略查询、迁移工具封装、发布服务类型收敛和质量门禁不重复重构；仅在本轮改动造成回归时做局部修复。

## 3. 批次一：冻结范围并修复解析链路

### Task 1：接收并冻结前端 Demo 基线

**Files:**

- Stage only: `frontend/**`
- Exclude: `.zcode/**`
- Modify: `frontend/README.md`

**Steps:**

1. 检查前端依赖、构建脚本和未跟踪文件，不修改用户已有内容。
2. 运行 `npm run typecheck` 和 `npm run build`，记录已知问题。
3. 扫描前端文件中是否存在密码、令牌、域名私密配置和本机绝对路径。
4. 在 `frontend/README.md` 标明该提交是模拟数据原型，不代表业务功能完成。
5. 只提交 `frontend/**`，不得包含 `.zcode/**`。

**Verification:**

```powershell
Set-Location F:\AgentWorks\基金分析看板\frontend
$env:npm_config_cache = 'F:\AgentTools\npm-cache'
npm run typecheck
npm run build
```

Expected: 类型检查和生产构建通过；Git 暂存区只包含前端原型。

**Commit:** `chore: checkpoint audited frontend prototype`

### Task 2：冻结产品和页面范围

**Files:**

- Modify: `docs/01-产品设计基线.md`
- Modify: `docs/02-页面与交互设计.md`
- Modify: `docs/04-数据模型与导入状态.md`
- Modify: `docs/05-API-接口草案.md`
- Modify: `docs/07-Excel能力边界与前端Demo审计.md`
- Modify: `frontend/README.md`

**Steps:**

1. 根据用户对第 1 节的答复删除或重分类非 Excel 字段。
2. 把接口文档拆成“当前必须实现”和“明确延期”，不再混用目标接口与现状说明。
3. 把账户、市场、来源、风险规则和邮件配置的限制写成可验收规则。
4. 建立页面保留清单和隐藏清单，后续前端不得自行增加按钮。
5. 检查 `docs/01`、`02`、`04`、`05` 之间不再互相矛盾。

**Verification:**

```powershell
rg -n "Alpha|Beta|VaR|压力测试|行业|风格|流动性天数|合同限额|精确归因" docs/01-产品设计基线.md docs/02-页面与交互设计.md
rg -n "策略|负责人|基金经理|基准" docs/01-产品设计基线.md docs/02-页面与交互设计.md
```

Expected: 范围外能力只出现在“明确不承诺”或“延期”章节；非 Excel 主数据符合用户决策。

**Commit:** `docs: freeze Excel-only product scope`

### Task 3：修复四个确定性解析缺口

**Files:**

- Modify: `backend/app/parser/interface.py`
- Modify: `backend/app/parser/valuation_parser.py`
- Modify: `backend/app/imports/processor.py`
- Modify: `backend/tests/parser/test_samples.py`
- Modify: `backend/tests/imports/test_processor.py`
- Modify: `backend/tests/validation/test_rules.py`

**Interface changes:**

```python
@dataclass(frozen=True, slots=True)
class ParsedShareClass:
    share_code: str
    share_name: str
    net_assets: Decimal | None
    paid_in_capital: Decimal | None
    unit_nav: Decimal | None
    cumulative_unit_nav: Decimal | None
    previous_unit_nav: Decimal | None
    daily_return: Decimal | None
```

`ParsedValuation.qtd_return` 和 `ParsedValuation.cumulative_payout` 保持既有接口，只修正标签识别。

**Steps:**

1. 为实际标签“净值季度增长率(%)”“累计派现金额”和带完整份额代码的日收益/实收资本写失败测试。
2. 运行解析器和导入处理器测试，确认新断言先失败。
3. 使用规范化标签匹配实际文本，不为每个产品写产品专属条件。
4. 把份额实收资本写入现有 `ShareClassDailySnapshot.paid_in_capital` 列。
5. 更新所有 `ParsedShareClass` 测试构造，禁止静默默认值掩盖字段顺序错误。
6. 对三份真实样本断言四项字段非空。

**Verification:**

```powershell
Set-Location F:\AgentWorks\基金分析看板\backend
& '..\.venv\Scripts\python.exe' -m pytest tests/parser tests/imports/test_processor.py tests/validation/test_rules.py -q
```

Expected: 目标测试通过，既有解析和校验行为不回归。

**Commit:** `fix: parse complete return and share fields`

### Task 4：提取可空账户、市场和行级来源

此任务仅在用户批准决策 C 后执行。

**Files:**

- Create: `backend/alembic/versions/0006_position_source.py`
- Modify: `backend/app/parser/interface.py`
- Modify: `backend/app/parser/valuation_parser.py`
- Modify: `backend/app/db/models/valuation.py`
- Modify: `backend/app/imports/processor.py`
- Modify: `backend/tests/parser/test_samples.py`
- Modify: `backend/tests/imports/test_processor.py`
- Modify: `backend/tests/db/test_schema.py`

**Implementation:**

- `ParsedSubject` 保存源行号。
- `ParsedPosition` 增加可空 `market`、`account`、`source_row`。
- 从当前叶子科目的祖先科目名称提取显式账户和市场；没有明确证据时返回 `None`，不按证券代码猜测。
- `AccountSubjectDaily` 增加源工作表和源行。
- `PositionDaily` 增加原始科目代码、源工作表和源行；现有市场、账户列直接使用。

**Tests:**

1. 显式账户和市场层级可以提取。
2. 普通持仓没有明确层级时两字段为空。
3. 多层级科目不会把证券名称误当账户。
4. 导入后源文件、工作表、行号和原始科目代码仍可查询。
5. 数据库升级、回退和再升级通过。

**Verification:**

```powershell
& '..\.venv\Scripts\python.exe' -m pytest tests/parser tests/imports/test_processor.py tests/db/test_schema.py -q
& '..\.venv\Scripts\python.exe' -m alembic upgrade head
& '..\.venv\Scripts\python.exe' -m alembic downgrade 0005_analysis_trigger_version
& '..\.venv\Scripts\python.exe' -m alembic upgrade head
```

**Commit:** `feat: preserve position account market and source`

### Task 5：补齐邮箱凭据、同步开关和手工清理控制

**Files:**

- Create: `backend/app/mail/credential_store.py`
- Modify: `backend/app/mail/config.py`
- Modify: `backend/app/api/mail.py`
- Modify: `backend/app/system/settings.py`
- Modify: `backend/app/system/maintenance.py`
- Modify: `backend/app/api/system.py`
- Modify: `backend/tests/mail/test_sync.py`
- Modify: `backend/tests/api/test_risk_system.py`
- Modify: `backend/tests/test_maintenance.py`
- Modify: `deploy/compose.prod.yml`
- Modify: `deploy/.env.example`
- Modify: `docs/runbook.md`
- Modify: `docs/05-API-接口草案.md`

**接口与权限：**

- `PUT /api/v1/mail/credential`：仅管理员；请求只包含 `authorization_code`，长度 1--256。响应只返回是否已配置、凭据来源和是否可由网页更新，绝不回显授权码。
- `POST /api/v1/mail/pause` 与 `POST /api/v1/mail/resume`：仅管理员；只控制定时自动同步。管理员和业务员仍可调用“立即同步”。重复暂停或恢复保持幂等。
- `POST /api/v1/system/retention/preview`：仅管理员；始终调用现有清理服务的预演模式，不删除文件。
- `POST /api/v1/system/retention/execute`：仅管理员；请求必须包含 `confirmation: "DELETE_EXPIRED_SOURCE_FILES"` 和非空 `reason`，否则返回 422。

**安全和运行边界：**

- 授权码写入 `MAIL_IMAP_PASSWORD_FILE` 指向的服务器受控文件，不进入数据库、日志、审计摘要、异常文本或接口响应。
- 使用同目录临时文件、权限 `0600` 和原子替换；目标目录不存在、不可写或环境变量 `MAIL_IMAP_PASSWORD` 已直接提供凭据时拒绝网页覆盖并返回稳定错误。
- 生产部署把受控秘密目录以可写方式只挂载给 API（接口服务），以只读方式挂载给 worker（任务进程）；不增加独立密钥服务或数据库迁移。
- 自动同步开关保存在现有 `SystemState.settings`，默认开启；每次定时同步执行前读取，暂停时返回可审计的跳过结果，不建立第二套调度器。
- 手工清理复用现有保留期限、备份、待复核、失败任务、审计锁和路径安全检查；接口不能绕过任何保护。执行结果和操作原因写审计，但不返回服务器绝对路径。

**测试：**

1. 授权码写入受控文件且权限正确，响应、审计和错误均不泄露明文。
2. 环境变量凭据优先时拒绝网页覆盖；未配置可写秘密文件时安全失败。
3. 管理员可暂停/恢复，业务员和普通看板不能修改；暂停不阻止手工立即同步。
4. 定时维护在暂停时不连接邮箱，恢复后正常执行。
5. 清理预演不删除；正式执行缺少确认短语或原因时拒绝。
6. 正式执行仍跳过未备份、待复核、失败任务和审计锁定文件，并记录操作者和原因。

**Commit:** `feat: add controlled mail and retention operations`

### 批次一统一审计

- 对 2,787 张历史估值表重新解析，必须仍为 2,787 成功、0 失败。
- 四项确定字段必须达到预期覆盖；账户和市场只报告真实覆盖，不设虚假 100% 目标。
- 运行后端全量测试、Ruff（静态检查）、格式检查和 ty（类型检查）。
- 审计该批次没有增加外部数据字段或产品专属解析分支。

## 4. 批次二：补齐有限的展示接口

### Task 6：拆分过大的基金查询路由

**Files:**

- Create: `backend/app/api/fund_views.py`
- Modify: `backend/app/api/dashboard.py`
- Modify: `backend/app/main.py`
- Modify: `backend/tests/api/test_dashboard.py`

**Scope:**

- `dashboard.py` 只保留公司总览和公司序列。
- `fund_views.py` 承担产品列表、详情、净值、持仓、质量和本轮新增产品分析查询。
- 不新增仓储层或通用查询框架；仅移动现有路由及其直接查询辅助函数。
- 路径、权限、响应和测试保持不变。

**Verification:** 先运行既有看板接口测试证明行为未变，再进行新增接口工作。

**Commit:** `refactor: separate fund analysis routes`

### Task 7：公司序列和产品概览接口

**Files:**

- Modify: `backend/app/api/dashboard.py`
- Modify: `backend/app/api/fund_views.py`
- Modify: `backend/tests/api/test_dashboard.py`
- Modify: `backend/tests/analytics/test_company_index.py`

**Required endpoints:**

- `GET /api/v1/dashboard/company-series?start=&end=`
- `GET /api/v1/funds/{fund_id}/overview?as_of=&start=&end=`

**Company series response:** 日期、公司指数、公司日收益、有效产品数、总净资产、分析状态、分析运行编号。

**Fund overview response:** 产品与估值版本、总资产、总负债、净资产、单位/累计净值、日/月/季/年收益、可用头寸、杠杆率、当前回撤、区间最大回撤、峰谷日期、分析状态和口径。

**Rules:**

- 未发布版本不得进入响应。
- 指定日期不向前填充。
- 没有成功分析运行时返回 `pending`（等待）或 `stale`（过期），不冒用旧指标。
- 公司有效产品数使用 `CompanyMetricDaily.effective_fund_count`，不使用产品总数代替。

**Commit:** `feat: expose company series and fund overview`

### Task 8：扩展净值、资产配置、持仓和份额查询

**Files:**

- Modify: `backend/app/api/fund_views.py`
- Modify: `backend/tests/api/test_dashboard.py`
- Modify: `backend/tests/test_exports.py`

**Required behavior:**

- 净值序列每点增加回撤、历史峰值和真实区间收益；快捷区间由前端传真实日期。
- 增加 `GET /api/v1/funds/{fund_id}/allocation`，只聚合已映射、叶子且允许纳入配置的科目。
- 持仓增加可选 `account`、`market` 和白名单排序；不在本轮增加穿透合并参数。
- 增加 `GET /api/v1/funds/{fund_id}/share-snapshots`，避免与份额主数据路径混淆。
- 查询和 CSV 导出复用同一筛选口径，但不创建无价值的通用导出框架。
- 空值保持空值，不用 0 代替。

**Commit:** `feat: complete published fund analysis queries`

### Task 9：版本、差异和来源接口

**Files:**

- Create: `backend/app/api/valuation_views.py`
- Modify: `backend/app/main.py`
- Modify: `backend/tests/api/test_reviews.py`
- Modify: `backend/tests/api/test_dashboard.py`

**Required endpoints:**

- `GET /api/v1/funds/{fund_id}/versions`
- `GET /api/v1/valuations/{version_id}/diff?previous_version_id=`
- `GET /api/v1/valuations/{version_id}/sources`

**Source interface:**

```json
{
  "source_file_id": 123,
  "valuation_version_id": 456,
  "worksheet": "估值表",
  "row": 42,
  "column": 8,
  "subject_code": null,
  "analysis_run_id": null,
  "methodology_version": null
}
```

汇总字段使用单元格来源；持仓使用原始科目和行；计算指标使用版本、分析运行和方法版本。原始文件下载继续走已有受权接口并写审计。

**Commit:** `feat: expose valuation history diff and sources`

### Task 10：收紧列表参数与接口文档

**Files:**

- Modify: `backend/app/api/fund_views.py`
- Modify: `backend/app/api/imports.py`
- Modify: `backend/app/api/reviews.py`
- Modify: `backend/tests/api/test_dashboard.py`
- Modify: `backend/tests/api/test_import_operations.py`
- Modify: `backend/tests/api/test_reviews.py`
- Modify: `docs/05-API-接口草案.md`

**Scope:**

- 只增加前端保留页面确实需要的筛选。
- 产品列表不增加策略和负责人筛选。
- 复核列表增加产品、严重度、日期和分页；不实现已知例外。
- 导入列表保持来源、状态和分页；批量“重试全部”不实现。
- 文档准确列出每个参数，不使用“等”或“全部支持排序”模糊承诺。

**Commit:** `feat: align operational queries with retained UI`

### 批次二统一审计

- 所有新接口只读已发布版本或明确的运营状态。
- 检查分页、N+1 查询、空值、权限和日期边界。
- 使用 `viewer`（普通看板）、`operator`（业务员）和 `admin`（管理员）三种角色运行接口权限矩阵。
- 更新 OpenAPI（接口描述）和 `docs/05` 后再进入前端接入。

## 5. 批次三：前端去模拟化和页面收敛

### Task 11：建立唯一正式 HTTP 适配器

**Files:**

- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/api/types.ts`
- Create: `frontend/src/api/index.ts`
- Modify: `frontend/src/app/auth.tsx`
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`

**Interface:**

- `client.ts` 只处理同源 Cookie（会话凭据）、JSON、文件上传、CSV 下载、错误映射和请求取消。
- `index.ts` 提供与后端路径一一对应的领域函数，不在前端重新计算后端指标。
- `types.ts` 保存页面实际使用的响应类型，不复制数据库模型。
- 生产默认同源 `/api/v1`；开发由 Vite 代理到本地后端。
- 认证启动先读取 `/auth/me`；删除任意密码登录和角色切换模拟逻辑。

**Tests:**

- 增加 Vitest（前端单元测试）作为唯一新测试依赖。
- 测试 Cookie 请求、401 跳转、错误消息、文件上传和 CSV 下载文件名。
- 不引入第二套状态管理库。

**Commit:** `feat: connect frontend to authenticated backend`

### Task 12：收敛总览、产品列表和产品详情

**Files:**

- Modify: `frontend/src/pages/Dashboard.tsx`
- Modify: `frontend/src/pages/Funds.tsx`
- Modify: `frontend/src/pages/FundDetail/index.tsx`
- Modify: `frontend/src/pages/FundDetail/tabs/Overview.tsx`
- Modify: `frontend/src/pages/FundDetail/tabs/NavDrawdown.tsx`
- Modify: `frontend/src/pages/FundDetail/tabs/Allocation.tsx`
- Modify: `frontend/src/pages/FundDetail/tabs/Positions.tsx`
- Modify: `frontend/src/pages/FundDetail/tabs/ShareClasses.tsx`
- Modify: `frontend/src/pages/FundDetail/tabs/Quality.tsx`
- Modify: `frontend/src/components/index.tsx`
- Test: `frontend/src/**/*.test.tsx`

**Required changes:**

- 移除全部固定日期、固定版本、固定覆盖率和固定业务数字。
- 风险产品只读取风险事件，不在浏览器按日收益伪造。
- “公司综合收益”改为明确的“公司当日收益”或真实选定区间收益。
- “基准 1.0000”改为“指数起始值 1.0000”。
- 快捷区间生成真实起止日期，不按记录条数切片。
- 区间收益按区间首尾调整后净值计算或直接使用后端返回值。
- 资产配置合计显示实际权重和未映射提示，不固定 100%。
- 账户和市场下拉从实际数据生成；无数据时不显示筛选。
- 来源链接必须打开真实来源抽屉或原文件下载，不再只显示悬浮提示。
- 所有导出调用后端 CSV 接口，不导出当前页模拟数组。

**Commit:** `feat: render trusted dashboard and fund analysis data`

### Task 13：接入导入、复核、邮件和风险页面

**Files:**

- Modify: `frontend/src/pages/Imports.tsx`
- Modify: `frontend/src/pages/Reviews.tsx`
- Modify: `frontend/src/pages/Mail.tsx`
- Modify: `frontend/src/pages/RiskOverview.tsx`
- Modify: `frontend/src/pages/AdminRiskRules.tsx`

**Required changes:**

- 上传发送真实文件内容，完成批次后按 2 秒/5 秒节奏轮询任务状态。
- 只显示单批次可重试按钮；不提供“重试全部”。
- 复核接真实列表、详情、确认发布、驳回、撤回和恢复。
- 隐藏重新解析、重新校验、已知例外和规则试算。
- 邮件页面提供管理员授权码输入和保存、自动同步暂停/恢复、测试连接、立即同步和同步记录；授权码提交后立即清空输入，页面永不读取或展示已保存明文。
- 风险规则类型从后端支持集合生成；事件处理写真实意见和证据引用。

**Commit:** `feat: connect import review mail and risk workflows`

### Task 14：接入主数据和系统管理页面

**Files:**

- Modify: `frontend/src/pages/AdminFunds.tsx`
- Modify: `frontend/src/pages/AdminSubjects.tsx`
- Modify: `frontend/src/pages/AdminUsers.tsx`
- Modify: `frontend/src/pages/AdminAudit.tsx`
- Modify: `frontend/src/pages/AdminSettings.tsx`
- Modify: `frontend/src/pages/AdminRetention.tsx`
- Modify: `frontend/src/app/layout.tsx`
- Modify: `frontend/src/utils/permissions.ts`

**Required changes:**

- 产品、别名、份额类别、科目映射、账号、审计和设置全部接真实接口。
- 删除页面中的硬编码变更记录、命中样本和登录记录；没有接口时不展示入口。
- 审计时间和操作人筛选必须真正传参。
- 数据保留页面复用 `/system/operations` 展示 worker、队列、磁盘和备份，并提供清理预演与管理员手工执行；执行前显示预演结果，要求二次确认、输入确认短语和操作原因。
- 路由增加角色守卫；无权限页面显示 403 状态，不仅隐藏导航。
- 普通看板所有写按钮不可见，后端权限测试继续作为最终安全边界。

**Commit:** `feat: connect catalog and system administration pages`

### Task 15：隔离模拟数据

**Files:**

- Modify: `frontend/README.md`
- Modify: `frontend/src/mock/README.md`
- Modify: `frontend/tsconfig.json` if exclusion is required

**Rules:**

- 保留 `frontend/src/mock` 原目录及全部文件，不删除、不移动。
- 生产入口和正式页面不得引用 `mock`（模拟数据）目录。
- 模拟数据只用于对比原型，不参与正式运行；构建工具无法按目录排除时，允许随源码编译检查但不得进入运行依赖图。
- `rg -n "@/mock|from .*mock" frontend/src` 必须无正式入口命中。

**Commit:** `chore: isolate synthetic frontend data`

### 批次三统一审计

- 运行前端类型检查、单元测试和生产构建。
- 使用真实本地后端完成管理员、业务员、普通看板三种角色浏览。
- 对桌面 1440×900、宽屏 1920×1080 和移动宽度 390×844 做截图检查。
- 检查页面没有重叠、固定假数字、无效按钮和模拟来源。
- 检查浏览器控制台、网络错误、401/403 和空数据状态。

## 6. 批次四：端到端验收和历史迁移预演

### Task 16：扩展端到端测试

**Files:**

- Modify: `backend/tests/e2e/test_import_publish_dashboard.py`
- Create: `backend/tests/e2e/test_scope_convergence.py`
- Modify: `backend/tests/api/conftest.py`
- Modify: `.github/workflows/quality.yml`

**Scenarios:**

1. 上传包含四个修复字段的估值表。
2. worker 解析、标准化、校验并产生可发布版本。
3. 发布后分析任务生成产品指标、公司指标和风险事件。
4. 总览、产品概览、净值回撤、配置、持仓、份额、质量、版本和来源接口读取同一发布版本。
5. 修订历史日期后只替代旧版本并重算受影响区间。
6. 普通看板不能上传、复核、发布、维护或下载受限原文件。
7. 空字段、缺少市场/账户和未映射科目保持可解释的空值。

**Commit:** `test: cover converged valuation workflow`

### Task 17：2,787 张解析回归和迁移预检

**Inputs:**

- Read only: `F:\AgentWorks\估值表A`
- Output: `artifacts/scope-convergence/`

**Steps:**

1. 对 2,787 张文件运行正式解析器，保存字段覆盖、警告、失败和耗时报告。
2. 对主目录 1,434 张运行迁移 `dry-run`（预演），确认产品别名全部匹配。
3. 先导入三份样本，再导入每产品连续 10 个日期，完成净值、份额、持仓、配置和来源人工抽查。
4. 在全新测试数据库导入主目录 1,434 张，记录成功、待复核、失败、覆盖率和磁盘占用。
5. 不导入 `gz`；6 组冲突保持独立报告。
6. 比较导入前后源目录的相对路径、大小和修改时间，确认无移动、删除或内容变化。

**Acceptance:**

- 解析 2,787 成功、0 技术失败。
- 主目录 1,434 无重复污染。
- 三个产品的日期范围和数量与盘点报告一致。
- 四个修复字段达到审计预期。
- 账户和市场只报告真实非空率。
- 源目录内容无变化。

**Commit:** `docs: record parser and migration acceptance`

### Task 18：全量质量门禁和文档收口

**Files:**

- Modify: `docs/README.md`
- Modify: `docs/runbook.md`
- Modify: `docs/05-API-接口草案.md`
- Modify: `docs/06-历史数据迁移清单.md`
- Modify: `docs/07-Excel能力边界与前端Demo审计.md`
- Modify: `frontend/README.md`

**Backend verification:**

```powershell
Set-Location F:\AgentWorks\基金分析看板\backend
& '..\.venv\Scripts\python.exe' -m ruff check app tests
& '..\.venv\Scripts\python.exe' -m ruff format --check app tests
& '..\.venv\Scripts\python.exe' -m ty check app
& '..\.venv\Scripts\python.exe' -m pytest -q
```

**Inventory verification:**

```powershell
Set-Location F:\AgentWorks\基金分析看板
& '.\.venv\Scripts\python.exe' -m pytest tools/valuation_inventory/tests -q
```

**Frontend verification:**

```powershell
Set-Location F:\AgentWorks\基金分析看板\frontend
$env:npm_config_cache = 'F:\AgentTools\npm-cache'
npm run typecheck
npm run test
npm run build
```

**Repository verification:**

- `git diff --check` 通过。
- `git status` 只包含本轮预期文件。
- 密钥扫描无命中。
- GitHub Actions（GitHub 自动检查）通过。
- 文档中的接口、页面和实际代码一致。

**Commit:** `docs: finalize converged product scope`

## 7. 预计投入和并行方式

| 批次 | 预计人日 | 可并行工作 |
|---|---:|---|
| 范围、解析与运维控制 | 3--5 | 文档冻结、解析测试与运维控制可并行，公共接口由主代理统一审计 |
| 查询接口 | 4--6 | 公司接口、产品接口、版本来源接口可由不同代理处理 |
| 前端收敛 | 6--9 | 数据适配完成后，分析页和运营管理页可分组并行 |
| 验收迁移 | 2--4 | 前端视觉验收与后端历史预检可并行 |

总量约 15--25 人日。使用 2--3 个子代理处理互不重叠的文件组，预计 6--11 个工作日完成；每个批次统一审计一次，不为每个小任务重复完整审计。

## 8. 完成标准

- 正式前端没有模拟业务数据、固定业务数字或无效按钮。
- 保留页面全部有真实后端接口和明确权限。
- Excel 不存在的字段不出现在首期业务展示中。
- 四个确定性解析缺口在历史样本中闭环。
- 市场、账户和来源缺失时明确为空，不被猜测或默认正常。
- 公司和产品收益、回撤、覆盖率使用统一后端口径。
- 上传、复核、发布、分析、查询、导出和审计形成完整链路。
- 2,787 张历史文件可稳定解析，主目录 1,434 张可受控迁移。
- 2C4G 目标服务器不新增非必要常驻服务。
- 代码、测试、接口文档、运行手册和 GitHub 历史同步更新。
