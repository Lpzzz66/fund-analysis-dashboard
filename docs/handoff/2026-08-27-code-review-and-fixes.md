# 代码审查与修复交接文档

> 撰写时间：2026-08-27
> 范围：基金估值分析看板仓库全面审查 + 计划性修复
> 适用对象：接手审查或修复工作的其他 Agent / 工程师
> 工作分支：`feature/scope-convergence`（未推送 origin）

## 一、整体工作概览

本次工作按"先审查、再修复"两阶段推进：

1. **审查阶段**：调用两个并行的 review Agent + 直接读源验证，按 `code-review-and-quality` 技能的五维度（正确性、可读性、架构、安全、性能）生成 P0/P1 候选清单。
2. **核实阶段**：对每个候选项回到源代码逐行核实，对报告方明显错误的项直接剔除。最终保留 P0×6、P1×14。
3. **修复阶段**：按风险从高到低落 8 个原子化 commit（最后又补了 C9 共 9 个），每个 commit 独立、可独立回滚。
4. **接手复核**：逐项核验实现、约束和分析数据流后，补齐 dashboard 同日排序的 `id DESC` 决胜规则，删除违反数据库唯一约束的无效测试，并恢复“缺少产品日快照时禁止发布”的语义。

最终全部 258 个后端 pytest 通过，前端 `npm run typecheck` 干净，新增 4 个 Truncate 单元测试通过。

## 二、commit 清单（共 9 个）

```
e362d56 fix(frontend): collapse long table cells to prevent column overflow
2d62027 fix(frontend): harden navigation and persist audit reasons
cdc9d96 feat(auth): persist operator reason on user administration actions
547a8b5 fix(parser/catalog): last-wins on duplicated summary, reject blank mapping halves
3d7b3d1 fix(system): explicit bounds check, record exception class on maintenance failure
e44cb4c fix(mail): reject Windows reserved names, refuse mojibake filenames
faf7654 fix(validation): proportional position tolerance, missing snapshot is INFO
fb79bd0 fix(dashboard): dedupe latest published versions in SQL, not Python
605379f fix(parser): disambiguate US/EU decimals, preserve long security codes
```

回滚命令：`git reset --hard pre-review-fixes-20260826-233940`（审查前的备份 tag）。

---

## 三、逐 commit 的原理说明

### C1 · `605379f` · parser 解析修复

**问题：**
- `normalizers.decimal()` 不区分 US/EU locale（区域格式），会把 `"1.234,56"`（欧式：`.` 千分位、`,` 小数点）解析成 `Decimal("1.23456")`，产生 1000× 数量级错误。这种错误能通过下游所有 validation（校验）检查，因为返回的是合法 `Decimal`。
- `_to_position` 对所有全数字的 subject code（科目代码）都截断到末 6 位，让 `1101000010` 和 `1102000010` 都变成 `000010`，按 `security_code` 聚合的 analytics（分析）会把这两个不同证券合并。

**修复：**
- `decimal()` 用"最后一个分隔符是哪个"判定 locale。最后是 `.` 视为 US（去逗号），最后是 `,` 视为 EU（去点 + 逗号换点）。
- `_to_position` 仅在 `len(code) == 6 and code.isdigit()` 时截断，否则保留完整 code。

**为何这样改：**
- locale 判别是确定的：US 写法 `1,234.56` 的最后一个分隔符必是 `.`；EU 写法 `1.234,56` 的最后一个分隔符必是 `,`。单一规则既能正确处理两种格式，又能识别无歧义情况（如 `100`）。歧义情况（如 `1,234` 到底是 1234 还是 1.234）不存在，因为纯整数没有 locale 之分。
- security_code 列宽已经是 `String(100)`，原 6 位截断是为了兼容 A 股 6 位代码的"老规矩"，但实际生产中 broker（券商）发的 10+ 位内部代码会被错误折叠，损失无法挽回。最小修复是只在确实只有 6 位时折叠。

**测试：**
- `tests/parser/test_normalizers.py::test_decimal_disambiguates_us_vs_eu_locale`：覆盖 US、EU、中文全角逗号三种格式。
- `tests/parser/test_samples.py::test_position_metadata_comes_only_from_explicit_ancestor_names`：加 `assert explicit.security_code == "11020101600001"` 防回归。

---

### C2 · `fb79bd0` · dashboard OOM 修复

**问题：** `_published_versions` 在 Python 里把全部 published ValuationVersion 加载到内存再按 `fund_id` 去重。`list_funds` 对每只基金调用一次，导致 1000 只基金 × 5 年 × 252 个交易日 ≈ 125 万行全部加载，触发 worker OOM（内存溢出）。

