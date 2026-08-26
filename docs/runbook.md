# 生产运行手册

本文档面向系统管理员，覆盖单台阿里云 Debian 12.10（Linux 服务器系统）上基金估值分析看板的首次部署、日常运行、备份恢复和升级回滚。当前版本只部署后端 API、独立 worker（任务进程）、PostgreSQL（关系型数据库）和 Caddy（反向代理）；前端尚未实现，不会在部署中伪造前端服务。

## 1. 运行边界

生产拓扑如下：

```text
公网 80/443
      |
    Caddy  ---- ACME/Let's Encrypt（自动证书服务）
      |
  内部网络 backend
      +-- API（只接入、查询、权限和邮件同步，不解析 Excel）
      +-- worker（串行领取数据库任务，负责 Excel 解析、校验和落库）
      +-- PostgreSQL（不暴露宿主机端口）
```

Compose（容器编排）只使用四个服务，不引入 Redis（缓存/队列）、Celery（任务框架）、对象存储或 Kubernetes（集群编排）。Caddy 的公网网络与 API/数据库所在的内部网络分开；PostgreSQL 只加入内部网络。

当前 Caddy 只代理 `/api/*` 和 `/health/*`。根路径会返回“前端未部署”的 404；前端实现后，应新增独立前端服务，再把 Caddy 的兜底 handler（处理器）改为该服务的 `reverse_proxy`（反向代理），不把前端静态文件混入 API 镜像。

## 2. 前置条件

服务器至少需要：

- 阿里云安全组开放 TCP 80、443，以及仅限管理来源的 SSH 端口；PostgreSQL 5432 不开放公网。
- Debian 12.10、Docker Engine 和 Docker Compose v2（容器运行时和编排命令）。
- 已将域名的 A/AAAA（地址解析）记录指向服务器；申请证书前 DNS 必须已经生效。
- 至少 10 GB 可用磁盘作为运行缓冲。40 GB 磁盘不是数据库或原始文件的无限容量，必须执行第 7 节的监控和滚动策略。

建议服务器目录：

```text
/opt/fund-dashboard/                 仓库工作目录
/opt/fund-dashboard/deploy/.env      生产环境变量，权限 600
/etc/fund-dashboard/imap_password    QQ IMAP 授权码，权限 600
```

## 3. 秘密管理

从受控终端进入服务器，复制示例配置：

```bash
cd /opt/fund-dashboard
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
install -d -m 700 -o 10001 -g 10001 /etc/fund-dashboard
install -m 600 -o 10001 -g 10001 /dev/null /etc/fund-dashboard/imap_password
```

编辑 `deploy/.env`，至少替换以下值：

- `DASHBOARD_DOMAIN`：真实业务域名；不要把真实域名写回 `Caddyfile`。
- `ACME_EMAIL`：用于证书通知的邮箱。
- `POSTGRES_PASSWORD`：随机数据库密码。
- `DATABASE_URL`：与上面的数据库账号、密码和库名一致；密码中的 `@`、`:`、`/` 等字符必须 URL-encode（URL 编码）。
- `MAIL_IMAP_USERNAME`：QQ 邮箱账号。
- `MAIL_IMAP_SECRET_DIR`：宿主机受控秘密目录，默认 `/etc/fund-dashboard`；API（接口服务）可在其中原子更新 `imap_password`，worker（任务进程）只读挂载该目录。

首次部署可直接把 QQ 邮箱授权码写入受控文件；也可以部署完成后由管理员在网页中更新。授权码不写入仓库、Caddy 配置、数据库、API 响应或 shell 历史：

```bash
editor /etc/fund-dashboard/imap_password
chmod 600 /etc/fund-dashboard/imap_password
```

