# 后端接口草案

接口统一前缀：`/api/v1`（第一版接口路径）。接口只返回已发布数据给看板；导入和复核接口可以返回待处理数据，但必须明确状态。

## 1. 通用响应结构

成功响应建议：

```json
{
  "data": {},
  "meta": {
    "request_id": "请求编号",
    "as_of": "2026-08-24",
    "quality_status": "valid",
    "coverage": {
      "available": 3,
      "total": 3
    }
  }
}
```

列表响应增加 `page`、`page_size`、`total`。

质量状态建议值：

- `valid`（有效）：覆盖完整且无阻断问题。
- `partial`（部分）：有产品缺报或数据日期不一致。
- `warning`（警告）：存在警告级校验或风险事件。
- `stale`（过期）：数据超过配置的迟到天数。
- `pending`（处理中）：任务尚未完成。

错误响应：

```json
{
  "error": {
    "code": "IMPORT_VERSION_CONFLICT",
    "message": "同一产品同一估值日存在其他待发布版本",
    "details": {}
  },
  "meta": {
    "request_id": "请求编号"
  }
}
```

接口不能把数据库异常原文直接返回给前端。

## 2. 认证接口

当前已实现的认证基础接口如下。

### `POST /api/v1/auth/initialize`（初始化第一个管理员）

只允许在数据库无用户时调用一次。请求包含账号、密码和可选显示名称；成功后直接建立管理员安全会话。

### `POST /api/v1/auth/login`（登录）

请求：账号、密码。

结果：设置安全会话，返回当前用户基本信息和可访问导航。导航仅用于前端显示，后端仍以每个接口的角色依赖为准。

### `POST /api/v1/auth/logout`（退出）

撤销当前会话。

### `GET /api/v1/auth/me`（当前用户）

返回用户编号、名称、角色、账号状态和最近登录时间。

### `POST /api/v1/auth/change-password`（修改密码）

请求旧密码和新密码；成功后撤销其他会话。

管理员账号管理已实现以下最小接口，所有接口都由后端 `admin`（管理员）角色依赖保护：

- `GET /api/v1/users`（用户列表）：支持账号关键字、角色、状态和分页筛选。
- `POST /api/v1/users`（创建用户）：创建 `admin`（管理员）、`operator`（业务员）或 `viewer`（普通看板）账号。
- `POST /api/v1/users/{user_id}/disable`（禁用账号）。
- `POST /api/v1/users/{user_id}/enable`（启用账号）。
- `POST /api/v1/users/{user_id}/reset-password`（重置密码并撤销会话）。
- `PATCH /api/v1/users/{user_id}/role`（修改角色）。
- `POST /api/v1/users/{user_id}/revoke-sessions`（撤销全部会话）。

登录失败返回通用错误，不泄露账号是否存在；连续 5 次失败锁定 15 分钟。会话通过 HttpOnly（禁止脚本读取）、生产环境 Secure（仅安全连接发送）、SameSite=Lax（限制跨站发送）的 Cookie 传递。

## 3. 总览和产品接口

### `GET /api/v1/dashboard/overview`（公司总览）

参数：

- `mode`：`latest`（最新状态）或 `same_day`（同日汇总）。
- `as_of`：同日汇总日期。
- `range`：收益和回撤区间。

当前实现的 `as_of`（估值日）按精确估值日筛选已发布版本；没有该日已发布数据的产品不回退到更早日期，并在 `coverage`（覆盖率）中体现缺口。停用产品不进入看板查询。

返回：总净资产、产品数、覆盖率、公司收益、综合指数、回撤、风险数量、产品概览和质量状态。

### `GET /api/v1/funds`（产品列表）

参数：名称、状态、策略、质量状态、日期、分页和排序。

### `POST /api/v1/funds`（新增产品）

权限：系统管理员、业务员。

请求必须包含标准名称、产品代码或内部编号、成立日期和至少一个别名；别名保存前按 `strip + casefold`（去首尾空白并忽略大小写）检查全局冲突。