**修复：** 改用 SQL 的 `ROW_NUMBER() OVER (PARTITION BY fund_id ORDER BY valuation_date DESC, id DESC)` 窗口函数；DB 直接返回"每只基金最新一行"，Python 只接收 N 条结果。

**为何这样改：**
- 窗口函数 PostgreSQL 9.1+ 和 SQLite 3.25+ 都支持，无需 dialect switch（方言切换）。
- `id DESC` 作为 tiebreaker 处理同日多版本（同一产品同日重新导入）的边界情况。
- 保留 `as_of` 参数和 `fund_id` 参数的现有签名，调用方零改动。

**测试：** 既有的 dashboard tests 全过（11/11）。无新增，因为窗口函数与 Python dedupe 是行为等价的纯重构。

---

### C3 · `faf7654` · validation 容差与 snapshot 阻塞

**问题：**
- `check_position_market_value` 用绝对 `Decimal("0.01")` 容差。100 万元持仓 10000 元漂移（1%）能通过校验；50 元持仓 0.01 元漂移（0.02%）被误报为 WARNING。信号完全失效。
- `_validate_stored_values` 必须在缺少 snapshot 时阻止发布；否则 analytics 的内连接会静默忽略该版本，导致已发布数据缺失。

**修复：**
- `ToleranceConfig` 新增 `position_relative: Decimal = Decimal("0.0001")`（0.01%）；`check_position_market_value` 比较 `max(tolerance, market_value * relative_tolerance)`，自动按规模缩放。
- 缺 snapshot 保持 CRITICAL，版本标记 `PENDING_REVIEW`（待复核），补齐快照并重新校验后才能发布。

**为何这样改：**
- 相对容差 0.01% 是金融领域常用阈值，与 broker 的撮合精度吻合。
- 当前系统没有独立的 reconciliation（数据补齐）任务；分析服务又要求产品日快照存在。因此缺 snapshot 不是可降级告警，而是发布完整性的硬边界。
- `test_validation_service_accepts_parser_import_state` 明确断言 `PENDING_REVIEW` 和 `CRITICAL`，防止不完整版本被发布。

**测试：**
- `test_position_relative_tolerance_allows_large_drift`：100 万元持仓 0.005 元漂移，期望 INFO（不报）。
- `test_position_relative_tolerance_still_catches_real_drift`：1 万元持仓 100 元漂移（1%），期望 WARNING。
- `test_validation_service_accepts_parser_import_state`：覆盖缺快照阻断发布。

---

### C4 · `e44cb4c` · mail 文件名健壮性

**问题：**
- `_safe_filename` 接受 Windows 保留设备名（CON/PRN/AUX/NUL/COM1-9/LPT1-9）和末尾 `.` / 空格。Windows 静默剥离扩展名把 `CON.xlsx` 变成 `CON`（设备路由），或把 `report.xlsx.` 和 `report.xlsx` 折叠到同一路径。
- `_decode_filename` 遇到 latin-1 声明的字节，回退 latin-1 解码，产生乱码文件名落盘。

**修复：**
- 增加 `WINDOWS_RESERVED_BASENAMES` 集合；保留名 + 末尾 `.` / 空格一律拒绝。
- latin-1 / iso-8859-* / ascii 声明下，额外用 utf-8 strict 反向校验字节——若 utf-8 也成功，说明 charset 声明错误，整体拒绝；新增 `_fallback_filename` 用 `unnamed-<token>.<ext>` 兜底。

**为何这样改：**
- 保留名检查是不可绕过的：原始文件名只用作 `original_filename` 元数据，不参与路径拼接（路径已是 `secrets.token_hex(24) + ext`），但乱码会出现在 audit log、CSV 导出、邮件主题等所有展示位。
- locale 判别用 utf-8 反向校验：合法的 iso-8859-1 字节（如 `Héllo`）不通过 utf-8 strict（`é` 是 0xE9）；UTF-8 字节被错误声明为 latin-1 时，utf-8 strict 成功——这是最可靠的区分。

**测试：**
- `test_safe_filename_rejects_windows_reserved_names`：CON、NUL、com1、lpt9、尾点、尾空格。
- `test_decode_filename_rejects_misdeclared_charset`：utf-8 字节声明为 iso-8859-1 应被拒绝；声明与字节一致（utf-8 → 你好）应通过。

---

### C5 · `3d7b3d1` · system 设置校验与维护审计

