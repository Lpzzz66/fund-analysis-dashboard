/**
 * Mock API adapter — returns the same {data, meta} envelope the real backend uses.
 * Replace these functions with fetch() calls to /api/v1/... to go live.
 */
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
import * as db from "./db";
import type {
  JobStatus,
  QualityStatus,
  UserRole,
  UserStatus,
  ValidationLevel,
  ValuationStatus,
} from "@/utils/constants";

export interface PageMeta {
  page: number;
  page_size: number;
  total: number;
}
export interface CoverMeta {
  coverage: { available: number; total: number };
}

function delay<T>(v: T): Promise<T> {
  return sleep(180 + Math.random() * 220).then(() => v);
}

function paginate<T>(rows: T[], page: number, pageSize: number): { data: T[]; meta: PageMeta } {
  const start = (page - 1) * pageSize;
  return {
    data: rows.slice(start, start + pageSize),
    meta: { page, page_size: pageSize, total: rows.length },
  };
}

/* ---------- auth ---------- */

export interface UserData {
  id: number;
  username: string;
  display_name: string;
  role: UserRole;
  status: UserStatus;
  last_login_at: string | null;
  navigation: string[];
}

export async function login(
  username: string,
  _password: string,
): Promise<{ data: UserData }> {
  const u = db.users.find((x) => x.username === username);
  // Demo: accept any password; simulate the no-account leak prevention.
  if (!u) {
    return delay({
      data: {
        id: 0,
        username,
        display_name: "",
        role: "viewer",
        status: "disabled" as UserStatus,
        last_login_at: null,
        navigation: [],
      },
    });
  }
  const nav = navMap[u.role];
  return delay({ data: { ...userToData(u), navigation: nav } });
}

export async function initialize(
  _username: string,
  display_name: string,
): Promise<{ data: UserData }> {
  const u = db.users[0];
  u.display_name = display_name || u.display_name;
  return delay({ data: { ...userToData(u), navigation: navMap[u.role] } });
}

export async function me(): Promise<{ data: UserData }> {
  const u = db.users[0];
  return delay({ data: { ...userToData(u), navigation: navMap[u.role] } });
}

export async function changePassword(): Promise<{ data: { changed: boolean } }> {
  return delay({ data: { changed: true } });
}

const navMap: Record<UserRole, string[]> = {
  admin: ["dashboard", "funds", "imports", "reviews", "users"],
  operator: ["dashboard", "funds", "imports", "reviews"],
  viewer: ["dashboard", "funds"],
};

function userToData(u: db.UserRow): UserData {
  return {
    id: u.id,
    username: u.username,
    display_name: u.display_name,
    role: u.role,
    status: u.status,
    last_login_at: u.last_login_at,
    navigation: [],
  };
}

/* ---------- dashboard overview ---------- */

export interface OverviewFund {
  id: number;
  name: string;
  valuation_date: string | null;
  unit_nav: string | null;
  daily_return: string | null;
}

export interface DashboardOverview {
  as_of: string | null;
  total_net_assets: string | null;
  fund_count: number;
  company_index: string | null;
  company_daily_return: string | null;
  risk_event_count: number;
  quality_status: QualityStatus;
  funds: OverviewFund[];
}

export async function dashboardOverview(asOf?: string): Promise<{ data: DashboardOverview; meta: { as_of: string | null; coverage: { available: number; total: number } } }> {
  const active = db.funds.filter((f) => f.status === "active");
  const included = asOf
    ? active.filter((f) => f.valuation_date === asOf)
    : active;
  const totalNet = included.reduce((s, f) => s + Number(f.unit_nav ?? 0) * 50_000_000, 0);
  const funds: OverviewFund[] = included.map((f) => ({
    id: f.id,
    name: f.name,
    valuation_date: f.valuation_date,
    unit_nav: f.unit_nav,
    daily_return: f.daily_return,
  }));
  const lastIdx = db.companyIndex.length - 1;
  const ci = db.companyIndex[lastIdx];
  const openRisk = db.riskEvents.filter((e) => e.status === "open");
  const qs: QualityStatus = openRisk.length > 0 ? "warning" : "valid";
  return delay({
    data: {
      as_of: asOf ?? ci.date,
      total_net_assets: totalNet > 0 ? totalNet.toFixed(10) : null,
      fund_count: included.length,
      company_index: ci.index_value,
      company_daily_return: ci.daily_return,
      risk_event_count: openRisk.length,
      quality_status: qs,
      funds,
    },
    meta: {
      as_of: asOf ?? ci.date,
      coverage: { available: included.length, total: active.length },
    },
  });
}

