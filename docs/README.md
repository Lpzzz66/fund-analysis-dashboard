# 私募基金估值分析看板项目文档

本目录是项目的唯一设计与实施文档入口。所有会影响数据口径、导入流程、权限、接口或部署的决定，都应先写入文档，再进入开发。

## 文档目录

- [产品设计基线](01-产品设计基线.md)：产品目标、角色、范围、核心口径和总体决策。
- [页面与交互设计](02-页面与交互设计.md)：页面清单、按钮级操作和前后端交互要求。
- [系统架构与部署](03-系统架构与部署.md)：网页版、Windows 客户端、后端模块、部署、安全、备份和清理策略。
- [数据模型与导入状态](04-数据模型与导入状态.md)：数据实体、版本机制、导入状态机、校验和分析重算。
- [接口草案](05-API-接口草案.md)：首期后端接口、请求参数、响应结构和错误处理。
- [历史数据迁移清单](06-历史数据迁移清单.md)：`F:\AgentWorks\估值表A` 的盘点结果、去重规则和迁移顺序。
- [历史迁移工具说明](migration/README.md)：本地清单、预演、断点上传和源文件只读约束。
- [历史估值文件只读盘点工具](../tools/valuation_inventory/README.md)：依赖、运行命令、报告格式、只读边界和去重口径。
- [后端实施计划](plans/2026-08-25-fund-dashboard-backend.md)：按阶段执行的后端和接口开发任务。

## 当前开发环境

Task 1（任务一）使用 Python 3.12+、标准 `venv`（Python 虚拟环境）和 `pip`（Python 包安装工具）。当前 PowerShell 环境没有 `uv`（Python 项目工具），因此不将它作为必需命令。

在项目根目录执行以下命令：

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install fastapi "uvicorn[standard]" pytest httpx
.\.venv\Scripts\python.exe -m pytest backend/tests -q
.\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --reload
```

Debian 12（Linux 发行版）可使用对应的 `python3` 命令：

```bash
python3 -m venv .venv
.venv/bin/python -m pip install fastapi "uvicorn[standard]" pytest httpx
.venv/bin/python -m pytest backend/tests -q
.venv/bin/python -m uvicorn app.main:app --app-dir backend --reload
```

开发 compose（本地容器编排）使用 `APP_HOST` 和 `APP_PORT` 启动后端，宿主机端口仅绑定到 `127.0.0.1`（本机回环地址）。

本地服务启动后，健康检查地址为 `http://127.0.0.1:8000/health/live`。健康响应只包含固定的 `status`（状态）和 `service`（服务名）字段，不暴露主机名、路径、环境变量、数据库地址或密钥。

## Task 1（任务一）已完成范围

- 建立最小 FastAPI（Python Web 框架）应用工厂和 `GET /health/live`（存活检查）接口。
- 建立从环境变量读取的基础运行配置；缺省值仅用于本地开发。
- 建立不访问数据库、文件目录或外部网络的健康检查测试。
- 建立前端 `package.json`（Node.js 项目配置文件）占位和仅用于说明结构的开发编排文件。
- 已建立 PostgreSQL（关系型数据库）连接配置、数据库迁移、认证、原始文件接收、Excel（电子表格）解析、标准化落库、校验、版本发布、纯分析计算、看板查询、导入运营接口、独立 worker（任务进程）入口、只读 IMAP（邮件接收协议）同步、原始文件保留清理和数据库备份服务；生产部署仍在后续批次。

## Task 2（任务二）数据库基础层

Task 2（任务二）增加 SQLAlchemy（Python 数据库访问库）模型、会话工具和 Alembic（数据库迁移工具）初始迁移。开发环境默认使用项目根目录下的 `data/dev.db`（SQLite，本地数据库）；生产环境必须通过 `DATABASE_URL`（数据库连接地址）提供 PostgreSQL 16（关系型数据库）连接，`APP_ENV=production`（生产环境）缺少该变量时会直接报错。

在项目根目录执行：

