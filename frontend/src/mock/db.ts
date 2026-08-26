/**
 * Mock seed database — mirrors the real backend contract.
 * Decimals as strings, enums as their string values, {data,meta} wrappers
 * are applied in api.ts. Field names match backend models exactly
 * (see Explore report: dashboard.py, catalog.py, valuation.py, etc.).
 */
import type {
  AuditResult,
  ImportBatchStatus,
  JobStatus,
  MappingStatus,
  QualityStatus,
  RiskEventStatus,
  RiskSeverity,
  SourceType,
  UserRole,
  UserStatus,
  ValuationStatus,
  ValidationLevel,
} from "@/utils/constants";

/* ---------- helpers ---------- */

let SEQ = 1000;
const id = () => ++SEQ;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function isoNow(): string {
  return new Date().toISOString();
}

/** Generate N trading days ending on a given date (skip weekends). */
function tradingDays(n: number, end = new Date("2026-08-22")): string[] {
  const out: string[] = [];
  let d = new Date(end);
  while (out.length < n) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) out.push(isoDate(d));
    d.setDate(d.getDate() - 1);
  }
  return out.reverse();
}

/** Round a number to 10 decimal places as a string (matches Numeric(x,10)). */
function d10(n: number): string {
  return n.toFixed(10);
}

/* ---------- users ---------- */

export interface UserRow {
  id: number;
  username: string;
  display_name: string;
  role: UserRole;
  status: UserStatus;
  last_login_at: string | null;
  failed_login_count: number;
  locked_until: string | null;
}

export const users: UserRow[] = [
  {
    id: 1,
    username: "admin",
    display_name: "系统管理员",
    role: "admin",
    status: "active",
    last_login_at: isoNow(),
    failed_login_count: 0,
    locked_until: null,
  },
  {
    id: 2,
    username: "operator",
    display_name: "张业务",
    role: "operator",
    status: "active",
    last_login_at: isoNow(),
    failed_login_count: 0,
    locked_until: null,
  },
  {
    id: 3,
    username: "viewer",
    display_name: "王看板",
    role: "viewer",
    status: "active",
    last_login_at: isoNow(),
    failed_login_count: 0,
    locked_until: null,
  },
];

/* ---------- funds ---------- */

export interface AliasRow {
  id: number;
  alias: string;
  source_location: string | null;
  match_priority: number;
  valid_from: string | null;
  valid_to: string | null;
}

export interface ShareClassRow {
  id: number;
  fund_id: number;
  share_code: string;
  share_name: string;
  enabled_from: string | null;
  disabled_from: string | null;
  status: "active" | "inactive";
  notes: string | null;
}

export interface FundRow {
  id: number;
  name: string;
  product_code: string | null;
  status: "active" | "inactive";
  strategy: string | null;
  manager: string | null;
  establishment_date: string | null;
  notes: string | null;
  aliases: AliasRow[];
  share_classes: ShareClassRow[];
  current_version_id: number | null;
  valuation_date: string | null;
  unit_nav: string | null;
  daily_return: string | null;
  quality_status: QualityStatus;
}

const STRAT_LIST = ["股票多头", "量化中性", "CTA趋势", "固收+", "宏观对冲", "事件驱动"];
export const strategyOptions = STRAT_LIST;

/* ---------- internal maps (declared early to avoid TDZ in makeFund) ---------- */

const _fundVersions = new Map<number, VersionRow[]>();
const _navSeries = new Map<number, NavPoint[]>();
const _drawdown = new Map<number, DrawdownPoint[]>();
const _positions = new Map<number, PositionRow[]>();
const _allocations = new Map<number, AllocationItem[]>();
const _snapshots = new Map<number, FundSnapshot>();
const _shareClassSnapshots = new Map<number, ShareClassSnapshot[]>();
const _validations = new Map<number, ValidationFinding[]>();

export const fundVersions = _fundVersions;
export const navSeries = _navSeries;
export const drawdown = _drawdown;
export const positions = _positions;
export const allocations = _allocations;
export const snapshots = _snapshots;
export const shareClassSnapshots = _shareClassSnapshots;
export const validations = _validations;