### `GET /api/v1/funds/{fund_id}`（产品详情）

返回产品主数据、当前已发布版本和质量状态。

### `PATCH /api/v1/funds/{fund_id}`（修改产品）

权限：系统管理员、业务员。修改写入变更审计。

### `POST /api/v1/funds/{fund_id}/enable`（启用产品）

### `POST /api/v1/funds/{fund_id}/disable`（停用产品）

停用需要原因，不删除历史数据。

产品主数据维护已实现：`admin`（管理员）和 `operator`（业务员）可新增、修改、启用和停用产品；`viewer`（普通看板）不能调用维护接口。产品名称、产品代码和别名冲突统一返回 409（冲突），别名按 `strip + casefold`（去首尾空白并忽略大小写）判断，停用只改变产品状态并保留历史估值版本。

产品别名和份额类别维护接口如下：

- `GET /api/v1/funds/{fund_id}/aliases`（别名列表）。
- `POST /api/v1/funds/{fund_id}/aliases`（新增别名）。
- `PATCH /api/v1/funds/{fund_id}/aliases/{alias_id}`（修改别名）。
- `DELETE /api/v1/funds/{fund_id}/aliases/{alias_id}`（删除别名，仅影响主数据）。
- `GET /api/v1/funds/{fund_id}/share-classes`（份额类别主数据列表）。
- `POST /api/v1/funds/{fund_id}/share-classes`（新增份额类别）。
- `PATCH /api/v1/funds/{fund_id}/share-classes/{share_class_id}`（修改份额类别）。
- `POST /api/v1/funds/{fund_id}/share-classes/{share_class_id}/disable|enable`（停用或恢复份额类别）。

份额类别的 `disabled_from`（停用日期）派生 `status`（状态）；这些操作不会删除估值版本中的份额快照。

### `GET /api/v1/funds/{fund_id}/overview`（产品概览）

参数：估值日、区间、净值序列类型。

### `GET /api/v1/funds/{fund_id}/nav-series`（净值序列）

返回日期、单位净值、累计单位净值、日收益、累计收益、回撤、峰值信息和口径标识。

### `GET /api/v1/funds/{fund_id}/allocation`（资产配置）

参数：估值日、历史区间、分母类型、展开层级。

### `GET /api/v1/funds/{fund_id}/positions`（持仓）

参数：估值日、账户、市场、资产类别、是否穿透合并、排序和分页。

### `GET /api/v1/funds/{fund_id}/share-classes`（份额类别）

返回份额类别的净资产、资本、单位净值、累计净值、收益和对账差异。

### `GET /api/v1/funds/{fund_id}/quality`（数据质量）

返回当前版本的校验列表、版本差异和质量状态。

## 4. 导入接口

当前已实现的原始文件接收接口只允许 `admin`（管理员）和 `operator`（业务员），`viewer`（普通看板）不能查看导入运营状态。

### `POST /api/v1/imports`（创建导入批次）

请求：来源类型、文件数量、客户端信息。返回批次编号和上传地址或上传令牌。

### `POST /api/v1/imports/{batch_id}/files`（上传文件）

当前支持逐个文件上传，不实现分片。首期单文件大小限制为 20 MB；超过限制返回明确错误。

### `POST /api/v1/imports/{batch_id}/complete`（完成上传）

服务端核对批次文件后创建数据库后台任务；Excel 解析由后续任务实现。

### `GET /api/v1/imports`（导入列表）

参数：来源、产品、估值日、状态、严重度、时间和分页。

### `GET /api/v1/imports/{import_id}`（导入详情）

返回来源文件、邮件信息、识别结果、版本状态、任务状态和错误摘要。

Task 4（任务四）已实现的路径使用 `batch_id`（批次编号）：