`MAIL_IMAP_PASSWORD` 保持为空时，应用从容器内 `/run/secrets/imap_password` 读取授权码。只有 API（接口服务）对该目录具有写权限，worker（任务进程）保持只读。若把授权码直接放入 `MAIL_IMAP_PASSWORD`，网页更新接口会拒绝覆盖。数据库密码由服务器 `deploy/.env` 注入 `POSTGRES_PASSWORD`、`DATABASE_URL` 和备份进程所需的 `PGPASSWORD`。不要把展开后的 `docker compose config` 输出提交或发送给他人。

当前账号会话是数据库保存的随机不透明令牌，数据库只保存令牌摘要；代码没有签名会话密钥变量，因此本阶段不添加一个实际上不会生效的 `SESSION_SECRET`。若未来改为签名令牌，必须新增明确的环境/受控 secrets（秘密文件）读取配置，并在变更中补充轮换策略。

## 4. 首次部署

### 4.1 DNS 和网络

先在阿里云 DNS（域名解析）中把业务域名指向服务器公网地址，再确认：

```bash
getent hosts dashboard.example.com
```

将示例域名替换为真实域名。阿里云安全组和 Debian 防火墙只允许管理来源访问 SSH，开放 80/443；不映射 API 的 8000 端口，也不映射 PostgreSQL 5432。

### 4.2 配置静态检查和构建

在首次启动前执行 Compose（容器编排）配置解析：

```bash
cd /opt/fund-dashboard
docker compose --env-file deploy/.env -f deploy/compose.prod.yml config
docker compose --env-file deploy/.env -f deploy/compose.prod.yml build --pull api
```

`worker` 使用相同的 API 镜像，因此不需要第二次构建。构建失败时不要启动旧配置，先修复镜像或依赖问题。

### 4.3 启动数据库并执行迁移

先只启动数据库，等待健康检查通过：

```bash
docker compose --env-file deploy/.env -f deploy/compose.prod.yml up -d db
docker compose --env-file deploy/.env -f deploy/compose.prod.yml ps db
```

然后使用同一个 API 镜像执行 Alembic（数据库迁移工具）升级：

```bash
docker compose --env-file deploy/.env -f deploy/compose.prod.yml \
  run --rm --no-deps api python -m alembic -c /app/backend/alembic.ini upgrade head
```

迁移成功后启动 API、worker 和 Caddy：

```bash
docker compose --env-file deploy/.env -f deploy/compose.prod.yml up -d api worker caddy
docker compose --env-file deploy/.env -f deploy/compose.prod.yml ps
```

API 必须显示 `healthy`，worker 必须显示运行中，Caddy 必须显示运行中。查看启动日志：

```bash
docker compose --env-file deploy/.env -f deploy/compose.prod.yml logs --tail=100 api worker caddy
```

### 4.4 健康检查和初始化管理员

先验证公网存活接口：

```bash
curl --fail --silent --show-error https://dashboard.example.com/health/live
```

响应只应包含稳定的 `status` 和 `service` 字段，不包含数据库地址、服务器路径或秘密。首次管理员初始化只允许成功一次。不要把真实密码直接写到 shell 历史，使用受控终端变量或交互式 HTTP 客户端调用 `POST /api/v1/auth/initialize`：

```bash
read -r -s ADMIN_PASSWORD
curl --fail --silent --show-error \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"admin\",\"password\":\"${ADMIN_PASSWORD}\",\"display_name\":\"系统管理员\"}" \
  https://dashboard.example.com/api/v1/auth/initialize
unset ADMIN_PASSWORD
```

初始化后立即用管理员账号登录并创建最小数量的 `operator`（业务员）和 `viewer`（只读看板）账号。不要多人共用管理员账号。

## 5. Caddy HTTPS 证书

Caddy 使用 `DASHBOARD_DOMAIN` 和 `ACME_EMAIL` 自动申请并续期证书。证书和 ACME（自动证书协议）状态保存在 `caddy_data` volume（数据卷），不需要也不允许把证书文件提交到 Git（版本库）。

证书首次申请的检查顺序：