function makeFund(
  i: number,
  name: string,
  strategy: string,
  manager: string,
  baseNav: number,
): FundRow {
  const fundId = i;
  const days = tradingDays(60);
  // simulate a nav walk
  let nav = baseNav;
  let cumNav = baseNav;
  const series: { date: string; unit_nav: string; cum_nav: string; daily: string }[] = [];
  for (let k = 0; k < days.length; k++) {
    const drift = (Math.sin(k / 4 + i) + (Math.random() - 0.5)) * 0.006;
    nav = k === 0 ? baseNav : nav * (1 + drift);
    cumNav = k === 0 ? baseNav : cumNav * (1 + drift);
    series.push({
      date: days[k],
      unit_nav: d10(nav),
      cum_nav: d10(cumNav),
      daily: k === 0 ? "0" : d10(drift),
    });
  }
  const last = series[series.length - 1];
  const versions: VersionRow[] = [];

  // published version for the latest date
  const v1: VersionRow = {
    id: id(),
    fund_id: fundId,
    valuation_date: last.date,
    version_no: 1,
    status: "published",
    published_at: isoNow(),
    published_by: 1,
    reason: "首次发布",
    parser_rule_version: "2026.01",
    source_file_id: id(),
  };
  versions.push(v1);

  // a pending_review version for one fund to show review queue
  if (i <= 2) {
    const vd = days[days.length - 2];
    versions.push({
      id: id(),
      fund_id: fundId,
      valuation_date: vd,
      version_no: 2,
      status: "pending_review",
      published_at: null,
      published_by: null,
      reason: null,
      parser_rule_version: "2026.01",
      source_file_id: id(),
    });
  }

  _fundVersions.set(fundId, versions);
  _navSeries.set(fundId, series);
  // drawdown from cumulative nav
  let peak = 0;
  const dd: { date: string; value: string; peak_value: string; drawdown: string }[] = [];
  for (const p of series) {
    const cv = Number(p.cum_nav);
    peak = Math.max(peak, cv);
    const draw = cv / peak - 1;
    dd.push({
      date: p.date,
      value: d10(cv),
      peak_value: d10(peak),
      drawdown: d10(draw),
    });
  }
  _drawdown.set(fundId, dd);

  // validation findings
  const findings: ValidationFinding[] = [];
  if (i === 3) {
    findings.push({
      id: id(),
      version_id: v1.id,
      rule_code: "asset_liability_balance",
      level: "warning",
      actual_value: d10(50000000),
      expected_value: d10(50012000),
      difference: d10(-12000),
      source_location: "资产负债表!B45",
      message: "资产合计与负债+净资产的差异为 12,000.00 元，超出容忍 5,000 元。",
    });
  }
  if (i === 5) {
    findings.push({
      id: id(),
      version_id: v1.id,
      rule_code: "daily_return_reconciliation",
      level: "info",
      actual_value: d10(0.0081),
      expected_value: d10(0.0082),
      difference: d10(-0.0001),
      source_location: "净值表!D12",
      message: "日收益计算与今昨净值有 0.01% 差异，在容忍范围内。",
    });
  }
  _validations.set(v1.id, findings);

  // share classes
  const scs: ShareClassRow[] = [
    {
      id: id(),
      fund_id: fundId,
      share_code: "A",
      share_name: `${name}-A类`,
      enabled_from: days[0],
      disabled_from: null,
      status: "active",
      notes: null,
    },
  ];
  if (i % 2 === 0) {
    scs.push({
      id: id(),
      fund_id: fundId,
      share_code: "B",
      share_name: `${name}-B类`,
      enabled_from: days[10],
      disabled_from: null,
      status: "active",
      notes: null,
    });
  }

  // share class snapshots (fabricated from real model columns)
  const scSnap: ShareClassSnapshot[] = scs.map((sc, si) => ({
    version_id: v1.id,
    share_class_id: sc.id,
    share_code: sc.share_code,
    share_name: sc.share_name,
    valuation_date: last.date,
    net_assets: d10(Number(last.unit_nav) * (50000000 + si * 20000000)),
    paid_in_capital: d10(50000000 + si * 20000000),
    unit_nav: last.unit_nav,
    cumulative_unit_nav: last.cum_nav,
    previous_unit_nav: series[series.length - 2].unit_nav,
    daily_return: last.daily,
    ytd_return: d10(0.12 + si * 0.01),
    mtd_return: d10(0.02 + si * 0.005),
  }));
  _shareClassSnapshots.set(fundId, scSnap);

  // allocation (from AccountSubjectDaily columns)
  const alloc: AllocationItem[] = [
    { category: "股票投资", market_value: d10(35000000), weight: d10(0.7) },
    { category: "债券投资", market_value: d10(10000000), weight: d10(0.2) },
    { category: "现金及等价物", market_value: d10(3000000), weight: d10(0.06) },
    { category: "其他资产", market_value: d10(2000000), weight: d10(0.04) },
  ];
  _allocations.set(fundId, alloc);

  // positions (from PositionDaily columns)
  const positions: PositionRow[] = [];
  const stocks = [
    ["600519", "贵州茅台", "上交所", "证券账户A"],
    ["000858", "五粮液", "深交所", "证券账户A"],
    ["300750", "宁德时代", "深交所", "证券账户B"],
    ["601318", "中国平安", "上交所", "证券账户A"],
    ["600036", "招商银行", "上交所", "证券账户B"],
    ["000333", "美的集团", "深交所", "证券账户A"],
  ];
  for (let s = 0; s < stocks.length; s++) {
    const qty = 50000 + s * 30000 + i * 1000;
    const price = 80 + s * 30 + i * 5;
    positions.push({
      version_id: v1.id,
      security_code: stocks[s][0],
      security_name: stocks[s][1],
      market: stocks[s][2],
      account: stocks[s][3],
      quantity: d10(qty),
      unit_cost: d10(price * 0.95),
      cost: d10(qty * price * 0.95),
      market_price: d10(price),
      market_value: d10(qty * price),
      nav_weight: d10((qty * price) / 50000000),
      valuation_gain: d10(qty * price * 0.05),
      suspension_info: s === 3 && i === 4 ? "停牌" : null,
    });
  }
  _positions.set(fundId, positions);

  // daily snapshot (from FundDailySnapshot columns) for the latest date
  _snapshots.set(fundId, {
    version_id: v1.id,
    valuation_date: last.date,
    total_assets: d10(52000000),
    total_liabilities: d10(2000000),
    net_assets: d10(50000000),
    unit_nav: last.unit_nav,
    cumulative_unit_nav: last.cum_nav,
    previous_unit_nav: series[series.length - 2].unit_nav,
    daily_return: last.daily,
    available_position: d10(3000000),
    cash_ratio: d10(0.0577),
    leverage_ratio: d10(1.04),
  });

  return {
    id: fundId,
    name,
    product_code: `PF${String(1000 + i).padStart(4, "0")}`,
    status: i === 6 ? "inactive" : "active",
    strategy,
    manager,
    establishment_date: "2024-01-15",
    notes: null,
    aliases: [
      {
        id: id(),
        alias: name,
        source_location: "文件名",
        match_priority: 1,
        valid_from: null,
        valid_to: null,
      },
      {
        id: id(),
        alias: `${name}净值表`,
        source_location: "工作表名",
        match_priority: 2,
        valid_from: null,
        valid_to: null,
      },
    ],
    share_classes: scs,
    current_version_id: v1.id,
    valuation_date: last.date,
    unit_nav: last.unit_nav,
    daily_return: last.daily,
    quality_status: findings.some((f) => f.level === "warning") ? "warning" : "valid",
  };
}

