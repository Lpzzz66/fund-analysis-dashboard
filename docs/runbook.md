# 生产运行手册

本文面向系统管理员和部署维护人员，描述阿里云 Debian 12 生产环境的部署、初始化、值守、备份、原始文件清理、升级和恢复。生产入口域名为 `danyintouzi.com`；本文不包含真实密码、授权码、私钥或生产数据。

## 1. 生产拓扑和前置条件

生产 Docker Compose（容器编排）包含 `caddy`（网页服务器）、`api`（接口服务）、`worker`（后台任务进程）和 `db`（PostgreSQL 16 数据库）。Caddy 提供前端静态文件、SPA（单页应用）回退、HTTPS 和 API 反向代理；API 处理认证、文件接收、查询、配置、导出和维护；worker 串行领取任务执行 Excel（电子表格）解析、校验和分析。

服务器只需要对公网开放 80、443 和受限 SSH（远程登录）端口。API 的 8000 端口、PostgreSQL 的 5432 端口和 Compose 后端网络不应暴露到公网。

上线前确认域名 `danyintouzi.com` 的 `A` 记录已指向服务器，安全组/防火墙允许 80/443，服务器已安装 Docker、Docker Compose 和 Git（代码版本管理），并有足够空间容纳镜像、数据库卷、原始文件卷和备份。2C4G（2 核 4 GB）服务器不建议同时进行全量历史解析、镜像构建和数据库恢复。

## 2. 首次部署

在服务器执行：

```bash
git clone https://github.com/jzcangshu/fund-analysis-dashboard.git /opt/fund-dashboard
cd /opt/fund-dashboard
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
```

编辑 `deploy/.env`，至少替换 `DASHBOARD_DOMAIN=danyintouzi.com`、`ACME_EMAIL`（证书通知邮箱）、`POSTGRES_PASSWORD`（数据库密码）、`DATABASE_URL` 中经过 URL 编码的同一密码、IMAP（邮件接收协议）服务器参数。`MAIL_IMAP_USERNAME` 可作为初始账号，也可以在网页邮件接入页由管理员修改并持久化；不要把真实密码写入 shell（命令行解释器）历史或仓库。

创建邮箱授权码文件：

```bash
sudo install -d -m 700 /etc/fund-dashboard
sudo install -m 600 /dev/null /etc/fund-dashboard/imap_password
sudo sh -c 'umask 077; printf "%s" "REPLACE_WITH_QQ_AUTHORIZATION_CODE" > /etc/fund-dashboard/imap_password'
```

真实授权码不应出现在本文、终端历史、日志或 Git。Compose 会把该目录挂载到容器 `/run/secrets`，API 更新授权码时使用受控文件的原子替换。

构建、启动和检查：

```bash
docker compose --env-file deploy/.env -f deploy/compose.prod.yml build
docker compose --env-file deploy/.env -f deploy/compose.prod.yml up -d
docker compose --env-file deploy/.env -f deploy/compose.prod.yml ps
curl --fail --silent --show-error https://danyintouzi.com/health/live
```

Caddy 首次启动会向 ACME（自动证书协议）申请证书。若证书失败，先检查 DNS（域名系统）、80/443 端口和 `ACME_EMAIL`，不要关闭 HTTPS 作为正式修复。

## 3. 数据库迁移和初始化

数据库结构必须通过 Alembic（数据库迁移工具）升级，不能在业务代码中调用 `create_all`：

```bash
docker compose --env-file deploy/.env -f deploy/compose.prod.yml run --rm --no-deps api python -m alembic -c /app/backend/alembic.ini upgrade head
docker compose --env-file deploy/.env -f deploy/compose.prod.yml run --rm --no-deps api python -m alembic -c /app/backend/alembic.ini current
```

打开 `https://danyintouzi.com`，首次访问进入初始化页，通过 `POST /api/v1/auth/initialize`（初始化接口）或网页创建第一个管理员。初始化完成后不可重复使用；管理员应为每位人员创建独立账号。