1. DNS 已解析到当前公网地址。
2. 安全组和系统防火墙允许公网 TCP 80、443；如果启用 HTTP/3（第三代 HTTP），同时允许 UDP 443。
3. `caddy` 服务处于运行状态，且 Caddyfile 没有真实硬编码域名。
4. 查看 Caddy 日志中的 ACME 成功或失败原因。

```bash
docker compose --env-file deploy/.env -f deploy/compose.prod.yml logs --tail=200 caddy
curl --fail --silent --show-error https://dashboard.example.com/health/live
```

证书申请失败时，先修复 DNS、端口和域名配置；不要手工复制证书到仓库或绕过 HTTPS 长期运行。

## 6. worker 和邮件接入

worker 使用 `python -m app.worker --idle-sleep 5` 启动，串行领取数据库任务；API 进程不会解析 Excel。worker 健康检查只确认进程存活，任务业务状态要从导入接口、审计和日志中确认：

```bash
docker compose --env-file deploy/.env -f deploy/compose.prod.yml ps worker
docker compose --env-file deploy/.env -f deploy/compose.prod.yml logs --tail=200 worker
```

邮件同步仍由已有 API 邮件接口按权限触发，IMAP（邮件接收协议）配置只从环境或受控授权码文件读取。首次配置后由管理员执行邮箱连接测试，再执行同步；邮箱同步只接收附件并创建导入数据，Excel 解析仍由 worker 处理。

### 6.1 维护命令与调度

维护入口是 one-shot CLI（一次性命令行入口），每次只运行一个有界操作，不引入第二套 worker（任务进程）、Redis（缓存/队列）或 Celery（任务框架）。命令都应使用与 API（接口）相同的生产环境变量和数据库迁移版本：

```bash
cd /opt/fund-dashboard
docker compose --env-file deploy/.env -f deploy/compose.prod.yml \
  run --rm --no-deps api python -m app.maintenance_cli mail-sync
docker compose --env-file deploy/.env -f deploy/compose.prod.yml \
  run --rm --no-deps api python -m app.maintenance_cli database-backup
docker compose --env-file deploy/.env -f deploy/compose.prod.yml \
  run --rm --no-deps api python -m app.maintenance_cli source-retention
docker compose --env-file deploy/.env -f deploy/compose.prod.yml \
  run --rm --no-deps api python -m app.maintenance_cli source-retention --apply
docker compose --env-file deploy/.env -f deploy/compose.prod.yml \
  run --rm --no-deps api python -m app.maintenance_cli job-summary
```

`source-retention`（源文件清理）默认是 dry-run（预演），只有明确指定 `--apply`（执行）才会删除通过现有安全检查的原始对象。命令退出码为 0 表示成功，退出码为 1 表示该次维护失败；失败原因使用稳定 error code（错误编号），不会把密码、token（令牌）或数据库连接串写入输出。

网页端提供相同安全语义：管理员先调用 `/api/v1/system/retention/preview` 查看预演，再调用 `/api/v1/system/retention/execute` 执行。执行时必须输入固定确认短语 `DELETE_EXPIRED_SOURCE_FILES` 和操作原因。网页接口仍使用既有备份、待复核、失败任务、审计锁和路径安全保护，不提供强制绕过选项。

默认调度建议如下：mail-sync（邮件同步）每 5 分钟、database-backup（数据库备份）每天 `02:30`、source-retention（源文件清理）每天 `03:30` 且位于备份之后、health check（健康检查）每 1 分钟。管理员暂停自动邮件同步后，定时 `mail-sync` 命令会记录安全跳过；管理员和业务员仍可在网页中立即同步。宿主机 cron（定时任务）示例：