- `POST /api/v1/imports`（创建导入批次）。
- `POST /api/v1/imports/{batch_id}/files`（接收单个 `.xls`（老式 Excel）或 `.xlsx`（新式 Excel）文件）。
- `POST /api/v1/imports/{batch_id}/complete`（完成上传并创建 `background_job`（后台任务））。
- `GET /api/v1/imports/{batch_id}`（查看批次、文件关联和任务状态）。
- `GET /api/v1/imports`（按来源、状态和分页查询导入批次）。
- `POST /api/v1/imports/{batch_id}/retry`（重置技术失败批次并重新排队）。
- `GET /api/v1/imports/{batch_id}/validations`（查询该批次产生的版本校验结果）。
- `GET /api/v1/imports/{batch_id}/source/{source_file_id}`（经权限和审计后下载原始文件）。

首期默认单文件上限为 20 MB（兆字节）。上传文件先写配置的临时目录，校验扩展名和文件头后计算 SHA-256（安全哈希），正式存储使用随机对象名；重复哈希返回幂等结果并只新增批次关联。当前后台任务已接入 Excel 解析、标准化落库和校验：任务处理器按原始文件幂等创建估值版本，未知产品或日期进入复核审计，阻断校验结果不会进入看板。

当前已实现的看板与复核 HTTP（网页接口）路径：

- `GET /api/v1/dashboard/overview`（公司总览，只读已发布版本）。
- `GET /api/v1/funds`、`GET /api/v1/funds/{fund_id}`（产品列表和详情）。
- `GET /api/v1/funds/{fund_id}/nav-series`（净值序列）。
- `GET /api/v1/funds/{fund_id}/positions`（持仓分页）。
- `GET /api/v1/funds/{fund_id}/quality`（校验结果和质量状态）。
- `GET /api/v1/reviews`、`POST /api/v1/reviews/{version_id}/acknowledge`（复核队列和复核决定）。
- `POST /api/v1/valuations/{version_id}/publish|reject|revoke|restore`（版本生命周期操作）。

看板查询只读取 `published`（已发布）版本；未发布、待复核、已替代和已撤回版本不会进入看板结果。发布、撤回和恢复会创建分析任务，worker（任务进程）完成后将受影响日期范围内的产品/公司指标及风险事件落库。`analysis_status`（分析状态）为 `ready`（就绪）、`pending`（等待）或 `stale`（过期）：没有覆盖当前版本的完成运行时为等待，最新相关运行失败时为过期，成功且已有对应指标时为就绪。响应同时返回实际指标来源的 `analysis_run_id`（分析运行编号），不把旧运行结果冒充当前结果。

导入任务状态返回尝试次数、租约时间、结束时间、错误编号和是否可重试。独立 worker（任务进程）通过 `python -m app.worker` 串行领取数据库任务；领取使用独立短事务，解析业务写入若发现租约已失效会整体回滚，旧 worker 不能提交结果。

### `GET /api/v1/imports/{import_id}/validations`（校验结果）

返回按严重度分组的规则结果和字段来源。

### `POST /api/v1/imports/{import_id}/retry`（重试任务）

只允许技术失败或任务超时的记录重试。

### `POST /api/v1/imports/{import_id}/publish`（发布版本）

请求：复核意见、是否确认警告。服务端再次检查状态和权限。

### `POST /api/v1/imports/{import_id}/reject`（驳回版本）

请求必须包含原因。

### `POST /api/v1/imports/{import_id}/revoke`（撤回版本）

影响看板，必须二次确认和原因。

### `POST /api/v1/imports/{import_id}/restore`（恢复旧版本）

将旧版本作为当前发布版本重新发布，保留完整审计。

### `GET /api/v1/imports/{import_id}/source`（原始来源）

返回受权限控制的临时下载地址或文件流，不暴露真实存储路径。

## 5. 复核和风险接口

### `GET /api/v1/reviews`（复核队列）

参数：状态、产品、严重度、异常类型、时间和分页。

### `POST /api/v1/reviews/{review_id}/acknowledge`（确认并继续）

记录复核人、意见和是否允许发布。

### `POST /api/v1/reviews/{review_id}/known-exception`（标记已知例外）

必须包含有效期、适用范围和理由。