export async function companyIndexSeries() {
  return delay({ data: { points: db.companyIndex }, meta: { coverage: { available: db.companyIndex.length, total: db.companyIndex.length } } });
}

/* ---------- funds list / detail ---------- */

export interface FundListItem {
  id: number;
  name: string;
  product_code: string | null;
  status: "active" | "inactive";
  current_version_id: number | null;
  valuation_date: string | null;
  unit_nav: string | null;
  daily_return: string | null;
  quality_status: QualityStatus;
  strategy: string | null;
  manager: string | null;
  has_risk: boolean;
}

export interface FundListParams {
  q?: string;
  status?: "active" | "inactive";
  strategy?: string;
  quality?: QualityStatus;
  has_risk?: boolean;
  page?: number;
  page_size?: number;
}

export async function fundsList(params: FundListParams): Promise<{ data: FundListItem[]; meta: PageMeta }> {
  let rows = [...db.funds];
  if (params.q) rows = rows.filter((f) => f.name.includes(params.q!));
  if (params.status) rows = rows.filter((f) => f.status === params.status);
  if (params.strategy) rows = rows.filter((f) => f.strategy === params.strategy);
  if (params.quality) rows = rows.filter((f) => f.quality_status === params.quality);
  const riskFundIds = new Set(db.riskEvents.map((e) => e.fund_id));
  if (params.has_risk !== undefined)
    rows = rows.filter((f) => params.has_risk === riskFundIds.has(f.id));
  const items: FundListItem[] = rows.map((f) => ({
    id: f.id,
    name: f.name,
    product_code: f.product_code,
    status: f.status,
    current_version_id: f.current_version_id,
    valuation_date: f.valuation_date,
    unit_nav: f.unit_nav,
    daily_return: f.daily_return,
    quality_status: f.quality_status,
    strategy: f.strategy,
    manager: f.manager,
    has_risk: riskFundIds.has(f.id),
  }));
  return delay(paginate(items, params.page ?? 1, params.page_size ?? 10));
}

export async function fundDetail(fundId: number): Promise<{ data: db.FundRow | null }> {
  return delay({ data: db.funds.find((f) => f.id === fundId) ?? null });
}

export async function fundOverview(fundId: number) {
  const f = db.funds.find((x) => x.id === fundId);
  if (!f) return delay({ data: null });
  const snap = db.snapshots.get(fundId)!;
  const dd = db.drawdown.get(fundId)!;
  const maxDD = dd.reduce((m, p) => Math.min(m, Number(p.drawdown)), 0);
  const curDD = Number(dd[dd.length - 1].drawdown);
  return delay({
    data: {
      fund_id: fundId,
      name: f.name,
      valuation_date: f.valuation_date,
      version_id: f.current_version_id,
      unit_nav: f.unit_nav,
      cumulative_unit_nav: snap.cumulative_unit_nav,
      daily_return: f.daily_return,
      total_assets: snap.total_assets,
      total_liabilities: snap.total_liabilities,
      net_assets: snap.net_assets,
      available_position: snap.available_position,
      cash_ratio: snap.cash_ratio,
      leverage_ratio: snap.leverage_ratio,
      max_drawdown: maxDD.toFixed(10),
      current_drawdown: curDD.toFixed(10),
      quality_status: f.quality_status,
    },
  });
}

export interface NavPoint {
  valuation_date: string;
  unit_nav: string | null;
  cumulative_unit_nav: string | null;
  cumulative_payout: string | null;
  adjusted_nav: string | null;
  daily_return: string | null;
  cumulative_return: string | null;
}

export async function navSeries(
  fundId: number,
  start?: string,
  end?: string,
): Promise<{ data: { methodology: string; total_return: string | null; points: NavPoint[] }; meta: CoverMeta }> {
  const raw = db.navSeries.get(fundId) ?? [];
  let pts = raw;
  if (start) pts = pts.filter((p) => p.date >= start);
  if (end) pts = pts.filter((p) => p.date <= end);
  let cum = 0;
  const out: NavPoint[] = pts.map((p) => {
    cum += Number(p.daily);
    return {
      valuation_date: p.date,
      unit_nav: p.unit_nav,
      cumulative_unit_nav: p.cum_nav,
      cumulative_payout: "0.0000000000",
      adjusted_nav: p.cum_nav,
      daily_return: p.daily,
      cumulative_return: cum.toFixed(10),
    };
  });
  const methodology = pts.length === 0 ? "empty" : "cumulative_unit_nav";
  return delay({
    data: {
      methodology,
      total_return: out.length ? out[out.length - 1].cumulative_return : null,
      points: out,
    },
    meta: { coverage: { available: pts.length, total: raw.length } },
  });
}