```cron
*/5 * * * * cd /opt/fund-dashboard && docker compose --env-file deploy/.env -f deploy/compose.prod.yml run --rm --no-deps api python -m app.maintenance_cli mail-sync >> /var/log/fund-dashboard-maintenance.log 2>&1
30 2 * * * cd /opt/fund-dashboard && docker compose --env-file deploy/.env -f deploy/compose.prod.yml run --rm --no-deps api python -m app.maintenance_cli database-backup >> /var/log/fund-dashboard-maintenance.log 2>&1
30 3 * * * cd /opt/fund-dashboard && docker compose --env-file deploy/.env -f deploy/compose.prod.yml run --rm --no-deps api python -m app.maintenance_cli source-retention --apply >> /var/log/fund-dashboard-maintenance.log 2>&1
* * * * * curl --fail --silent --show-error https://dashboard.example.com/health/live >/dev/null || logger -t fund-dashboard-health health-check-failed
```

调度间隔和监控阈值可以通过 `MAINTENANCE_MAIL_INTERVAL_MINUTES`（邮件间隔）、`MAINTENANCE_BACKUP_INTERVAL_HOURS`（备份间隔）、`MAINTENANCE_RETENTION_INTERVAL_HOURS`（清理间隔）、`MAINTENANCE_HEALTH_INTERVAL_MINUTES`（健康检查间隔）、`WORKER_HEARTBEAT_STALE_SECONDS`（worker 心跳过期秒数）、`MAINTENANCE_DISK_WARNING_PERCENT`（磁盘预警使用率）和 `MAINTENANCE_DISK_CRITICAL_PERCENT`（磁盘严重使用率）覆盖。使用 Compose（容器编排）执行时，需把这些变量显式传入维护容器，例如 `docker compose run -e MAINTENANCE_MAIL_INTERVAL_MINUTES=10 ...`；不要把秘密写进命令行或日志。

登录后的管理员或 operator（操作员）可以读取 `GET /api/v1/system/operations`（运维摘要接口）。摘要包含 worker heartbeat（worker 心跳）、队列积压、最近维护成功/失败、最近数据库备份状态和各运行目录所在磁盘的容量/使用率；不返回租约 token（令牌）、邮件授权码、数据库地址、原始服务器路径或备份命令。worker 每轮领取/检查任务后更新心跳，连续超过过期阈值未更新时显示 stale（过期）。

## 7. 每日备份、清理和磁盘策略

数据库每天至少做一次逻辑备份，建议 `02:30`；备份文件滚动保留 30 天。原始 Excel 默认保留 365 天，建议每天 `03:30` 先预演，再在维护窗口执行正式清理。具体命令、审计要求、备份可读性检查和当前源文件备份限制见 `deploy/backup/README.md`。

40 GB 磁盘的建议告警线：

- 剩余空间低于 30%：检查 `source_files`、数据库卷、备份卷和 Docker 日志，确认轮转任务成功。
- 剩余空间低于 20%：暂停非必要历史迁移和批量导入，先完成备份和清理评估。
- 剩余空间低于 10%：停止接收新文件，保留数据库和原始文件现场，由管理员处理，不要直接删除未知目录。

日常检查命令：

```bash
df -h
docker system df
docker volume ls --filter name=fund-dashboard
docker compose --env-file deploy/.env -f deploy/compose.prod.yml ps
```

Compose 日志使用 `json-file`（JSON 文件日志）驱动，每个服务最多保留 3 个、每个 10 MiB 的日志文件。日志轮转不能替代数据库和原始文件清理。

特别注意：当前没有异地源文件备份 provider（备份提供方）。后端清理服务在缺少成功源文件备份审计时会跳过到期对象，因此默认 365 天是保留口径，不是无条件删除授权。数据库备份也不包含原始 Excel；若长期不配置异地源文件备份，服务器磁盘损坏时原始文件无法保证恢复，这是当前明确的生产风险。

## 8. 备份恢复

### 8.1 数据库归档检查

先确认最近备份存在且可读取：

```bash
docker compose --env-file deploy/.env -f deploy/compose.prod.yml \
  run --rm --no-deps -T api sh -c \
  'latest=$(ls -1t /var/lib/fund-dashboard/backups/database-*.dump | head -n 1) && pg_restore --list "$latest" | head'
```

### 8.2 生产数据库恢复边界

恢复会覆盖数据库中的业务结构和数据。必须先：