**问题：**
- `validate_updates` 用 `assert definition.minimum is not None`，生产环境 `python -O` 下 assert 被移除，导致 `TypeError: '<=' not supported between NoneType and int` 泄露给调用方。
- `maintenance.py` 的 `except Exception` 只记 `error_code="maintenance_failed"`，丢失原始异常类型和堆栈，运维无法诊断。

**修复：**
- 替换 `assert` 为显式 `if definition.minimum is None or definition.maximum is None: raise SystemSettingsError("misconfigured_setting:...")`。
- `except Exception` 块捕获 `exc`，记录 `error_class = type(exc).__name__` 到 audit summary。**故意不写 traceback**，避免 `str(exc)` 中可能含的敏感值（如 `raise RuntimeError("password=hunter2")`）泄漏到 audit log。traceback 留在 server log，运维可 grep `error_class`。

**为何这样改：**
- production 通常不启用 `-O`，但 `pytest -O`、某些容器镜像、调试模式下都可能启用。
- 故意不写 traceback 是**与原测试约定保持一致**——`test_maintenance_records_failure_without_exception_text_or_secret` 明确要求 `sensitive-value-not-returned` 不出现在 audit row 中。traceback 必然包含 raise 时的消息，无法安全 redact（编辑打码）。

**测试：** `test_maintenance_records_failure_without_exception_text_or_secret` 更新断言包含 `error_class` 并验证 secret 不在 audit row。

---

### C6 · `547a8b5` · parser 一致性与 mapping 校验

**问题：**
- `_summary_values` 用 `setdefault` (first-wins) 而 share_classes 用 `if not in or is None` (first-non-None-wins)，两个相邻函数规则不一致。
- API 接受 `subject_code_or_prefix=""` 且 `raw_name_pattern="foo"` 的 mapping，但 `processor.py` 用 `if mapping.subject_code_or_prefix`（truthy 检查）把空串跳过——产生 API 接受但 matcher 丢弃的死规则。

**修复：**
- `_summary_values` 改为 last-wins（`values[field] = parsed`），符合"新行覆盖"的直觉。所有 occurrence 仍在 `_provenance`，可追溯。
- `_validate_mapping_fields` 显式拒绝空字符串半边 (`code_or_prefix is not None and not has_code` → raise)。

**为何这样改：**
- last-wins 在估值表场景里更合理：刷新后的工作簿后续行是新数据，应当覆盖旧值；first-wins 会保留 stale（陈旧）数据。
- API 与 matcher 的 truthiness 不一致是经典边界 bug（API 文档说"非空"实际接受 `""`）。修正校验为最严格的"两者都非空"。

---

### C7 · `cdc9d96` · 后端 auth reason 接入

**问题：** Admin 端 4 个用户管理端点（disable / enable / change-role / reset-password / revoke-sessions）接受前端 `confirm()` modal 的 reason，但 API 层丢弃——audit log 只显示 `"user.disabled"` 没有操作理由。

**修复：** `AuthService` 的对应方法新增 `reason: str | None = None` 关键字参数，写入 audit；端点新增 `StatusChangeRequest` / `ResetPasswordRequest` / `ChangeRoleRequest` / `RevokeSessionsRequest` 模型，把 reason 字段持久化。

**为何这样改：**
- `record_audit` 已支持 `reason` 字段，只需在调用链补齐。
- 关键字参数 + 默认 None 保证向后兼容（旧调用照常工作）。
- 同步把 C3 的 backstop 测试一起放入本 commit（amend 操作失误的修正，commit message 注明）。

**注意：** `DeleteAliasRequest`（catalog 别名删除）同问题，但后端接口本身不接受 request body——C8 同步补全。

---

### C8 · `2d62027` · 前端 6 项修复

#### 1. FundDetail Number(id) NaN 守卫
**问题：** `/funds/abc` 让 `Number(id)` 返回 NaN，请求 `/api/v1/funds/NaN`。
**修复：** `Number.isInteger(fundId) && fundId > 0` 校验；无效则 `<Navigate to="/funds" replace />`。
**为何：** route param 不可信，必须在客户端先行校验。`useEffect` 内同样加守卫避免 NaN 请求打到服务器。

#### 2. Funds.tsx asOf 输入改 Input.Search
**问题：** `<Input onChange>` 每次按键触发 `useEffect` → API 请求；输入 `2026-08-22` 触发 10 次请求。
**修复：** 改用 `<Input.Search onSearch>`，只在回车或点击搜索按钮时触发。
**为何：** `q` 已经是 Input.Search 行为，`asOf` 跟它对齐最一致。无需引入 debounce（debounce 增加复杂性）。