export async function drawdownSeries(
  fundId: number,
  start?: string,
  end?: string,
): Promise<{ data: { points: db.DrawdownPoint[]; max_drawdown: string; peak_date: string; trough_date: string; current_drawdown: string } }> {
  const raw = db.drawdown.get(fundId) ?? [];
  let pts = raw;
  if (start) pts = pts.filter((p) => p.date >= start);
  if (end) pts = pts.filter((p) => p.date <= end);
  let maxD = 0;
  let peakDate = pts[0]?.date ?? "";
  let troughDate = pts[0]?.date ?? "";
  for (const p of pts) {
    const d = Number(p.drawdown);
    if (d < maxD) {
      maxD = d;
      peakDate = p.date;
      troughDate = p.date;
    }
  }
  return delay({
    data: {
      points: pts,
      max_drawdown: maxD.toFixed(10),
      peak_date: peakDate,
      trough_date: troughDate,
      current_drawdown: pts.length ? pts[pts.length - 1].drawdown : "0",
    },
  });
}

export async function positions(
  fundId: number,
  params: {
    account?: string;
    market?: string;
    merge?: boolean;
    sort?: "market_value" | "nav_weight" | "valuation_gain";
    page?: number;
    page_size?: number;
  } = {},
): Promise<{ data: db.PositionRow[]; meta: PageMeta & { valuation_date: string | null } }> {
  let rows = [...(db.positions.get(fundId) ?? [])];
  if (params.account) rows = rows.filter((r) => r.account === params.account);
  if (params.market) rows = rows.filter((r) => r.market === params.market);
  if (params.merge) {
    // Merge by security code across accounts.
    const m = new Map<string, db.PositionRow>();
    for (const r of rows) {
      const ex = m.get(r.security_code);
      if (!ex) m.set(r.security_code, { ...r, account: "穿透合并" });
      else {
        ex.quantity = (Number(ex.quantity) + Number(r.quantity)).toFixed(10);
        ex.market_value = (Number(ex.market_value) + Number(r.market_value)).toFixed(10);
        ex.cost = (Number(ex.cost) + Number(r.cost)).toFixed(10);
        ex.valuation_gain = (Number(ex.valuation_gain) + Number(r.valuation_gain)).toFixed(10);
      }
    }
    rows = [...m.values()];
  }
  const sortKey = params.sort ?? "market_value";
  rows.sort((a, b) => Number(b[sortKey] ?? 0) - Number(a[sortKey] ?? 0));
  const f = db.funds.find((x) => x.id === fundId);
  return delay({
    ...paginate(rows, params.page ?? 1, params.page_size ?? 50),
    meta: {
      ...paginate(rows, 1, rows.length).meta,
      page: params.page ?? 1,
      page_size: params.page_size ?? 50,
      valuation_date: f?.valuation_date ?? null,
    },
  });
}

export async function allocation(
  fundId: number,
  _denom: "net_assets" | "total_assets" = "net_assets",
): Promise<{ data: { items: db.AllocationItem[]; denominator: string; total_market_value: string } }> {
  const items = db.allocations.get(fundId) ?? [];
  const total = items.reduce((s, i) => s + Number(i.market_value), 0);
  return delay({
    data: {
      items,
      denominator: _denom,
      total_market_value: total.toFixed(10),
    },
  });
}

export async function shareClasses(fundId: number) {
  return delay({ data: db.shareClassSnapshots.get(fundId) ?? [], meta: { total: db.shareClassSnapshots.get(fundId)?.length ?? 0 } });
}

export interface QualityFinding {
  rule_code: string;
  level: ValidationLevel;
  actual_value: string | null;
  expected_value: string | null;
  difference: string | null;
  source_location: string | null;
  message: string;
}

export async function quality(fundId: number): Promise<{ data: { version_id: number | null; valuation_date: string | null; quality_status: QualityStatus; validation: QualityFinding[] } }> {
  const f = db.funds.find((x) => x.id === fundId);
  if (!f || !f.current_version_id)
    return delay({ data: { version_id: null, valuation_date: null, quality_status: "pending", validation: [] } });
  const findings = (db.validations.get(f.current_version_id) ?? []).map((v) => ({
    rule_code: v.rule_code,
    level: v.level,
    actual_value: v.actual_value,
    expected_value: v.expected_value,
    difference: v.difference,
    source_location: v.source_location,
    message: v.message,
  }));
  return delay({
    data: {
      version_id: f.current_version_id,
      valuation_date: f.valuation_date,
      quality_status: f.quality_status,
      validation: findings,
    },
  });
}