### `GET /api/v1/risk/events`（风险事件）

权限：登录用户可读。参数：`fund_id`（产品）、`rule_code`（规则编码）、`severity`（严重度）、`status`（状态）、`start`/`end`（估值日期范围）和分页。

### `GET /api/v1/risk/rules`（风险规则）

默认返回每个 `rule_code`（规则编码）的最新版本；传 `include_history=true`（包含历史）返回全部版本。支持 `rule_code`、`enabled` 和分页筛选。

### `POST /api/v1/risk/rules`（新增风险规则）

权限：`admin`（系统管理员）或 `operator`（业务员）。请求包括 `rule_code`、`rule_type`、`scope`、`threshold`、`severity`、有效期和 `enabled`。`rule_type` 只支持 evaluator（规则计算器）已有的日收益、回撤、单票权重、前五大权重和集中度规则；不接入外部行情能力。

### `PATCH /api/v1/risk/rules/{rule_id}`（创建规则新版本）

权限：`admin`（系统管理员）或 `operator`（业务员）。不就地修改原记录，自动为同一规则编码生成递增数字版本；旧版本和既有风险事件保留。启用/停用同样通过新版本表达。

### `POST /api/v1/risk/events/{event_id}/resolve` 或 `/handle`（处理风险事件）

权限：`admin`（系统管理员）或 `operator`（业务员）。请求必须包含 `status`（只能为 `acknowledged`（已确认）、`resolved`（已解决）或 `ignored`（已忽略））和 `handling_note`（处理意见），可带 `evidence_reference`（证据引用）。服务端记录处理人、处理时间并写审计；不存在事件返回 404，非法状态返回 422。

## 6. 邮件接口

### `GET /api/v1/mail/settings`（邮箱设置）

权限：`admin`（系统管理员）或 `operator`（业务员）。只返回 `configured`（是否已配置）、服务器、端口、用户名、`credential_source`（凭据来源）、`credential_writable`（是否允许网页更新）和 `auto_sync_enabled`（自动同步是否开启），不返回授权码。

### `PUT /api/v1/mail/credential`（更新邮箱授权码）

仅 `admin`（系统管理员）。请求只接收 `authorization_code`（授权码，1--256 字符）。授权码原子写入 `MAIL_IMAP_PASSWORD_FILE` 指向的服务器受控文件，权限为 600；不进入数据库、响应、日志或审计摘要。若授权码由 `MAIL_IMAP_PASSWORD` 环境变量直接托管，或受控目录不可写，接口拒绝覆盖。

### `POST /api/v1/mail/pause` 和 `/resume`（暂停或恢复自动同步）

仅 `admin`（系统管理员）。开关保存在现有系统状态中并在每次定时同步前读取；重复操作幂等。暂停只影响定时同步，不阻止管理员或业务员调用“立即同步”。

### `POST /api/v1/mail/test-connection`（测试连接）

不导入附件。

### `POST /api/v1/mail/sync`（立即同步）

返回同步任务编号。

### `GET /api/v1/mail/sync-runs`（同步记录）

返回同步时间、邮件数量、附件数量、重复数量和错误摘要。

当前邮件同步使用标准库 IMAP（邮件接收协议）只读拉取 `INBOX`（收件箱），不删除或移动原邮件。同步按 Message-ID（邮件唯一标识）和附件 SHA-256（安全哈希）幂等；非 `.xls`/`.xlsx` 附件记录为忽略，单封邮件或单个附件失败不会中断后续邮件。附件接收统一调用正式导入服务，邮件接口不会复制 Excel（电子表格）解析逻辑。邮箱主机、端口、账号和协议仍由部署环境维护；网页只允许管理员更新受控文件中的授权码。

## 7. 配置、账号和审计接口