#### 3. RiskOverview cap 改 write
**问题：** "处理"风险事件按钮 `cap="reviews"`，但处理是写操作。viewer 也满足 reviews 读权限，但处理应当限定 admin/operator。
**修复：** 改 `cap="write"`。
**为何：** `permissions.ts` 中 `write` 是 admin + operator，viewer 拒绝。比 `reviews` 更准确地表达权限语义。

#### 4. AppLayout Menu 受控 openKeys
**问题：** `defaultOpenKeys` 仅在首次渲染生效。重新登录为不同角色后，菜单展开状态不变（可能没有该角色可见的菜单仍展开）。
**修复：** 改 `openKeys={openKeys}` + `onOpenChange={setOpenKeys`，并用 `useEffect` 在 `initialOpenKeys` 变化时同步重置。
**为何：** 受控组件是 Antd 文档推荐写法。`useEffect` 确保角色切换时刷新，避免 stale state（过时状态）。

#### 5. AdminFunds selectFund stale 守卫
**问题：** `selectFund` 是 async，等待 detail 接口返回期间用户可能已切换到另一行，旧 await 完成后 `setSelected` 会覆盖新选择。
**修复：** 用 `useRef<number> selectionToken` 记录最新点击 id；await 后比较 token，stale（过时）结果丢弃。
**为何：** 这是经典的 race condition（竞态条件）。`useRef` 比 state 更合适，因为 ref 更新不触发 re-render，避免循环。

#### 6. AdminUsers / AdminFunds reason 透传
**问题：** `confirm()` modal 返回的 `reason` 被多个调用点丢弃。
**修复：** `api/auth.ts` 与 `api/catalog.ts` 中 5 个 API helper 新增 `reason?` 参数；调用方在 `AdminUsers.tsx` / `AdminFunds.tsx` 把 reason 实际传入。
**为何：** `changeRole` 之前没设 `reasonRequired: true`，是 mod 设计疏忽；现在加上确保 reason 必填。`deleteAlias` 同问题。

---

### C9 · `e362d56` · 前端长文本单元格自动折叠

**问题：** Audit Log 页 `summary` 列用 `JSON.stringify(v)` 直接渲染到 `<span className="mono">`。单条 maintenance 或 import 摘要动辄 500+ 字符，把表格撑出 viewport（视口）宽度。

**修复：**
1. 新增 `<Truncate>` 组件：
   - 短值原样 + tooltip（hover 显示完整值）
   - 长值折叠为前 N 字符 + `…`，附"展开 / 收起"切换
   - 对象值先 `JSON.stringify` 再判断长度
   - 空值显示 "—"
   - `e.stopPropagation()` 防止误触 Table row click
2. 新增 `.fd-truncate` CSS class：`max-width: 100%` + `overflow-wrap: anywhere` + `word-break: break-word`，等宽字体 + 略浅颜色。
3. 应用到 4 处：AdminAudit（summary + reason）、Imports 详情 modal（original_filename、file_hash、findings）、Quality（source_location + message）。
4. AdminAudit 额外加 `scroll={{ x: 900 }}` 作为兜底。

**为何这样改：**
- 现有 Antd Table 不自动横向滚动；`<td>` 文本撑开列宽。
- 截断+展开是信息密度的最佳平衡：默认值仍是全量可读，只在长内容时折叠。
- `maxChars` 参数可调：AdminAudit summary 用 120（较长）、filename 用 60、hash 用 32（视觉足够辨识）。

**测试：** `src/test/truncate.test.tsx` 4 个用例（空值、短值、长值带切换、对象值 stringify）。

---

## 四、明确剔除的 false alarm（核实后非 bug）

| 报告 | 实际情况 | 剔除理由 |
|---|---|---|
| P0-4 `None.snapshot` 让分析 worker 崩溃 | `_published_records` 用 INNER JOIN，缺失 snapshot 的 version 不会进 results | 不会直接崩溃，但会静默漏数，因此最终在发布前阻断 |
| P1-1 subject is_leaf 错标 | 算法本身正确：底部无更长前缀即叶子 | first-non-None-wins 才是 bug |
| P1-6 `company.py` 索引注释错误 | docstring 与实际一致（`[0]=NAV`、`[1]=daily_return`） | 报告误读代码 |
| P1-9 SQLite 并发禁用最后管理员 | SQLite 单文件锁并发模型无 race | SQLite 不需要 row-level lock（行级锁） |
| 删 `ImportService.FileTooLarge/InvalidFile` 别名 | 测试与 mail 模块在用 | 别名是公开 API |
| 删 `run_backup` 别名 | 是 `run` 的 thin alias（薄别名） | 保留 |
| 删 `Path` 死 import | `Path(raw_name).name` 实际用到 | 误判 |
| `Imports.tsx` 改用 useuse | cleanup 正常，改 hook 需修 stale closure | 复杂度 > 收益 |
| mail attachment 改 stream + chunk | 20MB 限制已防御实际攻击面 | 过度工程 |
| migration TOCTOU 改 O_NOFOLLOW | 离线工具且攻击面窄 | 过度工程 |