export const funds: FundRow[] = [
  makeFund(1, "明远一号", "股票多头", "李明远", 1.25),
  makeFund(2, "星河量化", "量化中性", "陈星河", 1.08),
  makeFund(3, "稳泰固收", "固收+", "王稳泰", 1.03),
  makeFund(4, "锐进CTA", "CTA趋势", "赵锐进", 1.15),
  makeFund(5, "致远宏观", "宏观对冲", "周致远", 1.12),
  makeFund(6, "磐石事件", "事件驱动", "吴磐石", 1.06),
  makeFund(7, "海蓝成长", "股票多头", "孙海蓝", 1.31),
  makeFund(8, "云帆价值", "股票多头", "林云帆", 1.18),
];

/* ---------- version / nav / drawdown / positions etc. ---------- */

export interface VersionRow {
  id: number;
  fund_id: number;
  valuation_date: string;
  version_no: number;
  status: ValuationStatus;
  published_at: string | null;
  published_by: number | null;
  reason: string | null;
  parser_rule_version: string;
  source_file_id: number;
}

export interface ValidationFinding {
  id: number;
  version_id: number;
  rule_code: string;
  level: ValidationLevel;
  actual_value: string | null;
  expected_value: string | null;
  difference: string | null;
  source_location: string | null;
  message: string;
}

