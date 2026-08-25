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

### `POST /api/v1/auth/login`（登录）

请求：账号、密码。

结果：设置安全会话，返回当前用户基本信息和可访问导航。

### `POST /api/v1/auth/logout`（退出）

撤销当前会话。

### `GET /api/v1/auth/me`（当前用户）

返回用户编号、名称、角色、账号状态和最近登录时间。

### `POST /api/v1/auth/change-password`（修改密码）

请求旧密码、新密码和确认密码；成功后撤销其他会话。

## 3. 总览和产品接口

### `GET /api/v1/dashboard/overview`（公司总览）

参数：

- `mode`：`latest`（最新状态）或 `same_day`（同日汇总）。
- `as_of`：同日汇总日期。
- `range`：收益和回撤区间。

返回：总净资产、产品数、覆盖率、公司收益、综合指数、回撤、风险数量、产品概览和质量状态。

### `GET /api/v1/funds`（产品列表）

参数：名称、状态、策略、质量状态、日期、分页和排序。

### `POST /api/v1/funds`（新增产品）

权限：系统管理员、业务员。

请求至少包含标准名称、产品代码或内部编号、成立日期和别名。

### `GET /api/v1/funds/{fund_id}`（产品详情）

返回产品主数据、当前已发布版本和质量状态。

### `PATCH /api/v1/funds/{fund_id}`（修改产品）

权限：系统管理员、业务员。修改写入变更审计。

### `POST /api/v1/funds/{fund_id}/enable`（启用产品）

### `POST /api/v1/funds/{fund_id}/disable`（停用产品）

停用需要原因，不删除历史数据。

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

### `POST /api/v1/imports`（创建导入批次）

请求：来源类型、文件数量、客户端信息。返回批次编号和上传地址或上传令牌。

### `POST /api/v1/imports/{batch_id}/files`（上传文件）

支持单文件或分片上传。首期单文件大小限制建议 20 MB；超过限制返回明确错误。

### `POST /api/v1/imports/{batch_id}/complete`（完成上传）

服务端核对文件哈希后创建解析任务。

### `GET /api/v1/imports`（导入列表）

参数：来源、产品、估值日、状态、严重度、时间和分页。

### `GET /api/v1/imports/{import_id}`（导入详情）

返回来源文件、邮件信息、识别结果、版本状态、任务状态和错误摘要。

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

参数：产品、规则、严重度、状态、日期和分页。

### `POST /api/v1/risk/events/{event_id}/resolve`（处理风险事件）

请求：处理意见、处置状态、附件或证据引用。

## 6. 邮件接口

### `GET /api/v1/mail/settings`（邮箱设置）

只返回是否已配置、服务器和端口，不返回授权码。

### `PUT /api/v1/mail/settings`（保存邮箱设置）

权限：系统管理员。授权码从请求进入服务端后只保存加密值或安全配置引用。

### `POST /api/v1/mail/test-connection`（测试连接）

不导入附件。

### `POST /api/v1/mail/sync`（立即同步）

返回同步任务编号。

### `GET /api/v1/mail/sync-runs`（同步记录）

返回同步时间、邮件数量、附件数量、重复数量和错误摘要。

## 7. 配置、账号和审计接口

- `GET/POST/PATCH /api/v1/subjects/mappings`（科目映射查询和维护）。
- `GET/POST/PATCH /api/v1/risk/rules`（风险规则查询和维护）。
- `GET/POST/PATCH /api/v1/users`（账号查询和管理员维护）。
- `POST /api/v1/users/{user_id}/reset-password`（管理员重置密码）。
- `POST /api/v1/users/{user_id}/disable`（禁用账号）。
- `GET /api/v1/audit-logs`（审计查询）。
- `GET/PATCH /api/v1/system/settings`（系统设置，管理员）。
- `GET /api/v1/system/health`（健康检查，不返回敏感配置）。

## 8. 前端轮询约定

首期不做 WebSocket（网页长连接推送）。上传和后台任务使用：

- 任务创建后每 2 秒查询一次，连续 30 秒无变化后降为每 5 秒。
- 页面离开或任务完成后停止轮询。
- 服务端返回任务状态、进度、最近日志时间和是否可重试。

这样足以覆盖每天几十个文件的处理量，也减少部署和排错复杂度。