- `GET/POST/PATCH /api/v1/subjects/mappings`（科目映射查询和维护）。
- `POST /api/v1/subjects/mappings/{mapping_id}/disable`（停用科目映射，可带停用原因）。
- `GET/POST /api/v1/risk/rules`、`PATCH /api/v1/risk/rules/{rule_id}`（风险规则查询和版本化维护）。
- `GET/POST/PATCH /api/v1/users`（账号查询和管理员维护）。
- `POST /api/v1/users/{user_id}/reset-password`（管理员重置密码）。
- `POST /api/v1/users/{user_id}/disable`（禁用账号）。
- `GET /api/v1/audit-logs`（审计查询）。
- `GET/PATCH /api/v1/system/settings`（系统设置，管理员）。
- `GET /api/v1/system/health`（健康检查，不返回敏感配置）。
- `GET /api/v1/system/operations`（任务进程、队列、磁盘和备份的非敏感运维摘要）。
- `POST /api/v1/system/retention/preview`（管理员原始文件清理预演，永不删除）。
- `POST /api/v1/system/retention/execute`（管理员执行清理，必须提供固定确认短语和操作原因）。

系统设置只允许 `admin`（系统管理员）读取和修改，白名单为 `source_retention_days`（原始文件保留天数，1--3650）、`task_concurrency`（任务并发数，1--16）、`data_lateness_days`（数据迟到容忍天数，0--30）、`mail_sync_interval_minutes`（邮件同步间隔，1--1440）、`mail_sync_enabled`（自动邮件同步开关）、`backup_retention_days`（备份保留天数，1--3650）和 `timezone`（时区）。自动邮件同步开关在每次定时任务前读取；其他数据库配置不热更新，响应 `meta.runtime_note`（运行时说明）会明确这一点。

清理预演和执行均复用已有保留期限、备份检查、待复核保护、失败任务保护、审计锁和路径安全检查。执行请求必须包含 `confirmation: "DELETE_EXPIRED_SOURCE_FILES"` 和非空 `reason`（原因），否则返回 422；接口不能绕过任何安全判断。

审计查询允许 `admin`（系统管理员）和 `operator`（业务员）只读访问，支持 `actor_user_id`、`action`、`resource_type`、`result`、`start`/`end` 和分页过滤；接口只返回安全摘要并递归剔除密码、令牌、授权码和数据库连接信息，不提供删除接口。

科目映射至少提供科目代码/前缀或原始名称模式之一，支持标准类别、叶子标记、是否纳入持仓、有效期、规则版本和 active/inactive（启用/停用）状态。维护写入统一审计记录，停用映射只影响未来解析，不改写已有 `AccountSubjectDaily`（科目每日快照）。列表支持状态、标准类别和分页筛选。

## 8. 前端轮询约定

首期不做 WebSocket（网页长连接推送）。上传和后台任务使用：

- 任务创建后每 2 秒查询一次，连续 30 秒无变化后降为每 5 秒。
- 页面离开或任务完成后停止轮询。
- 服务端返回任务状态、进度、最近日志时间和是否可重试。

这样足以覆盖每天几十个文件的处理量，也减少部署和排错复杂度。

## 9. 生产 bootstrap（初始化）与迁移 preflight（预检）

业务目录初始化不是登录接口，也不从网页端接收密码。部署运维通过 `python -m app.bootstrap --config <json> [--dry-run] [--allow-existing]` 执行受控 JSON（结构化配置）文件。配置可包含产品、别名、份额类别、科目映射、风险规则和系统设置；明确拒绝 `password`（密码）、`password_hash`（密码哈希）、`token`（令牌）、`secret`（秘密）等敏感字段。管理员首个密码仍只通过 `POST /api/v1/auth/initialize` 设置。

`--dry-run`（预演）只验证 JSON、检查数据库连接、服务端源文件存储根目录、迁移清单格式及清单产品标签是否被配置中的产品名称或别名覆盖，并输出汇总，不写业务表、系统设置或审计日志。正式执行默认要求业务目录为空；检测到已有目录数据时拒绝，需显式 `--allow-existing` 才允许受控补充。按同一配置重复执行是幂等的；相同业务键已有但字段不一致时失败，不静默覆盖。所有实际创建、设置变更和 bootstrap 完成动作写入审计。