业务目录配置使用 `deploy/bootstrap.example.json`（初始化配置模板）的服务器副本，配置实际产品、别名、份额类别、科目映射、风险规则和非敏感系统设置。管理员密码不写入该文件：

```bash
sudo install -m 600 deploy/bootstrap.example.json /etc/fund-dashboard/bootstrap.json
```

迁移清单挂载到 `/etc/fund-dashboard/migration` 后先执行 `python -m app.bootstrap --config /run/bootstrap/bootstrap.json --dry-run`（初始化预演），确认无误再去掉 `--dry-run`。已有业务目录时默认停止；只有确认是受控补充，才使用 `--allow-existing`。历史文件顺序见 [历史数据迁移指南](历史数据迁移指南.md)。

## 4. 进程、健康和日志

```bash
docker compose --env-file deploy/.env -f deploy/compose.prod.yml ps
docker compose --env-file deploy/.env -f deploy/compose.prod.yml logs --tail=100 api worker caddy db
docker compose --env-file deploy/.env -f deploy/compose.prod.yml restart worker
```

公开 `/health/live` 只检查 API 进程存活。管理员可调用 `/api/v1/system/health`（依赖健康）检查数据库连接；管理员或业务员可调用 `/api/v1/system/operations`（运维摘要）查看数据库、worker 心跳、任务队列、最近维护、备份和磁盘状态。

worker 默认串行处理任务，空闲等待 5 秒。队列积压时先查看任务错误编号和 worker 日志，不要直接编辑任务表、租约令牌、指标表或已发布版本。

## 5. 维护命令和调度

维护 CLI（命令行入口）支持 `mail-sync`（邮件同步）、`database-backup`（数据库备份）、`source-retention`（原始文件清理）和 `job-summary`（任务摘要）。四个命令分别为：

```bash
docker compose --env-file deploy/.env -f deploy/compose.prod.yml run --rm --no-deps api python -m app.maintenance_cli mail-sync
docker compose --env-file deploy/.env -f deploy/compose.prod.yml run --rm --no-deps api python -m app.maintenance_cli database-backup
docker compose --env-file deploy/.env -f deploy/compose.prod.yml run --rm --no-deps api python -m app.maintenance_cli source-retention
docker compose --env-file deploy/.env -f deploy/compose.prod.yml run --rm --no-deps api python -m app.maintenance_cli job-summary
```

`source-retention` 默认是预演；只有指定 `--apply` 才删除通过所有安全检查的原始对象。当前没有独立调度器容器，建议使用 root（系统管理员）保护的 `cron`（定时任务）或 `systemd timer`（系统定时器），配置超时、单实例锁和失败告警。推荐邮件每 5 分钟、数据库备份每天 02:30、源文件预演每天 03:30；邮件暂停开关会让 `mail-sync` 安全跳过。

后端会生成并审计数据库备份，但不会根据 `backup_retention_days`（备份保留天数）自动删除旧 `.dump` 文件；备份轮转必须由单独的受控宿主机任务完成。该设置可维护，但不代表已自动轮转。

## 6. 备份和清理

PostgreSQL 使用 `pg_dump`（数据库逻辑备份命令）custom format（自定义格式），备份写入 `database_backups` 数据卷：

```bash
docker compose --env-file deploy/.env -f deploy/compose.prod.yml run --rm --no-deps api python -m app.maintenance_cli database-backup
docker compose --env-file deploy/.env -f deploy/compose.prod.yml run --rm --no-deps -T api sh -c 'latest=$(ls -1t /var/lib/fund-dashboard/backups/database-*.dump | head -n 1) && pg_restore --list "$latest" >/dev/null'
```

备份轮转只能针对备份卷内名称匹配 `database-*.dump` 且超过批准保留期的文件；禁止把删除范围扩大到整个数据卷。首次启用自动轮转前应在非生产目录演练。