```powershell
.\.venv\Scripts\python.exe -m pip install -e 'backend[test]'
.\.venv\Scripts\python.exe -m pytest backend/tests -q
.\.venv\Scripts\python.exe -m ty check backend/app
.\.venv\Scripts\python.exe -m alembic -c backend/alembic.ini upgrade head
```

迁移命令只在执行升级或回退时连接数据库；测试使用 SQLite 内存库，不依赖 PostgreSQL、真实文件或历史目录。当前 `0003_import_job_lease`（任务租约字段）和 `0003_job_lease`（任务领取索引）为串行迁移，后续模型结构变更应继续新增 Alembic 迁移，不要在业务代码中调用 `create_all`。

初始迁移的回退操作不会删除业务表或数据。由于早期单体迁移没有可安全拆分的逆向结构，生产环境的结构回退必须通过新的前向迁移完成；这条限制已由迁移测试固定。

## 第一后端开发批次

Task 3（任务三）实现本地账号、会话和权限：角色限制为 `admin`（管理员）、`operator`（业务员）和 `viewer`（普通看板）；首次初始化只允许创建一个管理员。密码使用 Argon2id（密码哈希算法），会话 Cookie（浏览器安全 Cookie）只传递随机令牌，数据库只保存令牌的 SHA-256（安全哈希）摘要。生产环境 Cookie 带 `Secure`（仅安全连接发送）属性，测试环境允许非 `Secure`。

Task 4（任务四）实现 `.xls`（老式 Excel）和 `.xlsx`（新式 Excel）文件的安全接收：先写临时目录，再校验文件头、计算哈希和使用随机对象名保存；重复哈希只建立批次关联，不重复保存文件。完成批次后只创建数据库后台任务，不在接口进程中解析文件。默认单文件上限为 20 MB（兆字节），生产环境必须显式配置数据库地址、临时目录和原始文件目录。

开发测试继续只使用 SQLite（本地数据库）内存库和 pytest（测试框架）临时目录，不依赖真实 PostgreSQL、历史目录或外部网络：

```powershell
.\.venv\Scripts\python.exe -m pytest backend/tests -q
.\.venv\Scripts\python.exe -m ruff check backend
```

## 第二后端开发批次

本批次已完成并通过统一门禁：

- `.xls`（老式 Excel）和 `.xlsx`（新式 Excel）按表头、科目树和汇总字段解析，不依赖固定行号。
- 统一 `YYYY-MM-DD`（带连接符日期）、`YYYYMMDD`（八位日期）、金额千分位和百分比字段；未知产品或日期只进入复核，不从文件名猜测业务身份。
- 活跃 `SubjectMapping`（科目映射）会按估值日、科目代码前缀和名称片段应用标准类别及是否纳入持仓；没有匹配规则的科目保留原始信息并默认不纳入资产配置。
- 保存产品快照、份额类别、科目明细、持仓明细和字段来源；已发布版本仍禁止就地修改。
- 资产负债、份额净资产、净值日收益和数量乘市价校验已落库；阻断、警告、提示结果分别进入版本状态和校验表。
- 发布、替代、撤回、恢复和审计服务已实现；发布会创建分析运行记录，但分析任务尚未由 worker（任务进程）执行。
- 产品净值、派现调整、回撤、资产配置、集中度、公司加权指数和基础风险规则已实现为纯计算模块。
- 导入批次处理器已接入解析、标准化和校验；当前由任务服务调用，尚未暴露专门的任务进程启动命令。

本批次验证结果：后端 153 项测试、历史盘点工具 63 项测试、Ruff（静态检查）、格式化检查和 ty（静态类型检查）均已通过；SQLite（本地数据库）迁移升级、指定版本回退、非破坏性回退和再升级通过；三份真实 `.xls` 样本均可稳定解析。

## 文档规则

1. 原始需求记录在会话或需求文档中；可执行结论写入本目录。
2. 指标口径发生变化时，必须增加决定记录，不能静默修改历史含义。
3. 代码提交前必须同步接口文档、数据库迁移说明和测试说明。
4. 文档中的“首期”指最小可用版本，不代表后续永远不支持该能力。
5. 不移动、不删除历史原始文件；目录整理通过清单、哈希和导入状态完成。
