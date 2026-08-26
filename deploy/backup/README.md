# 备份与原始文件清理

本目录说明生产环境如何调用后端已有的数据库备份和原始文件保留服务。生产环境没有单独的备份容器；使用宿主机 `systemd timer`（系统定时器）或同等受控调度器，在 API 镜像中执行一次性命令。

## 目录和边界

- `database_backups` Docker volume（数据库卷）挂载到 `/var/lib/fund-dashboard/backups`，保存 PostgreSQL `pg_dump`（逻辑备份）文件。
- `source_files` Docker volume（原始文件卷）挂载到 `/var/lib/fund-dashboard/source-files`，保存上传或邮件接收的 Excel 原始对象。
- 数据库逻辑备份不包含 `source_files` 中的原始 Excel，也不包含 Caddy 证书数据。
- 当前没有异地源文件备份适配器。后端清理服务会检查 `source_file` 的成功备份审计记录，没有记录就跳过删除，这是故障关闭策略。
- `database_backups` 与 `source_files` 默认都在同一台服务器的本地 Docker 存储中；服务器磁盘或 ECS（云服务器）损坏时，不能把它们视为异地备份。

所有命令都从仓库根目录执行，并显式指定受控环境文件。不要把命令输出，尤其是 `docker compose config` 输出，粘贴到工单或聊天中，因为展开后的配置可能包含密码。

```bash
docker compose --env-file deploy/.env -f deploy/compose.prod.yml ps
```

## 每日数据库备份

建议每天 `02:30`（服务器本地时间）执行一次。备份服务会将结果写入审计日志；命令使用 `pg_dump` 的 custom format（自定义格式），不把数据库密码写入命令参数或审计摘要。Compose（容器编排）通过受控环境变量 `PGPASSWORD` 给 `pg_dump` 使用。

执行一次备份的命令如下：

```bash
docker compose --env-file deploy/.env -f deploy/compose.prod.yml \
  run --rm --no-deps -T api python - <<'PY'
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
        print({
            "status": result.status.value,
            "backup": result.backup_path.name if result.backup_path else None,
            "size_bytes": result.size_bytes,
            "error_code": result.error_code,
        })
finally:
    engine.dispose()
PY
```

退出码和输出中的 `status` 必须都是成功。失败时先保留现场，检查 API 日志、数据库健康状态和磁盘空间；不要手工写一条成功审计记录。

数据库备份默认滚动保留 30 天。备份成功后可以执行以下受控轮转命令，删除只针对备份目录内、名称匹配 `database-*.dump` 且超过 30 天的文件：

```bash
docker compose --env-file deploy/.env -f deploy/compose.prod.yml \
  run --rm --no-deps -T api python - <<'PY'
from pathlib import Path
import time

root = Path("/var/lib/fund-dashboard/backups")
cutoff = time.time() - 30 * 24 * 60 * 60
for path in root.glob("database-*.dump"):
    if path.is_file() and path.stat().st_mtime < cutoff:
        print(path.name)
        path.unlink()
PY
```

该轮转命令必须由 root（系统管理员）保护的定时任务调用，且每天先完成新备份，再轮转旧备份。不要使用通配符把删除范围扩大到整个 Docker volume。

## 备份可读性检查

至少每周检查一次最近文件的目录清单。`pg_restore --list` 只读取归档目录，不会修改数据库：

```bash
docker compose --env-file deploy/.env -f deploy/compose.prod.yml \
  run --rm --no-deps -T api sh -c \
  'latest=$(ls -1t /var/lib/fund-dashboard/backups/database-*.dump | head -n 1) && pg_restore --list "$latest" >/dev/null'
```

每月至少做一次恢复演练。演练优先恢复到临时 PostgreSQL 数据库或临时服务器，不在生产库上直接试验。生产恢复边界和步骤见 `docs/runbook.md`。

## 原始文件保留和清理

默认 `SOURCE_RETENTION_DAYS=365`（原始文件保留 365 天），保留期可以在 `deploy/.env` 修改。标准化估值、已发布版本、校验结果、任务元数据和审计记录不随原始文件清理。

每天 `03:30` 先执行预演，检查候选数、大小和跳过原因：

```bash
docker compose --env-file deploy/.env -f deploy/compose.prod.yml \
  run --rm --no-deps -T api python - <<'PY'
from app.config import get_settings
from app.db.session import create_engine
from app.system.retention import RetentionService
from sqlalchemy.orm import Session

settings = get_settings()
engine = create_engine(settings.database_url)
try:
    with Session(engine) as session:
        result = RetentionService.from_settings(session, settings).run(dry_run=True)
        session.commit()
        print({
            "dry_run": result.dry_run,
            "retention_days": result.retention_days,
            "candidate_count": result.candidate_count,
            "total_size": result.total_size,
            "skipped_reasons": result.skipped_reasons,
            "errors": result.errors,
        })
finally:
    engine.dispose()
PY
```

只有同时满足以下条件，才允许在下一次维护窗口执行 `dry_run=False`（正式清理）：

1. 预演结果已经由管理员核对，确认候选文件不再需要原始复核。
2. 每个候选文件没有待复核版本、活动任务、失败任务引用或审计锁。
3. 每个候选文件存在成功的源文件备份审计记录。
4. 最近一次数据库备份成功，且磁盘剩余空间和服务状态正常。

正式清理只需要将上面命令中的 `run(dry_run=True)` 改为 `run(dry_run=False)`，并保留完整输出和审计编号。当前没有源文件异地备份配置，因此第 3 条默认不满足，正式清理会安全地跳过文件并记录 `backup_incomplete`（备份未完成）。这不是异常，也不能通过手工修改数据库绕过。

如果业务确认必须在没有异地源文件备份的情况下删除一年以前的原始文件，需要先单独批准新的数据保留决定，并实现/验收源文件备份适配器或明确新的审计策略；本阶段不伪造该能力。

## 定时执行建议

推荐使用宿主机 `systemd timer`（系统定时器）或受控 cron（定时任务）调用上述命令，时间顺序如下：

| 时间 | 动作 | 失败处理 |
| --- | --- | --- |
| 02:30 | PostgreSQL 逻辑备份 | 标记失败、告警，不进行正式源文件清理 |
| 03:00 | 备份文件可读性检查和 30 天轮转 | 失败时保留备份现场并告警 |
| 03:30 | 原始文件清理预演 | 每天保留审计结果 |
| 维护窗口 | 原始文件正式清理 | 仅在四项条件满足后执行 |

调度器必须设置超时、失败告警和单实例锁，避免两个备份或清理进程同时运行。不要把 QQ 授权码或数据库 URL 拼接到定时任务命令行。