export interface VersionDiffItem {
  field: string;
  previous: string;
  current: string;
  change: string;
}

export async function versionDiff(_fundId: number): Promise<{ data: VersionDiffItem[] }> {
  return delay({
    data: [
      { field: "基金资产净值", previous: "49,800,000.00", current: "50,000,000.00", change: "+0.40%" },
      { field: "单位净值", previous: "1.2450", current: "1.2500", change: "+0.40%" },
      { field: "累计单位净值", previous: "1.2480", current: "1.2530", change: "+0.40%" },
      { field: "总资产", previous: "51,800,000.00", current: "52,000,000.00", change: "+0.39%" },
      { field: "现金比例", previous: "5.50%", current: "5.77%", change: "+0.27pp" },
    ],
  });
}

export async function versionHistory(fundId: number): Promise<{ data: db.VersionRow[] }> {
  return delay({ data: db.fundVersions.get(fundId) ?? [] });
}

/* ---------- imports ---------- */

export async function importBatchesList(params: { source_type?: string; status?: string; page?: number; page_size?: number } = {}): Promise<{ data: db.ImportBatchRow[]; meta: PageMeta }> {
  let rows = [...db.importBatches];
  if (params.source_type) rows = rows.filter((r) => r.source_type === params.source_type);
  if (params.status) rows = rows.filter((r) => r.status === params.status);
  return delay(paginate(rows, params.page ?? 1, params.page_size ?? 10));
}

export async function importBatchDetail(batchId: number): Promise<{ data: db.ImportBatchRow | null }> {
  return delay({ data: db.importBatches.find((b) => b.id === batchId) ?? null });
}

export async function createImportBatch(sourceType: string, fileNames: string[]): Promise<{ data: { id: number; file_count: number } }> {
  const bid = ++db.importBatches.length + 9000;
  const files = fileNames.map((n) => ({
    id: Math.floor(Math.random() * 100000),
    original_filename: n,
    file_hash: Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join(""),
    file_size: 50000 + Math.floor(Math.random() * 50000),
    duplicate: false,
  }));
  db.importBatches.unshift({
    id: bid,
    source_type: sourceType as never,
    file_count: files.length,
    status: "created",
    created_at: new Date().toISOString(),
    files,
    job: { id: bid, type: "process_import_batch", status: "pending", attempts: 0, max_attempts: 3, locked_at: null, started_at: null, finished_at: null, error_code: null, next_retry_at: null, can_retry: false },
    versions: [],
  });
  return delay({ data: { id: bid, file_count: files.length } });
}

export async function retryBatch(batchId: number): Promise<{ data: { id: number; status: string } }> {
  const b = db.importBatches.find((x) => x.id === batchId);
  if (b && b.job) {
    b.job.status = "running";
    b.status = "processing";
    b.job.attempts = 1;
  }
  return delay({ data: { id: batchId, status: b?.status ?? "queued" } });
}

export interface VersionActionInput {
  reason?: string | null;
  confirm_warnings?: boolean;
  note?: string;
  allow_publish?: boolean;
}

export async function versionAction(
  _versionId: number,
  action: "publish" | "reject" | "revoke" | "restore" | "acknowledge",
  _input: VersionActionInput = {},
): Promise<{ data: { version_id: number; status: ValuationStatus } }> {
  const map: Record<string, ValuationStatus> = {
    publish: "published",
    reject: "rejected",
    revoke: "revoked",
    restore: "published",
    acknowledge: "publishable",
  };
  return delay({ data: { version_id: _versionId, status: map[action] } });
}

/* ---------- reviews ---------- */

export async function reviewsList(): Promise<{ data: db.ReviewItem[]; meta: { total: number } }> {
  return delay({ data: db.reviewQueue, meta: { total: db.reviewQueue.length } });
}