原始 Excel 默认保留 365 天，可由 `SOURCE_RETENTION_DAYS` 或系统设置调整。清理服务不会删除数据库标准化数据、估值版本、分析结果、任务和审计，并会检查待复核引用、活动/失败任务、审计锁、源文件备份审计和对象路径安全。当前没有异地源文件备份适配器，没有成功备份审计时会以 `backup_incomplete`（备份未完成）跳过，不能手工绕过。

网页清理必须先调用管理员接口 `POST /api/v1/system/retention/preview`（清理预演），核对候选数量、大小和跳过原因，再调用 `POST /api/v1/system/retention/execute`（清理执行），请求必须包含 `DELETE_EXPIRED_SOURCE_FILES`（删除过期原始文件）和操作原因。

40 GB（千兆字节）磁盘建议线：使用率达到 70% 检查卷和日志；达到 80% 暂停非必要历史迁移和批量上传；达到 90% 停止接收新文件并保留现场。检查命令为 `df -h`、`docker system df`、`docker volume ls --filter name=fund-dashboard` 和生产 Compose 的 `ps`。

Compose 日志使用 `json-file`（JSON 文件日志），每个服务最多 3 个、每个 10 MiB（兆字节）文件。日志轮转不能替代数据库备份、备份轮转和原始文件清理。

## 7. 常见故障

### API 或网页不可用

查看 `caddy`、`api`、`db` 状态和最近日志；检查 `/health/live`，若存活但登录失败，再检查 `/api/v1/system/health`。同时检查磁盘、数据库、Compose 网络、DNS 和证书日志；不要带数据卷执行破坏性重建。

### 导入、分析失败或状态过期

查看导入批次的 `error_code`（错误编号）、尝试次数和 worker 日志。只有技术失败且接口允许时才重试；业务校验问题应保留原始文件，修正目录或映射后重新上传。分析失败不会回滚已审核发布状态，应修复后通过受控版本生命周期重新触发，不手工修改指标表。

### 邮件异常

检查 QQ 邮箱 IMAP 服务、SSL（安全套接字层）端口 993、账号、授权码文件权限和容器挂载。邮箱设置接口只返回非敏感状态；暂停自动同步不影响管理员或业务员主动同步。

## 8. 升级、回滚和恢复

升级前完成数据库备份，在非生产环境通过全部质量门禁，再从 `main`（主分支）快进更新：

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
docker compose --env-file deploy/.env -f deploy/compose.prod.yml build --pull
docker compose --env-file deploy/.env -f deploy/compose.prod.yml run --rm --no-deps api python -m alembic -c /app/backend/alembic.ini upgrade head
docker compose --env-file deploy/.env -f deploy/compose.prod.yml up -d api worker caddy
docker compose --env-file deploy/.env -f deploy/compose.prod.yml ps
```

无数据库结构变更时可以回到已验证的旧镜像；已执行新迁移后不要直接运行旧代码，优先使用向前兼容或从备份恢复。不要把 `alembic downgrade`（迁移回退）当作常规生产回滚。

数据库恢复前记录事故时间、操作者、审批和目标备份，停止 API/worker 写入，先用 `pg_restore --list` 检查归档，再执行恢复。数据库备份不包含原始文件卷和 Caddy 证书数据；恢复后检查迁移版本、健康接口、登录、看板和抽样数据。

## 9. 安全清单

- `deploy/.env`、邮箱授权码、SSH 私钥、证书私钥和生产数据库不进入 Git。
- 不在日志、审计摘要、网页响应或命令参数中打印密码、令牌、授权码、连接串和原始服务器路径。
- 公网只提供 Caddy；API 和数据库保持内网。
- 原始文件下载必须经过登录、角色、批次关联、路径约束和审计。
- 账号操作、版本发布/撤回、导出、备份、清理和邮件操作都应能在审计日志中追溯。
- 任何清理前先备份、预演和核对；不使用 broad wildcard（宽泛通配符）删除未知文件。