preflight（预检）只读取迁移清单的版本、根目录名称、条目数量和状态计数，不读取、移动、删除或修改历史源目录。预检通过不代表历史文件已导入；迁移仍须按 `docs/migration/README.md`（迁移说明）执行 dry-run、样本验收、人工处理冲突和断点续传。

## 10. 业务数据导出接口

导出接口统一前缀为 `/api/v1/exports`，返回 `text/csv`（逗号分隔文件）流，不生成服务端工作簿，也不把完整结果缓存为临时文件。所有导出都只读取当前用户可见的 active（启用）产品的 `published`（已发布）估值版本；没有符合条件的数据时仍返回带表头的空 CSV。

CSV 使用 UTF-8 BOM（字节顺序标记），便于 Windows（视窗系统）Excel（电子表格）正确识别中文。响应同时返回：

- `X-Exported-At`：本次导出时间，ISO 8601（国际日期时间格式）UTC（协调世界时）时间。
- `X-Data-As-Of`：请求的截至日期；未指定日期时为 `latest`（各产品最新已发布日期），区间导出为 `start/end`（起止日期）形式。
- `Content-Disposition`：固定 ASCII（美国信息交换标准代码）文件名，避免用户输入进入响应头。

每次导出写入一条 `export.*`（导出操作）审计日志，只记录导出类型、格式和筛选条件，不记录行内容、原始文件内容或敏感配置。CSV 中来自业务数据的文本若以 `=`, `+`, `-`, `@` 开头，会增加单引号前缀以防止电子表格公式注入；数值字段仍按数值文本输出。

### 看板导出

登录用户（`admin`（管理员）、`operator`（业务员）、`viewer`（普通看板））均可调用：

- `GET /api/v1/exports/overview`（公司总览）：可选 `as_of`（估值日）。字段为产品编号、产品名称、估值日、净资产、单位净值、日收益。
- `GET /api/v1/exports/funds`（产品列表）：可选 `q`（产品名称关键字）和 `as_of`（估值日）。字段为产品编号、产品名称、产品状态、估值日、单位净值、日收益。
- `GET /api/v1/exports/funds/{fund_id}/overview`（产品概览）：可选 `as_of`（估值日），字段为产品主数据、估值版本和资产净值摘要。
- `GET /api/v1/exports/funds/{fund_id}/nav-series`（净值序列）：可选 `start`（起始日期）和 `end`（结束日期），字段包含单位净值、累计单位净值、累计分红、调整后净值、日收益、累计收益和口径。
- `GET /api/v1/exports/funds/{fund_id}/allocation`（资产配置）：可选 `as_of`（估值日）和 `denominator`（分母），支持 `net_asset_value`（资产净值）、`total_assets`（总资产）和 `market_value`（持仓市值）。
- `GET /api/v1/exports/funds/{fund_id}/positions`（持仓）：可选 `as_of`（估值日）、`account`（账户）和 `market`（市场），字段包含证券、数量、成本、市值、净值权重和估值增值。
- `GET /api/v1/exports/funds/{fund_id}/share-classes`（份额数据）：可选 `as_of`（估值日），字段包含份额类别、净资产、实收资本、单位净值、累计净值和周期收益。

指定 `fund_id`（产品编号）不存在或产品已停用时返回 404；指定产品存在但没有相应已发布版本时返回带表头的空 CSV。`nav-series`（净值序列）和导入报告的日期区间不允许起始日期晚于结束日期。

### 导入处理报告

`GET /api/v1/exports/imports`（导入处理报告）仅允许 `admin`（管理员）和 `operator`（业务员），`viewer`（普通看板）返回 403。可选筛选参数为 `source_type`（来源类型）、`status`（批次状态）、`start`（创建起始日期）和 `end`（创建结束日期）。字段为批次编号、来源、文件数、批次状态、任务状态和创建时间；原始文件下载仍使用导入接口的受控原始文件路径，不在导出接口中暴露存储对象名。
