# 项目运行与部署信息

## 生产服务器

- 地址：`8.217.191.193`
- SSH 密钥：使用本机 `C:\Users\jzcan\.ssh\main.pem` 对应的派生公钥。
- `main.pem` 是私钥文件，不得提交、复制到仓库或写入日志；连接时通过 SSH（安全远程登录）客户端的 `-i` 参数引用。

## 当前生产版本

- 部署 commit：`fd28079 feat: batch publish and background mail sync`
- 部署日期：2026-08-27（服务器 `/opt/fund-dashboard` `git rev-parse HEAD` 已核实为 fd28079165db26c11eae94dbeec364b476175a59）
- 本地发布标签：`prod-20260827-<commit>`（在每次部署后由部署者在本地补打，仅本地保留）
- 复核方式：`git tag --sort=-creatordate` 查最新 prod 标签；服务器 `/opt/fund-dashboard` 内 `git rev-parse HEAD` 应为本次部署 commit。

## 安全约束

- 不在仓库记录私钥内容、密码、令牌或生产授权码。
- 生产部署前先确认目标主机、SSH 用户和部署目录，再执行数据库迁移、服务重启等有影响操作。
- 每次成功部署后，按 `prod-YYYYMMDD-<短hash>` 形式在本地打一个 tag（不要 push 到 origin），并在本节同步更新"部署 commit / 部署日期"。
