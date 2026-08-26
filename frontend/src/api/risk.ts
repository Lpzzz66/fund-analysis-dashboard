import { apiRequest } from "./client";
import type { ApiEnvelope, ApiPage, RiskEvent, RiskRule } from "./types";
import type { RiskEventStatus, RiskSeverity } from "@/utils/constants";

export interface RiskEventParams { fund_id?: number; rule_code?: string; severity?: RiskSeverity; status?: RiskEventStatus; page?: number; page_size?: number; }
export function listEvents(params: RiskEventParams = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== "") query.set(key, String(value)); });
  return apiRequest<ApiPage<RiskEvent>>(`/risk/events?${query.toString()}`);
}
export function handleEvent(id: number, payload: { status: RiskEventStatus; handling_note: string; evidence_reference?: string }) {
  return apiRequest<ApiEnvelope<RiskEvent>>(`/risk/events/${id}/handle`, { method: "POST", body: payload });
}

export interface RiskRuleParams { rule_code?: string; enabled?: boolean; include_history?: boolean; page?: number; page_size?: number; }
export interface RiskRuleCreateInput {
  rule_code: string;
  rule_type: string;
  scope: string;
  threshold: number;
  severity: RiskSeverity;
  enabled: boolean;
}
export type RiskRuleUpdateInput = Omit<RiskRuleCreateInput, "rule_code">;
export function listRules(params: RiskRuleParams = {}) { const query = new URLSearchParams(); Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== "") query.set(key, String(value)); }); return apiRequest<ApiPage<RiskRule>>(`/risk/rules?${query.toString()}`); }
export function createRule(payload: RiskRuleCreateInput) { return apiRequest<ApiEnvelope<RiskRule>>("/risk/rules", { method: "POST", body: payload }); }
export function updateRule(id: number, payload: RiskRuleUpdateInput) { return apiRequest<ApiEnvelope<RiskRule>>(`/risk/rules/${id}`, { method: "PATCH", body: payload }); }