export interface NavPoint {
  date: string;
  unit_nav: string;
  cum_nav: string;
  daily: string;
}

export interface DrawdownPoint {
  date: string;
  value: string;
  peak_value: string;
  drawdown: string;
}

export interface PositionRow {
  version_id: number;
  security_code: string;
  security_name: string;
  market: string | null;
  account: string | null;
  quantity: string | null;
  unit_cost: string | null;
  cost: string | null;
  market_price: string | null;
  market_value: string | null;
  nav_weight: string | null;
  valuation_gain: string | null;
  suspension_info: string | null;
}

export interface AllocationItem {
  category: string;
  market_value: string;
  weight: string;
}

export interface FundSnapshot {
  version_id: number;
  valuation_date: string;
  total_assets: string;
  total_liabilities: string;
  net_assets: string;
  unit_nav: string;
  cumulative_unit_nav: string;
  previous_unit_nav: string;
  daily_return: string;
  available_position: string;
  cash_ratio: string;
  leverage_ratio: string;
}

export interface ShareClassSnapshot {
  version_id: number;
  share_class_id: number;
  share_code: string;
  share_name: string;
  valuation_date: string;
  net_assets: string;
  paid_in_capital: string;
  unit_nav: string;
  cumulative_unit_nav: string;
  previous_unit_nav: string;
  daily_return: string;
  ytd_return: string;
  mtd_return: string;
}

/* ---------- company composite index (CompanyMetricDaily) ---------- */

export interface CompanyMetricPoint {
  date: string;
  index_value: string;
  daily_return: string | null;
  fund_count: number;
}

let _companyIndex: CompanyMetricPoint[] = [];
{
  const days = tradingDays(60);
  let idx = 1.0;
  _companyIndex = days.map((d, k) => {
    const ret = k === 0 ? 0 : (Math.sin(k / 3) + (Math.random() - 0.5)) * 0.004;
    idx = k === 0 ? 1.0 : idx * (1 + ret);
    return {
      date: d,
      index_value: d10(idx),
      daily_return: k === 0 ? null : d10(ret),
      fund_count: 8 - (k < 10 ? k % 2 : 0),
    };
  });
}
export const companyIndex = _companyIndex;

/* ---------- import batches & files ---------- */

export interface SourceFileRow {
  id: number;
  original_filename: string;
  file_hash: string;
  file_size: number;
  duplicate: boolean;
}

export interface ImportBatchRow {
  id: number;
  source_type: SourceType;
  file_count: number;
  status: ImportBatchStatus;
  created_at: string;
  files: SourceFileRow[];
  job: JobRow | null;
  // extra demo fields derived from version status for the import detail
  versions?: { id: number; fund_id: number; fund_name: string; valuation_date: string; version_no: number; status: ValuationStatus }[];
}

export interface JobRow {
  id: number;
  type: string;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  locked_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  error_code: string | null;
  next_retry_at: string | null;
  can_retry: boolean;
}

function hashStr(_s: string): string {
  let h = "";
  for (let i = 0; i < 64; i++) {
    h += ((Math.random() * 16) | 0).toString(16);
  }
  return h;
}

const VAL_STATUS_POOL: ValuationStatus[] = [
  "published",
  "published",
  "publishable",
  "pending_review",
  "failed",
  "duplicate",
  "non_valuation",
  "superseded",
  "revoked",
  "validating",
];

