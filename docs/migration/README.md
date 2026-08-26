# 历史估值迁移工具

`backend.app.migration`（历史迁移工具）只读扫描本地历史目录，复用 `tools.valuation_inventory`（历史盘点工具）的产品、表内估值日期和 SHA-256（安全哈希）去重口径，然后通过正式导入接口上传主目录候选文件。

## 预演

```text
cd backend
python -m app.migration --root "F:\AgentWorks\估值表A" --manifest "F:\AgentWorks\基金分析看板\artifacts\migration-manifest.json" --report "F:\AgentWorks\基金分析看板\artifacts\migration-report.json" --dry-run
```

预演不会创建服务端批次，也不会移动、重命名、删除或覆盖源文件。清单和报告只保存相对源目录的路径；输出文件不能放在源目录内。

## 上传与断点续传

```text
cd backend
python -m app.migration --root "F:\AgentWorks\估值表A" --manifest "F:\AgentWorks\基金分析看板\artifacts\migration-manifest.json" --report "F:\AgentWorks\基金分析看板\artifacts\migration-report.json" --base-url "https://your-domain.example"
```

访问令牌通过 `MIGRATION_TOKEN`（迁移令牌）环境变量注入。每个文件上传后立即写回清单；临时失败只重试失败项，源文件在上传前会再次校验大小和哈希。清单指纹变化时必须重新生成清单，避免在目录被修改后误续传。

主目录优先，`gz`（归档目录）仅有日期作为候选补充；同产品同日期不同哈希进入 `needs_review`（需要复核），同哈希重复和交易记录 `.xlsx`（电子表格）不进入业务导入。迁移工具不实现第二套 Excel 解析或落库逻辑。盘点工具作为后端发行包和生产镜像的一部分静态安装，保证本地与容器使用同一套扫描、识别和去重实现。

## 上线前 bootstrap（初始化）与 preflight（预检）

历史迁移前必须先完成业务目录初始化。使用 `deploy/bootstrap.example.json` 复制出的受控配置文件，先执行 `python -m app.bootstrap --config <config> --dry-run`，再执行正式命令。bootstrap 会检查数据库、服务端源文件存储根目录、迁移清单格式，以及清单产品标签是否被配置中的产品名称或别名覆盖；它只读取 manifest（迁移清单）元数据，不读取、移动或删除历史源目录。管理员密码不属于该配置，仍通过 `POST /api/v1/auth/initialize` 设置。

默认情况下，数据库中已有任一产品、别名、份额类别、科目映射或风险规则都会拒绝初始化。确认是受控补充时才加 `--allow-existing`。重复执行同一配置幂等，新增记录和完成审计只发生一次；如果配置内容改变，应先重新执行 dry-run（预演）并人工审阅差异。

推荐顺序：bootstrap dry-run -> bootstrap 正式执行 -> migration dry-run -> 少量样本上传 -> 样本解析/校验/发布验收 -> 处理六组 gz 冲突 -> 主目录批量上传 -> 覆盖率和缺口报告 -> 分批发布。迁移工具始终把历史源目录视为只读，不能把 manifest、report（报告）或临时文件写回源目录。