1. 记录事故时间、目标备份文件、操作者和审批人。
2. 停止 API 和 worker，防止恢复期间继续写入。
3. 在恢复前复制/保留当前数据库的最后一个逻辑备份，除非磁盘已经达到紧急阈值。
4. 用 `pg_restore --list` 检查归档，再执行恢复。
5. 恢复后执行迁移状态检查、健康检查、管理员登录和看板抽样核对。

标准停写和恢复示意：

```bash
docker compose --env-file deploy/.env -f deploy/compose.prod.yml stop api worker
docker compose --env-file deploy/.env -f deploy/compose.prod.yml \
  run --rm --no-deps -T api sh -c \
  'pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" \
    /var/lib/fund-dashboard/backups/database-YYYYMMDDTHHMMSSZ-xxxxxxxx.dump'
docker compose --env-file deploy/.env -f deploy/compose.prod.yml \
  run --rm --no-deps api python -m alembic -c /app/backend/alembic.ini current
docker compose --env-file deploy/.env -f deploy/compose.prod.yml up -d api worker caddy
```

上面的文件名只是格式示例，必须替换成已经核对过的实际备份名。`--clean`（恢复前清理目标对象）是破坏性操作，只能在停写、审批和保留事故前备份后使用。数据库恢复不会恢复 `source_files`；原始文件需要另有成功的源文件备份才能恢复。

## 9. 升级与回滚

### 9.1 常规升级

升级前必须检查工作区干净、阅读发布说明、确认备份成功，并先在非生产环境完成迁移和接口 smoke test（冒烟测试）：

```bash
git fetch --tags
git status --short
docker compose --env-file deploy/.env -f deploy/compose.prod.yml run --rm --no-deps -T api \
  python - <<'PY'
from app.config import get_settings
from app.db.session import create_engine
from app.system.backup import BackupService
from sqlalchemy.orm import Session

settings = get_settings()
engine = create_engine(settings.database_url)
try:
    with Session(engine) as session:
        result = BackupService.from_settings(session, settings).run()
        session.commit()
        print(result.status.value)
finally:
    engine.dispose()
PY
docker compose --env-file deploy/.env -f deploy/compose.prod.yml build --pull api
docker compose --env-file deploy/.env -f deploy/compose.prod.yml \
  run --rm --no-deps api python -m alembic -c /app/backend/alembic.ini upgrade head
docker compose --env-file deploy/.env -f deploy/compose.prod.yml up -d api worker caddy
```

### 9.2 回滚边界

- 仅替换应用镜像且没有执行数据库结构变更时，可以回到上一个已构建镜像并重启 API/worker。
- 已经执行新的 Alembic migration（迁移）后，不允许把旧代码镜像直接指向新结构，除非发布说明明确保证向后兼容。
- 生产结构回退坚持前向迁移；不要把 `alembic downgrade` 当作常规回滚方案。
- 不兼容的数据库变更必须走停写、逻辑备份和恢复演练流程，必要时恢复到临时数据库验证后再切换。
- 回滚后必须检查 `/health/live`、worker 进程、数据库迁移版本、登录和看板抽样数据。

## 10. 事件处理和审计

上传、邮件同步、任务失败、复核、发布、撤回、账号管理、备份和清理都应保留审计记录。发生导入失败时先查看批次状态、任务尝试次数、错误编号和 worker 日志，不要直接修改已发布版本或删除原始对象。发生数据争议时先使用原始文件下载接口和审计记录复核，必要时锁定对象，等待管理员决定。

发布、撤回或恢复后会新增 `process_analysis_run`（执行分析运行）后台任务。任务只写触发日期到当前日期的受影响指标，完整历史仅作为收益和公司指数的计算上下文。看板出现 `pending`（等待）时先检查任务是否排队或运行；出现 `stale`（过期）时检查任务错误编号和 `analysis.failed`（分析失败）审计。分析失败不会回滚已审核的发布状态，也不应通过手工改指标表处理；修复数据或规则后应通过原版本生命周期重新触发受控分析。