export const importBatches: ImportBatchRow[] = [];
{
  const statuses: ImportBatchStatus[] = ["completed", "completed", "processing", "failed", "completed"];
  const sources: SourceType[] = ["upload", "email", "upload", "migration", "email"];
  for (let i = 0; i < 12; i++) {
    const bid = id();
    const fc = 1 + (i % 3);
    const files: SourceFileRow[] = [];
    for (let f = 0; f < fc; f++) {
      files.push({
        id: id(),
        original_filename: `${funds[i % funds.length].name}_估值表_2026-08-${String(20 - f).padStart(2, "0")}.xlsx`,
        file_hash: hashStr(""),
        file_size: 45000 + f * 8000,
        duplicate: f === 1 && i % 4 === 0,
      });
    }
    const st = statuses[i % statuses.length];
    const jobId = id();
    const job: JobRow = {
      id: jobId,
      type: "process_import_batch",
      status:
        st === "completed" ? "succeeded" : st === "failed" ? "failed" : "running",
      attempts: st === "failed" ? 3 : 1,
      max_attempts: 3,
      locked_at: st === "processing" ? isoNow() : null,
      started_at: st === "completed" || st === "processing" ? isoNow() : null,
      finished_at: st === "completed" ? isoNow() : null,
      error_code: st === "failed" ? "PARSE_HEADER_NOT_FOUND" : null,
      next_retry_at: null,
      can_retry: st === "failed",
    };
    const versions =
      st === "completed" || st === "processing"
        ? files.slice(0, fc).map((_, vi) => ({
            id: id(),
            fund_id: funds[i % funds.length].id,
            fund_name: funds[i % funds.length].name,
            valuation_date: `2026-08-${String(20 - vi).padStart(2, "0")}`,
            version_no: vi + 1,
            status: VAL_STATUS_POOL[(i + vi) % VAL_STATUS_POOL.length],
          }))
        : [];
    importBatches.push({
      id: bid,
      source_type: sources[i % sources.length],
      file_count: fc,
      status: st,
      created_at: new Date(Date.now() - i * 3600_000).toISOString(),
      files,
      job,
      versions,
    });
  }
}

/* ---------- review queue (pending_review versions) ---------- */

export interface ReviewItem {
  id: number;
  fund_id: number;
  fund_name: string;
  valuation_date: string;
  version_no: number;
  critical_count: number;
  warning_count: number;
}

export const reviewQueue: ReviewItem[] = [];
{
  for (const versions of fundVersions.values()) {
    for (const v of versions) {
      if (v.status === "pending_review") {
        const fund = funds.find((f) => f.id === v.fund_id)!;
        const findings = validations.get(v.id) ?? [];
        reviewQueue.push({
          id: v.id,
          fund_id: v.fund_id,
          fund_name: fund.name,
          valuation_date: v.valuation_date,
          version_no: v.version_no,
          critical_count: findings.filter((f) => f.level === "critical").length,
          warning_count: findings.filter((f) => f.level === "warning").length,
        });
      }
    }
  }
  // Add a couple extra review items for richer demo
  reviewQueue.push({
    id: id(),
    fund_id: 3,
    fund_name: "稳泰固收",
    valuation_date: "2026-08-19",
    version_no: 1,
    critical_count: 0,
    warning_count: 1,
  });
  reviewQueue.push({
    id: id(),
    fund_id: 6,
    fund_name: "磐石事件",
    valuation_date: "2026-08-19",
    version_no: 2,
    critical_count: 1,
    warning_count: 0,
  });
}

/* ---------- risk rules & events ---------- */

export interface RiskRuleRow {
  id: number;
  rule_code: string;
  rule_type: string;
  scope: string;
  threshold: string | null;
  severity: RiskSeverity;
  valid_from: string | null;
  valid_to: string | null;
  version: string;
  enabled: boolean;
}