export async function reviewDetail(versionId: number): Promise<{ data: { item: db.ReviewItem | null; findings: QualityFinding[]; diff: VersionDiffItem[] } }> {
  const item = db.reviewQueue.find((r) => r.id === versionId) ?? null;
  const findings = item
    ? [
        {
          rule_code: "asset_liability_balance",
          level: item.critical_count > 0 ? ("critical" as ValidationLevel) : ("warning" as ValidationLevel),
          actual_value: "50,012,000.00",
          expected_value: "50,000,000.00",
          difference: "12,000.00",
          source_location: "资产负债表!B45",
          message: "资产合计与负债+净资产的差异超出容忍范围。",
        },
      ]
    : [];
  return delay({
    data: {
      item,
      findings,
      diff: [
        { field: "基金资产净值", previous: "49,800,000.00", current: "50,012,000.00", change: "+0.42%" },
        { field: "单位净值", previous: "1.2450", current: "1.2530", change: "+0.64%" },
      ],
    },
  });
}

/* ---------- risk ---------- */

export async function riskEventsList(params: { fund_id?: number; rule_code?: string; severity?: string; status?: string; start?: string; end?: string; page?: number; page_size?: number } = {}): Promise<{ data: db.RiskEventRow[]; meta: PageMeta }> {
  let rows = [...db.riskEvents];
  if (params.fund_id) rows = rows.filter((r) => r.fund_id === params.fund_id);
  if (params.rule_code) rows = rows.filter((r) => r.rule_code === params.rule_code);
  if (params.severity) rows = rows.filter((r) => r.severity === params.severity);
  if (params.status) rows = rows.filter((r) => r.status === params.status);
  return delay(paginate(rows, params.page ?? 1, params.page_size ?? 10));
}

export async function riskRulesList(params: { rule_code?: string; enabled?: boolean; include_history?: boolean; page?: number; page_size?: number } = {}): Promise<{ data: db.RiskRuleRow[]; meta: PageMeta & { include_history: boolean } }> {
  let rows = [...db.riskRules];
  if (params.rule_code) rows = rows.filter((r) => r.rule_code === params.rule_code);
  if (params.enabled !== undefined) rows = rows.filter((r) => r.enabled === params.enabled);
  return delay({
    ...paginate(rows, params.page ?? 1, params.page_size ?? 10),
    meta: { ...paginate(rows, params.page ?? 1, params.page_size ?? 10).meta, include_history: params.include_history ?? false },
  });
}

export async function createRiskRule(input: Partial<db.RiskRuleRow>): Promise<{ data: db.RiskRuleRow }> {
  const row: db.RiskRuleRow = {
    id: Math.floor(Math.random() * 100000),
    rule_code: input.rule_code ?? "NEW-001",
    rule_type: input.rule_type ?? "daily_return",
    scope: input.scope ?? "all",
    threshold: input.threshold ?? "0",
    severity: input.severity ?? "warning",
    valid_from: input.valid_from ?? null,
    valid_to: input.valid_to ?? null,
    version: String(Number(input.version ?? "1") + 1),
    enabled: true,
  };
  db.riskRules.push(row);
  return delay({ data: row });
}

export async function handleRiskEvent(eventId: number, status: string, handling_note: string): Promise<{ data: { id: number; status: string } }> {
  const e = db.riskEvents.find((x) => x.id === eventId);
  if (e) {
    e.status = status as never;
    e.handling_note = handling_note;
    e.handled_at = new Date().toISOString();
    e.handled_by_user_id = 1;
  }
  return delay({ data: { id: eventId, status } });
}

/* ---------- mail ---------- */

export async function mailSettings(): Promise<{ data: db.MailSettings }> {
  return delay({ data: db.mailSettings });
}

export async function mailSyncRuns(): Promise<{ data: db.MailSyncRun[] }> {
  return delay({ data: db.mailSyncRuns });
}

export async function mailSync(): Promise<{ data: db.MailSyncRun }> {
  const run: db.MailSyncRun = {
    run_id: Math.random().toString(16).slice(2),
    status: "succeeded",
    created_at: new Date().toISOString(),
    summary: {
      messages_seen: 4,
      messages_imported: 3,
      messages_skipped: 1,
      attachments_seen: 5,
      attachments_imported: 4,
      duplicate_attachments: 1,
      ignored_attachments: 0,
      failed_attachments: 0,
      failed_messages: 0,
      batches_created: 2,
      error_count: 0,
      error_codes: [],
    },
  };
  db.mailSyncRuns.unshift(run);
  return delay({ data: run });
}

/* ---------- users ---------- */

export async function usersList(params: { q?: string; role?: string; status?: string; page?: number; page_size?: number } = {}): Promise<{ data: db.UserRow[]; meta: PageMeta }> {
  let rows = [...db.users];
  if (params.q) rows = rows.filter((u) => u.username.includes(params.q!));
  if (params.role) rows = rows.filter((u) => u.role === params.role);
  if (params.status) rows = rows.filter((u) => u.status === params.status);
  return delay(paginate(rows, params.page ?? 1, params.page_size ?? 20));
}

