# 后端维护 API 与生产闭环实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan in bounded batches with specification and quality review.

**Goal:** 在既有模块化单体后端上补齐产品/科目维护、风险与审计查询、系统配置和生产部署闭环，不改变 Excel 唯一数据源、版本发布和最小权限边界。

**Architecture:** 复用已有 SQLAlchemy 模型、审计服务和角色依赖；维护接口只写主数据或新规则版本，不改写历史估值版本。系统设置保存非敏感元数据，邮箱授权码继续由环境变量或受控文件引用提供，避免把凭据写入数据库。部署采用单机 Docker Compose、PostgreSQL、独立 worker 和 Caddy，备份与原始文件清理由宿主机定时任务调用已有服务。

**Tech Stack:** FastAPI、SQLAlchemy、Alembic、PostgreSQL、pytest、Docker Compose、Caddy。

---

## 批次一：维护类 API

### Task 1: 产品、别名、份额和科目映射维护

**范围：** `backend/app/api/catalog.py`、必要的 catalog service、API 测试、应用路由注册和 API 文档。

**要求：**

- `admin` 和 `operator` 可维护产品、别名、份额类别和科目映射；`viewer` 只能读取看板，不得访问维护写接口。
- 产品新增、修改、启停和别名/份额维护必须写审计；停用必须有原因；不删除历史估值数据。
- 别名保存时拒绝与其他产品产生不区分大小写的冲突。
- 科目映射支持代码/前缀、名称模式、标准类别、叶子标记、持仓标记、有效期、启停；停用不影响已落库历史结果。
- 列表支持分页和基本筛选；响应不暴露数据库异常原文。

### Task 2: 风险规则、风险事件和系统审计查询

**范围：** `backend/app/api/risk.py`、`backend/app/api/system.py`、必要的 service、API 测试、应用路由注册和 API 文档。

**要求：**

- 风险规则新建/复制产生版本；修改历史版本禁止就地覆盖；启停不删除旧事件。
- 风险事件按产品、规则、严重度、状态和日期分页查询；处理事件必须写处理意见、处理人和审计。
- 管理员可读取/修改非敏感系统设置；系统设置键必须白名单校验，数值有合理范围，未知键拒绝。
- 审计日志支持操作人、动作、资源、结果和时间筛选分页；只读，不提供删除接口。
- 邮箱配置接口与现状统一：只返回非敏感状态，授权码仍从环境变量/受控引用读取，不在数据库或响应中保存明文。

## 批次二：部署和端到端

### Task 3: 生产部署和运行手册

**范围：** `deploy/compose.prod.yml`、`deploy/Caddyfile`、`deploy/.env.example`、`deploy/backup/README.md`、`docs/runbook.md`及相关文档。

**要求：**

- 2C4G 单机可运行 API、worker、PostgreSQL、Caddy；不引入 Redis 或其他非必要中间件。
- HTTPS 证书由 Caddy 自动申请；域名、邮箱、数据库密码和会话密钥只从环境注入。
- 配置健康检查、重启策略、日志大小限制、数据库备份、原始文件滚动清理和恢复演练说明。
- 不提交真实 `.env`、密码或令牌；明确 40G 磁盘下的滚动清理边界。

### Task 4: 端到端验收

**范围：** `backend/tests/e2e/` 和相关测试/文档。

**要求：** 使用合成或现有样本完成上传、任务处理、校验、发布和看板查询；验证 viewer 不能写入，修订版本不覆盖旧版本，维护操作和风险处理均可审计。

## 批次验收

```text
cd backend
uv run pytest -q
uv run ruff check .
uv run ty check app
docker compose -f ../deploy/compose.prod.yml config
```

所有文档、测试和代码必须与本计划及 `docs/01-产品设计基线.md`、`docs/03-系统架构与部署.md`、`docs/05-API-接口草案.md`保持一致。

## 2026-08-26 质量审计修复记录

- 将产品目录路由按基金、别名、份额类别和科目映射拆分；`catalog.py` 保留聚合器，既有导入路径和 API 不变。
- 导入列表、基金列表、持仓列表改为数据库级计数和分页，避免随数据量增长把全表加载到进程内。
- 导入解析的产品别名、原始文件清理的安全判定改为批量查询，保留确定性排序和 fail-closed（失败关闭）语义。
- 历史盘点工具纳入后端发行包和生产镜像，迁移模块删除动态 `sys.path` 导入和无类型字段探测。
- 新增 GitHub Actions（GitHub 自动化检查）质量门禁，覆盖 Ruff、格式检查、ty、后端测试和盘点工具测试。