export interface RiskEventRow {
  id: number;
  risk_rule_id: number;
  rule_code: string | null;
  fund_id: number | null;
  fund_name: string | null;
  valuation_date: string;
  severity: RiskSeverity;
  status: RiskEventStatus;
  first_triggered_at: string;
  last_triggered_at: string;
  handling_note: string | null;
  handled_by_user_id: number | null;
  handled_at: string | null;
  evidence_reference: string | null;
}

export const riskRules: RiskRuleRow[] = [
  {
    id: id(),
    rule_code: "DR-001",
    rule_type: "daily_return",
    scope: "all",
    threshold: d10(-0.03),
    severity: "warning",
    valid_from: "2024-01-01",
    valid_to: null,
    version: "1",
    enabled: true,
  },
  {
    id: id(),
    rule_code: "MD-001",
    rule_type: "max_drawdown",
    scope: "all",
    threshold: d10(-0.1),
    severity: "critical",
    valid_from: "2024-01-01",
    valid_to: null,
    version: "1",
    enabled: true,
  },
  {
    id: id(),
    rule_code: "CD-001",
    rule_type: "current_drawdown",
    scope: "all",
    threshold: d10(-0.05),
    severity: "warning",
    valid_from: "2024-01-01",
    valid_to: null,
    version: "1",
    enabled: true,
  },
  {
    id: id(),
    rule_code: "SP-001",
    rule_type: "single_position_weight",
    scope: "all",
    threshold: d10(0.1),
    severity: "warning",
    valid_from: "2024-01-01",
    valid_to: null,
    version: "2",
    enabled: true,
  },
  {
    id: id(),
    rule_code: "TF-001",
    rule_type: "top_five_weight",
    scope: "all",
    threshold: d10(0.4),
    severity: "info",
    valid_from: "2024-06-01",
    valid_to: null,
    version: "1",
    enabled: false,
  },
  {
    id: id(),
    rule_code: "CC-001",
    rule_type: "concentration",
    scope: "all",
    threshold: d10(0.3),
    severity: "warning",
    valid_from: "2024-01-01",
    valid_to: null,
    version: "1",
    enabled: true,
  },
];

export const riskEvents: RiskEventRow[] = [
  {
    id: id(),
    risk_rule_id: riskRules[0].id,
    rule_code: "DR-001",
    fund_id: 4,
    fund_name: "锐进CTA",
    valuation_date: "2026-08-20",
    severity: "warning",
    status: "open",
    first_triggered_at: isoNow(),
    last_triggered_at: isoNow(),
    handling_note: null,
    handled_by_user_id: null,
    handled_at: null,
    evidence_reference: null,
  },
  {
    id: id(),
    risk_rule_id: riskRules[1].id,
    rule_code: "MD-001",
    fund_id: 6,
    fund_name: "磐石事件",
    valuation_date: "2026-08-21",
    severity: "critical",
    status: "acknowledged",
    first_triggered_at: isoNow(),
    last_triggered_at: isoNow(),
    handling_note: "已与基金经理确认，为单次事件。",
    handled_by_user_id: 1,
    handled_at: isoNow(),
    evidence_reference: "会议纪要-20260821",
  },
  {
    id: id(),
    risk_rule_id: riskRules[3].id,
    rule_code: "SP-001",
    fund_id: 1,
    fund_name: "明远一号",
    valuation_date: "2026-08-22",
    severity: "warning",
    status: "open",
    first_triggered_at: isoNow(),
    last_triggered_at: isoNow(),
    handling_note: null,
    handled_by_user_id: null,
    handled_at: null,
    evidence_reference: null,
  },
  {
    id: id(),
    risk_rule_id: riskRules[5].id,
    rule_code: "CC-001",
    fund_id: 3,
    fund_name: "稳泰固收",
    valuation_date: "2026-08-18",
    severity: "info",
    status: "resolved",
    first_triggered_at: isoNow(),
    last_triggered_at: isoNow(),
    handling_note: "已调整持仓，集中度恢复正常。",
    handled_by_user_id: 2,
    handled_at: isoNow(),
    evidence_reference: null,
  },
];

/* ---------- mail ---------- */

export interface MailSettings {
  configured: boolean;
  host: string;
  port: number;
  username: string;
}