export async function userAction(userId: number, action: string, input: Record<string, unknown> = {}): Promise<{ data: { id: number; status: string } }> {
  const u = db.users.find((x) => x.id === userId);
  if (u) {
    if (action === "disable") u.status = "disabled";
    if (action === "enable") u.status = "active";
    if (action === "role") u.role = input.role as UserRole;
  }
  return delay({ data: { id: userId, status: u?.status ?? "active" } });
}

/* ---------- subjects ---------- */

export async function subjectMappingsList(params: { status?: string; category?: string; page?: number; page_size?: number } = {}): Promise<{ data: db.SubjectMappingRow[]; meta: PageMeta }> {
  let rows = [...db.subjectMappings];
  if (params.status) rows = rows.filter((r) => r.status === params.status);
  if (params.category) rows = rows.filter((r) => r.standard_category.includes(params.category!));
  return delay(paginate(rows, params.page ?? 1, params.page_size ?? 10));
}

export async function createSubjectMapping(input: Partial<db.SubjectMappingRow>): Promise<{ data: db.SubjectMappingRow }> {
  const row: db.SubjectMappingRow = {
    id: Math.floor(Math.random() * 100000),
    subject_code_or_prefix: input.subject_code_or_prefix ?? null,
    raw_name_pattern: input.raw_name_pattern ?? null,
    standard_category: input.standard_category ?? "",
    is_leaf: input.is_leaf ?? true,
    include_in_holdings: input.include_in_holdings ?? false,
    valid_from: input.valid_from ?? null,
    valid_to: input.valid_to ?? null,
    rule_version: "2026.01",
    status: "active",
  };
  db.subjectMappings.unshift(row);
  return delay({ data: row });
}

export async function disableSubjectMapping(mappingId: number): Promise<{ data: { id: number; status: string } }> {
  const m = db.subjectMappings.find((x) => x.id === mappingId);
  if (m) m.status = "inactive";
  return delay({ data: { id: mappingId, status: "inactive" } });
}

/* ---------- audit ---------- */

export async function auditLogsList(params: { actor_user_id?: number; action?: string; resource_type?: string; result?: string; start?: string; end?: string; page?: number; page_size?: number } = {}): Promise<{ data: db.AuditLogRow[]; meta: PageMeta }> {
  let rows = [...db.auditLogs];
  if (params.actor_user_id) rows = rows.filter((r) => r.actor_user_id === params.actor_user_id);
  if (params.action) rows = rows.filter((r) => r.action.includes(params.action!));
  if (params.resource_type) rows = rows.filter((r) => r.resource_type === params.resource_type);
  if (params.result) rows = rows.filter((r) => r.result === params.result);
  return delay(paginate(rows, params.page ?? 1, params.page_size ?? 20));
}

/* ---------- system settings ---------- */

export async function systemSettings(): Promise<{ data: Record<string, { value: number | string; source: string }>; meta: { runtime_note: string } }> {
  return delay({ data: db.systemSettings, meta: { runtime_note: db.RUNTIME_NOTE } });
}

export async function updateSystemSettings(patch: Record<string, number | string>): Promise<{ data: Record<string, { value: number | string; source: string }>; meta: { runtime_note: string } }> {
  for (const [k, v] of Object.entries(patch)) {
    if (db.systemSettings[k]) db.systemSettings[k] = { value: v, source: "database" };
  }
  return delay({ data: db.systemSettings, meta: { runtime_note: db.RUNTIME_NOTE } });
}

/* ---------- retention ---------- */

export async function retentionStatus(): Promise<{ data: db.RetentionStatus }> {
  return delay({ data: db.retentionStatus });
}

/* ---------- health ---------- */

export async function health(): Promise<{ data: { status: string; database: string; service: string } }> {
  return delay({ data: { status: "ok", database: "ok", service: "fund-dashboard" } });
}

/* ---------- poll helper for in-progress jobs ---------- */
export function jobStatus(batchId: number): { status: JobStatus; progress: number } {
  const b = db.importBatches.find((x) => x.id === batchId);
  const s = b?.job?.status ?? "pending";
  const progress = s === "succeeded" ? 100 : s === "running" ? Math.floor(Math.random() * 60) + 30 : 0;
  return { status: s, progress };
}
