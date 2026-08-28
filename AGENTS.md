# 项目运行与部署信息

## 生产服务器

- 地址：`8.217.191.193`
- SSH 密钥：使用本机 `C:\Users\jzcan\.ssh\main.pem` 对应的派生公钥。
- `main.pem` 是私钥文件，不得提交、复制到仓库或写入日志；连接时通过 SSH（安全远程登录）客户端的 `-i` 参数引用。

## 当前生产版本

- 部署 commit：`4a0764c fix(caddy): remove unsupported reverse_proxy timeout directive`
- 部署日期：2026-08-28（服务器 `/opt/fund-dashboard` `git rev-parse HEAD` 已核实为 4a0764c）
- 本地发布标签：`prod-20260828-4a0764c`
- 复核方式：`git tag --sort=-creatordate` 查最新 prod 标签；服务器 `/opt/fund-dashboard` 内 `git rev-parse HEAD` 应为本次部署 commit。

> 此次部署与 `e5b313c` / `4bcf093` 一起修复了产品列表与净值序列反复返回 502 的问题：
> api 容器冷启时 /health/live 慢于原 `start_period: 15s` 窗口，被 docker 判 unhealthy 后整容器重启，导致 Caddy → api 出现 connect refused / connection reset；现将 start_period 拉到 60s、retries 8、interval 20s，并把 Caddyfile 的 `/api/*` reverse_proxy 加上 `fail_duration 30s` 与 transport 层 dial / read / write 超时，避免重启窗口返回 502。

## 安全约束

- 不在仓库记录私钥内容、密码、令牌或生产授权码。
- 生产部署前先确认目标主机、SSH 用户和部署目录，再执行数据库迁移、服务重启等有影响操作。
- 每次成功部署后，按 `prod-YYYYMMDD-<短hash>` 形式在本地打一个 tag（不要 push 到 origin），并在本节同步更新"部署 commit / 部署日期"。
