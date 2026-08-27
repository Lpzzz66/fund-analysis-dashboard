/** Enum-like string constants mirroring the backend StrEnum values. */

export type UserRole = "admin" | "operator" | "viewer";
export type UserStatus = "active" | "disabled";

export type FundStatus = "active" | "inactive";
export type QualityStatus = "valid" | "partial" | "warning" | "stale" | "pending";
export type ValidationLevel = "critical" | "warning" | "info";

/** Valuation version status — the full state machine. */
export type ValuationStatus =
  | "received"
  | "parsing"
  | "validating"
  | "publishable"
  | "pending_review"
  | "published"
  | "superseded"
  | "rejected"
  | "failed"
  | "duplicate"
  | "non_valuation"
  | "revoked";

export type SourceType = "upload" | "email" | "migration" | "other";
export type ImportBatchStatus =
  | "created"
  | "queued"
  | "processing"
  | "completed"
  | "failed";
export type JobStatus =
  | "pending"
  | "running"
  | "retry_due"
  | "succeeded"
  | "failed";

export type RiskSeverity = "info" | "warning" | "critical";
export type RiskEventStatus = "open" | "acknowledged" | "resolved" | "ignored";
export type MappingStatus = "active" | "inactive";
export type AuditResult = "success" | "failure";

/** Supported risk rule types (from backend risk.py SUPPORTED_RULE_TYPES). */
export const RISK_RULE_TYPES = [
  "daily_return",
  "max_drawdown",
  "current_drawdown",
  "single_position_weight",
  "top_five_weight",
  "concentration",
] as const;

/** Validation rule codes (from backend validation/rules.py). */
export const VALIDATION_RULE_CODES = [
  "asset_liability_balance",
  "share_net_asset_total",
  "daily_return_reconciliation",
  "position_market_value_reconciliation",
  "valuation_product_identity",
  "valuation_date_identity",
  "parser_warning",
] as const;

/** Chinese labels for status enums, matching docs 02 §6. */
export const VALUATION_STATUS_LABEL: Record<ValuationStatus, string> = {
  received: "接收中",
  parsing: "解析中",
  validating: "校验中",
  publishable: "可发布",
  pending_review: "待复核",
  published: "已发布",
  superseded: "已替代",
  rejected: "已驳回",
  failed: "失败",
  duplicate: "重复",
  non_valuation: "非估值表",
  revoked: "已作废",
};

export const QUALITY_STATUS_LABEL: Record<QualityStatus, string> = {
  valid: "有效",
  partial: "部分覆盖",
  warning: "警告",
  stale: "过期",
  pending: "处理中",
};

export const VALIDATION_LEVEL_LABEL: Record<ValidationLevel, string> = {
  critical: "阻断级",
  warning: "警告级",
  info: "提示级",
};

export const RISK_SEVERITY_LABEL: Record<RiskSeverity, string> = {
  info: "提示",
  warning: "警告",
  critical: "阻断",
};

export const RISK_EVENT_STATUS_LABEL: Record<RiskEventStatus, string> = {
  open: "待处理",
  acknowledged: "已确认",
  resolved: "已解决",
  ignored: "已忽略",
};

export const ROLE_LABEL: Record<UserRole, string> = {
  admin: "系统管理员",
  operator: "业务员",
  viewer: "普通看板",
};

export const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  upload: "手工上传",
  email: "邮件附件",
  migration: "历史迁移",
  other: "其他",
};

export const IMPORT_BATCH_STATUS_LABEL: Record<ImportBatchStatus, string> = {
  created: "已创建",
  queued: "已排队",
  processing: "处理中",
  completed: "已完成",
  failed: "失败",
};

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  pending: "等待中",
  running: "运行中",
  retry_due: "待重试",
  succeeded: "成功",
  failed: "失败",
};

export const MAPPING_STATUS_LABEL: Record<MappingStatus, string> = {
  active: "启用",
  inactive: "停用",
};

export const USER_STATUS_LABEL: Record<UserStatus, string> = {
  active: "正常",
  disabled: "已禁用",
};

export const AUDIT_RESULT_LABEL: Record<AuditResult, string> = {
  success: "成功",
  failure: "失败",
};

/** Date ranges for charts (dashboard / nav series). */
export const RANGE_OPTIONS = [
  { value: "1m", label: "近一月" },
  { value: "3m", label: "近三月" },
  { value: "ytd", label: "本年" },
  { value: "1y", label: "近一年" },
  { value: "inception", label: "成立以来" },
] as const;

export type RangeKey = (typeof RANGE_OPTIONS)[number]["value"];

/** System setting whitelist with bounds (from system/settings.py). */
export const SETTING_DEFINITIONS = {
  source_retention_days: { label: "原始文件保留天数", min: 1, max: 3650 },
  backup_retention_days: { label: "备份保留天数", min: 1, max: 3650 },
  timezone: { label: "时区" },
} as const;

export type SettingKey = keyof typeof SETTING_DEFINITIONS;
