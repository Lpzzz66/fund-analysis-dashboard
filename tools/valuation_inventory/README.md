# 历史估值文件只读盘点工具

对指定目录做递归扫描、SHA-256 哈希、估值表识别、产品/日期解析与主目录/gz 去重比较，
输出 JSON / CSV / Markdown 盘点报告。工具只读源目录，绝不修改、移动或删除源文件。

报告只记录相对扫描根目录的路径。输出目录不能是扫描根目录本身，也不能位于扫描根目录内。

## 依赖

使用项目根目录现有的 `.venv` Python。工具运行依赖：

- `xlrd==2.0.2`：读取 `.xls` 估值表。
- `openpyxl==3.1.5`：只读读取 `.xlsx` / `.xlsm` 工作簿。
- `pytest`：运行测试。
- `ruff`：代码规范检查。

如需安装或核对依赖，在项目根目录执行：

```powershell
.\.venv\Scripts\python.exe -m pip install "xlrd==2.0.2" "openpyxl==3.1.5" pytest ruff
```

## 运行方式

```powershell
.\.venv\Scripts\python.exe -m tools.valuation_inventory `
  --root "F:\AgentWorks\估值表A" `
  --out ".\artifacts\valuation-inventory" `
  --format all
```

### 参数

| 参数 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `--root` | 是 | — | 要扫描的根目录（只读） |
| `--out` | 是 | — | 报告输出目录 |
| `--format` | 否 | `all` | `json` / `csv` / `markdown` / `all` |
| `--workers` | 否 | `1` | 并发线程数，1 为串行 |
| `--parse-xls` / `--no-parse-xls` | 否 | 开启 | 是否读取 .xls 内容 |

## 输出报告

| 文件 | 格式 | 用途 |
|------|------|------|
| `inventory.json` | JSON | 完整机器可读文件清单 + 汇总统计 |
| `inventory.csv` | CSV | 每文件一行，方便人工筛选 |
| `summary.md` | Markdown | 汇总统计、缺口分析、需人工复核列表 |
| `dedup-groups.json` | JSON | 重复组、冲突组、主目录/gz 独有、跨区域同名对 |
| `migration-candidates.csv` | CSV | 后续迁移工具可直接读取的候选清单 |

## 估值表识别规则

通过内容关键词定位，不依赖固定行号：

1. 工作表中同时存在「科目代码」与「科目名称」（表头行）
2. 存在「估值日期」标签或任一强净值关键词（基金资产净值 / 基金单位净值 / 累计单位净值）

估值日期支持格式：`20260402`、`2026-04-02`、`2026/04/02`、`2026年4月2日`、
带「估值日期：」前缀的文本、以及日期类型单元格。

## 产品识别

候选产品来源：路径目录名、文件名、工作表名称、表头附近标题文本。

可扩展的别名列表（默认：梦一号、千金一号、天策上将）。
当多个来源给出不同产品名时，标记为 `identity_conflict`，不自动选择。

## 去重分类

| 分类 | 含义 |
|------|------|
| `same_content_duplicate` | 同产品、同估值日期、哈希相同 |
| `same_date_conflict` | 同产品、同估值日期、哈希不同（不自动选择） |
| `primary_only` | 主目录有、gz 无（主目录独有日期） |
| `gz_only` | gz 有、主目录无（gz 独有日期） |
| `unresolved_identity` | 产品、表内估值日期或哈希无法可靠识别 |

同名跨年份文件以表内估值日期为准，不按文件名判断。

## 测试

```powershell
.\.venv\Scripts\python.exe -m pytest tools/valuation_inventory/tests -q
.\.venv\Scripts\python.exe -m ruff check tools/valuation_inventory
```

测试不依赖真实历史目录，全部使用临时目录合成样本文件。