export interface MailSyncRun {
  run_id: string;
  status: "succeeded" | "failed";
  created_at: string;
  summary: {
    messages_seen: number;
    messages_imported: number;
    messages_skipped: number;
    attachments_seen: number;
    attachments_imported: number;
    duplicate_attachments: number;
    ignored_attachments: number;
    failed_attachments: number;
    failed_messages: number;
    batches_created: number;
    error_count: number;
    error_codes: string[];
  };
}

export const mailSettings: MailSettings = {
  configured: true,
  host: "imap.qq.com",
  port: 993,
  username: "valuation@company.com.cn",
};

export const mailSyncRuns: MailSyncRun[] = [
  {
    run_id: "a1b2c3d4e5f6",
    status: "succeeded",
    created_at: new Date(Date.now() - 3600_000).toISOString(),
    summary: {
      messages_seen: 5,
      messages_imported: 5,
      messages_skipped: 0,
      attachments_seen: 7,
      attachments_imported: 6,
      duplicate_attachments: 1,
      ignored_attachments: 0,
      failed_attachments: 0,
      failed_messages: 0,
      batches_created: 3,
      error_count: 0,
      error_codes: [],
    },
  },
  {
    run_id: "b2c3d4e5f6a7",
    status: "succeeded",
    created_at: new Date(Date.now() - 7200_000).toISOString(),
    summary: {
      messages_seen: 3,
      messages_imported: 2,
      messages_skipped: 1,
      attachments_seen: 4,
      attachments_imported: 2,
      duplicate_attachments: 1,
      ignored_attachments: 1,
      failed_attachments: 0,
      failed_messages: 0,
      batches_created: 1,
      error_count: 0,
      error_codes: [],
    },
  },
  {
    run_id: "c3d4e5f6a7b8",
    status: "failed",
    created_at: new Date(Date.now() - 86400_000).toISOString(),
    summary: {
      messages_seen: 0,
      messages_imported: 0,
      messages_skipped: 0,
      attachments_seen: 0,
      attachments_imported: 0,
      duplicate_attachments: 0,
      ignored_attachments: 0,
      failed_attachments: 0,
      failed_messages: 1,
      batches_created: 0,
      error_count: 1,
      error_codes: ["MAIL_AUTH_FAILED"],
    },
  },
];

/* ---------- subject mappings ---------- */

export interface SubjectMappingRow {
  id: number;
  subject_code_or_prefix: string | null;
  raw_name_pattern: string | null;
  standard_category: string;
  is_leaf: boolean;
  include_in_holdings: boolean;
  valid_from: string | null;
  valid_to: string | null;
  rule_version: string;
  status: MappingStatus;
}

export const subjectMappings: SubjectMappingRow[] = [
  {
    id: id(),
    subject_code_or_prefix: "1101",
    raw_name_pattern: null,
    standard_category: "股票投资",
    is_leaf: false,
    include_in_holdings: false,
    valid_from: "2024-01-01",
    valid_to: null,
    rule_version: "2026.01",
    status: "active",
  },
  {
    id: id(),
    subject_code_or_prefix: "110101",
    raw_name_pattern: null,
    standard_category: "股票投资-沪深A股",
    is_leaf: true,
    include_in_holdings: true,
    valid_from: "2024-01-01",
    valid_to: null,
    rule_version: "2026.01",
    status: "active",
  },
  {
    id: id(),
    subject_code_or_prefix: null,
    raw_name_pattern: "债券",
    standard_category: "债券投资",
    is_leaf: false,
    include_in_holdings: false,
    valid_from: "2024-01-01",
    valid_to: null,
    rule_version: "2026.01",
    status: "active",
  },
  {
    id: id(),
    subject_code_or_prefix: "1002",
    raw_name_pattern: null,
    standard_category: "现金及等价物",
    is_leaf: true,
    include_in_holdings: true,
    valid_from: "2024-01-01",
    valid_to: null,
    rule_version: "2026.01",
    status: "active",
  },
  {
    id: id(),
    subject_code_or_prefix: "3001",
    raw_name_pattern: null,
    standard_category: "应付账款",
    is_leaf: true,
    include_in_holdings: false,
    valid_from: "2024-01-01",
    valid_to: "2026-06-30",
    rule_version: "2026.00",
    status: "inactive",
  },
];