## 11. 明确未提供的能力

- 当前没有异地备份服务器或对象存储保护，不能承诺单机损坏后的完整恢复。
- 当前没有前端容器；Caddy 的前端兜底是 404，不代表前端已经部署。
- 当前没有会话签名密钥；会话使用数据库令牌摘要，未来改造必须单独设计密钥轮换。
- 当前没有集中式调度器；生产调度由宿主机 cron（定时任务）调用受测的运维 CLI（命令行入口），不直接引入消息队列。

## 12. 生产初始化与历史迁移

生产首次初始化分为数据库结构、管理员账号、业务目录和历史文件四步。管理员密码只能通过 `POST /api/v1/auth/initialize`（初始化第一个管理员）设置，不能写入 bootstrap（初始化）配置。

### 12.1 Bootstrap（业务目录初始化）

复制 `deploy/bootstrap.example.json` 为生产主机上的受控配置文件，替换示例产品、别名、份额类别、科目映射和风险规则。配置只允许非敏感系统设置；程序会拒绝包含 `password`（密码）、`password_hash`（密码哈希）、`token`（令牌）、`secret`（秘密）等字段的 JSON（结构化配置）。

先预演：

```bash
docker compose --env-file deploy/.env -f deploy/compose.prod.yml \
  run --rm --no-deps \
  -v /etc/fund-dashboard/bootstrap.json:/run/bootstrap/bootstrap.json:ro \
  -v /etc/fund-dashboard/migration:/run/migration:ro \
  api python -m app.bootstrap \
  --config /run/bootstrap/bootstrap.json --dry-run
```

预演会检查数据库连接、源文件存储根目录、迁移清单格式及清单产品标签是否被配置中的产品名称或别名覆盖；它只读取迁移清单元数据，不读取、移动或删除历史源目录。预演确认无误后，使用相同配置执行正式初始化：

```bash
docker compose --env-file deploy/.env -f deploy/compose.prod.yml \
  run --rm --no-deps \
  -v /etc/fund-dashboard/bootstrap.json:/run/bootstrap/bootstrap.json:ro \
  -v /etc/fund-dashboard/migration:/run/migration:ro \
  api python -m app.bootstrap \
  --config /run/bootstrap/bootstrap.json
```

默认要求业务目录为空；发现已有产品、别名、份额类别、科目映射或风险规则时会停止。只有确认配置是对现有目录的受控补充时，才显式加 `--allow-existing`。同一份配置重复执行是幂等的，不会重复创建目录记录或审计记录；配置内容改变时必须重新预演并保留变更记录。配置文件不应进入 Git（代码库）或镜像，执行后按主机密钥文件管理策略处理。

### 12.2 历史迁移上线顺序

1. 完成数据库结构升级、管理员初始化和 bootstrap 预演/正式执行。
2. 在本地对历史目录执行 `python -m app.migration ... --dry-run`，确认 manifest（迁移清单）指纹、主目录候选数量、缺口和 `needs_review`（需要复核）冲突。
3. 先上传少量样本，检查导入批次、版本校验、产品识别、日期和原始文件下载；确认看板只出现已发布版本后再继续。
4. 处理报告列出的同日不同哈希文件。当前已知六组 gz（归档目录）冲突必须人工决定，不得通过文件名或自动覆盖选择。
5. 使用同一份未变化 manifest 断点续传主目录候选。每个文件上传前会重新核验大小和 SHA-256（安全哈希）；源目录始终只读。
6. 导入完成后按产品和日期抽样，核对覆盖率、缺口、复核队列和失败任务，再由授权人员逐批发布。

迁移失败时优先修复配置、网络或单项任务后从 manifest 续传，不删除数据库记录或源文件。已经上传但未发布的数据不进入看板；错误版本通过复核/拒绝/修订流程处理。数据库恢复不包含源文件，源文件仍需单独的成功备份。
