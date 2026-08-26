import type { UserRole, UserStatus } from "@/utils/constants";

export interface ApiEnvelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export interface AuthStatus {
  initialized: boolean;
}

export interface UserSession {
  id: number;
  username: string;
  display_name: string;
  role: UserRole;
  status: UserStatus;
  last_login_at: string | null;
  navigation: string[];
}

export interface LoginInput {
  username: string;
  password: string;
}

export interface InitializeInput extends LoginInput {
  display_name?: string;
}

export interface ChangePasswordInput {
  old_password: string;
  new_password: string;
}

export interface DashboardFund { id: number; name: string; valuation_date: string; unit_nav: string | null; daily_return: string | null; analysis_status: string; analysis_run_id: number | null; }
export interface DashboardOverview { as_of: string | null; total_net_assets: string | null; fund_count: number; company_index: string | null; company_daily_return: string | null; risk_event_count: number; quality_status: import("@/utils/constants").QualityStatus; funds: DashboardFund[]; }
export interface DashboardOverviewResponse { data: DashboardOverview; meta: { as_of: string | null; coverage: { available: number; total: number }; analysis_status: string; analysis_run_id: number | null }; }
export interface FundListItem { id: number; name: string; product_code: string | null; status: import("@/utils/constants").FundStatus; current_version_id: number | null; valuation_date: string | null; unit_nav: string | null; daily_return: string | null; quality_status: import("@/utils/constants").QualityStatus; analysis_status: string; analysis_run_id: number | null; }
export interface FundDetail { id: number; name: string; product_code: string | null; strategy: string | null; manager: string | null; establishment_date: string | null; notes: string | null; aliases: unknown[]; share_classes: unknown[]; status: import("@/utils/constants").FundStatus; current_version_id: number | null; valuation_date: string | null; quality_status: import("@/utils/constants").QualityStatus; analysis_status: string; analysis_run_id: number | null; }
export interface NavPoint { valuation_date: string; unit_nav: string | null; cumulative_unit_nav: string | null; cumulative_payout: string | null; adjusted_nav: string | null; daily_return: string | null; cumulative_return: string | null; analysis_status: string; analysis_run_id: number | null; metric_source: string; }
export interface NavSeries { methodology: string; total_return: string | null; points: NavPoint[]; }
export interface Position { security_code: string | null; security_name: string | null; market: string | null; account: string | null; quantity: string | null; market_price: string | null; market_value: string | null; nav_weight: string | null; suspension_info: string | null; }
export interface FundQuality { version_id: number | null; valuation_date?: string | null; quality_status: import("@/utils/constants").QualityStatus; validation: ImportValidationFinding[]; }
export interface RiskEvent { id: number; risk_rule_id: number; rule_code: string | null; fund_id: number | null; fund_name: string | null; valuation_date: string; severity: import("@/utils/constants").RiskSeverity; status: import("@/utils/constants").RiskEventStatus; first_triggered_at: string; last_triggered_at: string; handling_note: string | null; evidence_snapshot: unknown; handled_by_user_id: number | null; handled_at: string | null; evidence_reference: string | null; created_at: string; }

export interface ApiPage<T> { data: T[]; meta: Record<string, number>; }
export interface ImportBatch {
  id: number; source_type: import("@/utils/constants").SourceType; file_count: number;
  status: import("@/utils/constants").ImportBatchStatus; created_at: string;
}
export interface Job {
  id: number; type: string; status: import("@/utils/constants").JobStatus; attempts: number; max_attempts: number;
  locked_at: string | null; started_at: string | null; finished_at: string | null; error_code: string | null;
  next_retry_at: string | null; can_retry: boolean;
}
export interface ImportBatchFile { id: number; original_filename: string; file_hash: string; file_size?: number; duplicate: boolean; }
export interface ImportBatchDetail extends ImportBatch { files: ImportBatchFile[]; job: Job | null; }
export interface ImportValidationFinding {
  rule_code: string; level: import("@/utils/constants").ValidationLevel; actual_value: string | null;
  expected_value: string | null; difference: string | null; source_location: string | null; message: string;
}
export interface ImportValidationVersion {
  version_id: number; fund_id: number; valuation_date: string;
  status: import("@/utils/constants").ValuationStatus; findings: ImportValidationFinding[];
}
export interface ReviewItem { id: number; fund_id: number; fund_name: string; valuation_date: string; version_no: number; status: import("@/utils/constants").ValuationStatus; critical_count: number; warning_count: number; }
export interface MailSettings {
  host: string; port: number; username: string; configured: boolean; credential_source: string;
  credential_writable: boolean; auto_sync_enabled: boolean;
}
export interface MailSyncResult {
  run_id: string; status: string; messages_seen: number; messages_imported: number; messages_skipped: number;
  attachments_seen: number; attachments_imported: number; duplicate_attachments: number; ignored_attachments: number;
  failed_attachments: number; failed_messages: number; batches_created: number; error_count: number; error_codes: string[];
  created_at?: string; summary?: Record<string, unknown>;
}
export interface CatalogFund { id: number; standard_name?: string; name?: string; product_code: string | null; establishment_date?: string | null; strategy?: string | null; manager?: string | null; notes?: string | null; status: import("@/utils/constants").FundStatus; }
export interface Alias { id: number; fund_id: number; alias: string; source_location: string | null; match_priority: number; valid_from: string | null; valid_to: string | null; }
export interface ShareClass { id: number; fund_id: number; share_code: string; share_name: string; status: "active" | "inactive"; enabled_from: string | null; disabled_from: string | null; notes: string | null; }
export interface SubjectMapping { id: number; subject_code_or_prefix: string | null; raw_name_pattern: string | null; standard_category: string; is_leaf: boolean; include_in_holdings: boolean; valid_from: string | null; valid_to: string | null; rule_version: string; status: import("@/utils/constants").MappingStatus; }
export interface RiskRule { id: number; rule_code: string; rule_type: string; scope: string; threshold: string; severity: import("@/utils/constants").RiskSeverity; valid_from: string | null; valid_to: string | null; version: string; enabled: boolean; }
export interface AdminUser { id: number; username: string; display_name: string; role: import("@/utils/constants").UserRole; status: import("@/utils/constants").UserStatus; last_login_at: string | null; navigation: string[]; }
export interface AuditLog { id: number; actor_user_id: number | null; action: string; resource_type: string; resource_id: string | null; summary: unknown; reason: string | null; result: import("@/utils/constants").AuditResult; created_at: string; }
export type SystemSetting = { value: number | string | boolean; source: string };
export type SystemSettings = Record<string, SystemSetting>;
export interface MaintenanceResult { command: string; status: string; summary: Record<string, unknown>; error_code?: string; }
export interface OperationalSummary { [key: string]: unknown; }