/* ---------- audit logs ---------- */

export interface AuditLogRow {
  id: number;
  actor_user_id: number | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  summary: Record<string, unknown> | null;
  reason: string | null;
  result: AuditResult;
  created_at: string;
}

export const auditLogs: AuditLogRow[] = [
  {
    id: id(),
    actor_user_id: 1,
    action: "valuation.published",
    resource_type: "valuation_version",
    resource_id: "1001",
    summary: { fund_id: 1, valuation_date: "2026-08-22", version_no: 1 },
    reason: "首次发布",
    result: "success",
    created_at: isoNow(),
  },
  {
    id: id(),
    actor_user_id: 2,
    action: "import.upload",
    resource_type: "import_batch",
    resource_id: "1010",
    summary: { file_count: 2, source_type: "upload" },
    reason: null,
    result: "success",
    created_at: new Date(Date.now() - 3600_000).toISOString(),
  },
  {
    id: id(),
    actor_user_id: 1,
    action: "fund.disable",
    resource_type: "fund",
    resource_id: "6",
    summary: { fund_id: 6, name: "磐石事件" },
    reason: "产品清盘，停止接收估值表。",
    result: "success",
    created_at: new Date(Date.now() - 7200_000).toISOString(),
  },
  {
    id: id(),
    actor_user_id: 2,
    action: "valuation.revoked",
    resource_type: "valuation_version",
    resource_id: "998",
    summary: { fund_id: 3, valuation_date: "2026-08-15" },
    reason: "发现原始文件错误，撤回后重新导入。",
    result: "success",
    created_at: new Date(Date.now() - 10800_000).toISOString(),
  },
  {
    id: id(),
    actor_user_id: 1,
    action: "system.settings_updated",
    resource_type: "system_settings",
    resource_id: null,
    summary: { keys: ["task_concurrency"], old: 1, new: 4 },
    reason: "高峰期提升处理吞吐。",
    result: "success",
    created_at: new Date(Date.now() - 86400_000).toISOString(),
  },
  {
    id: id(),
    actor_user_id: null,
    action: "mail.sync_failed",
    resource_type: "mail_sync",
    resource_id: "c3d4e5f6a7b8",
    summary: { error_code: "MAIL_AUTH_FAILED" },
    reason: null,
    result: "failure",
    created_at: new Date(Date.now() - 86400_000).toISOString(),
  },
  {
    id: id(),
    actor_user_id: 2,
    action: "risk_rule.version_created",
    resource_type: "risk_rule",
    resource_id: "1006",
    summary: { rule_code: "SP-001", new_version: "2", threshold: 0.1 },
    reason: "单票权重阈值从 15% 下调到 10%。",
    result: "success",
    created_at: new Date(Date.now() - 172800_000).toISOString(),
  },
];

/* ---------- system settings ---------- */

export interface SettingEntry {
  value: number | string;
  source: "environment" | "default" | "database";
}

export const systemSettings: Record<string, SettingEntry> = {
  source_retention_days: { value: 365, source: "environment" },
  task_concurrency: { value: 4, source: "database" },
  data_lateness_days: { value: 1, source: "environment" },
  mail_sync_interval_minutes: { value: 15, source: "environment" },
  backup_retention_days: { value: 30, source: "default" },
  timezone: { value: "Asia/Shanghai", source: "default" },
};

export const RUNTIME_NOTE =
  "数据库配置不会热更新；任务进程和清理服务在当前进程仍读取环境配置。";

/* ---------- retention / backup status ---------- */

export interface RetentionStatus {
  total_files: number;
  expiring_soon: number;
  last_cleanup_at: string | null;
  last_backup_at: string | null;
  last_backup_result: "success" | "failure" | null;
}

export const retentionStatus: RetentionStatus = {
  total_files: 1240,
  expiring_soon: 35,
  last_cleanup_at: new Date(Date.now() - 86400_000).toISOString(),
  last_backup_at: new Date(Date.now() - 43200_000).toISOString(),
  last_backup_result: "success",
};