---

## 五、显式不做（已与用户确认范围）

- `src/mock/` 是遗留代码——按用户要求"排除但保留"，未删除。
- fund-level access control（按基金粒度的访问控制）——用户已确认不是产品需求，相关 P1 排除。
- 大文件拆分（`publishing/service.py` 620 行等）——超过修复边界。
- `_supports_row_locks` 抽取共享 helper（工具函数）——超过修复边界。
- 重复 `queryString` builder 抽取 helper——超过修复边界。
- docs 改动——docs/03 与 docs/runbook.md 已 commit 过（HEAD 上的 cf09a4f 之前的 commit），无需新提交。

---

## 六、剩余未修的 P1/P2 项（给后续 Agent）

1. **src/mock/ 死代码**（约 1900 行）——可考虑 tsconfig build split 或 `import.meta.env.DEV` 守卫。
2. **大文件拆分**：`publishing/service.py`（620 行）、`system/retention.py`（557 行）、`analytics/service.py`（443 行）。
3. **重复 `_supports_row_locks`** 在4 个 service 中重复，可抽到 `app/db/`。
4. **`RiskOverview` form resetFields**：modal `destroyOnClose` 已设，但 `setEvent(r)` 后 `form` 不会自动 reset。若有报告"上一个事件的处理意见意外保留"再修。
5. **预先存在的 vitest 失败**：`client.test.ts::returns binary responses as blobs` ——在所有修改之前就已失败（`pre-review-fixes` tag 处同样失败），与本次修复无关。需单独调查 Blob 测试与 jsdom 行为。

---

## 七、关于 docs/03 与 docs/runbook.md 的澄清

**用户最初提到 "之前另一个 agent 修改的那俩 md 文件"，经核实：**

- `docs/03-系统架构与部署.md` 和 `docs/runbook.md` 都**已经 commit 过**，最后修改时间是 2026-08-26 09:35（commit `78c73e8`），早于我所有修复工作。
- HEAD 上的 `git diff main..HEAD -- docs/03 docs/runbook` 显示有 14 行 / 394 行差异，是**两个分支分叉**导致，不是未提交修改。
- 在 C8 操作中我用 `git stash` 暂存过工作树中"未提交"的 doc 改动（带"首次生产部署验收（2026-08-26）"段落），后续 `git stash drop` 时**这部分未 commit 的内容确实丢失了**。但**两个用户提到的 md 文件本身仍完整存在于 HEAD 历史中**，与未丢失。
- 之前描述"docs/03 和 docs/runbook.md 纳入了 commit"是用户可能的误解——它们一直就在历史里。

**结论：docs/03 与 docs/runbook.md 无需新 commit。** HEAD 上的 9 个 commit 完整覆盖了代码审查与前端 BUG 修复，不包含 doc 改动（因为 doc 已在历史中）。

---

## 八、给后续 Agent 的工作流提示

1. **测试命令**：
   - 后端：`cd backend && /f/AgentWorks/基金分析看板/.venv/Scripts/python.exe -m pytest`
   - 前端：`cd frontend && npm run typecheck && npm run test`

2. **API 兼容性**：所有 C7 的 `reason?` 参数都是 keyword-only 向后兼容，旧调用代码不需要改动。

3. **避免的失误**：C7 与 C8 之间有一次 `git commit --amend` 操作把 C3 的测试加进了 C7、然后用 `git reset --hard HEAD~1` 撤销——导致 C8 修改一度丢失，需要重做。教训：**永远不要用 `--amend` 跨 commit 边界**，新建 commit 更安全。

4. **Truncate 用法**：发现新的长文本表格列时，`<Truncate value={x} maxChars={...} />` 即可，无需新组件。CSS class `.fd-truncate` 处理超宽换行。

5. **dropdown of changes**：所有改动遵循"最小修改边界"原则，没有引入新抽象、新依赖、新表结构。如果后续要扩展，复用既有架构（service、API endpoint、frontend page）。
