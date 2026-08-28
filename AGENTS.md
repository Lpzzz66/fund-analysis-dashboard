# 项目运行与部署信息

## 生产服务器

- 地址：`8.217.191.193`
- SSH 密钥：使用本机 `C:\Users\jzcan\.ssh\main.pem` 对应的派生公钥。
- `main.pem` 是私钥文件，不得提交、复制到仓库或写入日志；连接时通过 SSH（安全远程登录）客户端的 `-i` 参数引用。

## 当前生产版本

- 部署 commit：`9b7c5fa fix(api): cap nav-series default window to 365 days and bump mem_limit to 1GiB`
- 部署日期：2026-08-28（服务器 `/opt/fund-dashboard` `git rev-parse HEAD` 已核实为 9b7c5fa）
- 本地发布标签：`prod-20260828-9b7c5fa`
- 复核方式：`git tag --sort=-creatordate` 查最新 prod 标签；服务器 `/opt/fund-dashboard` 内 `git rev-parse HEAD` 应为本次部署 commit。

> 此次部署包括以下 fix：
> 1. **`4a0764c`**：Caddyfile 移除错误的 reverse_proxy 子指令；api 健康检查 start_period 拉到 60s、retries 8、interval 20s，避免冷启被误杀。
> 2. **`31baf59`**：Caddyfile 给 `/api/*` 加上 transport dial/read/write/response_header_timeout，丢掉 `fail_duration` 避免被动熔断把后续请求挤成 503。
> 3. **`9b7c5fa`**（本次）：nav-series 默认窗口限制到 365 天（前 1 年），api mem_limit 从 512m 提到 1g，避免 `select ValuationVersion + FundDailySnapshot` 拉取 2000+ 行被 OOM 杀成 exitCode=137 而重启循环。
> 4. **`a3cd493`**：前端 NavSeries/Positions/Quality tab 切产品时 useEffect 重新拉取，错误细节进 console + Alert，让用户能看到真实 HTTP status 而不是被翻译成统一的「加载失败」。

## 安全约束

- 不在仓库记录私钥内容、密码、令牌或生产授权码。
- 生产部署前先确认目标主机、SSH 用户和部署目录，再执行数据库迁移、服务重启等有影响操作。
- 每次成功部署后，按 `prod-YYYYMMDD-<短hash>` 形式在本地打一个 tag（不要 push 到 origin），并在本节同步更新"部署 commit / 部署日期"。
