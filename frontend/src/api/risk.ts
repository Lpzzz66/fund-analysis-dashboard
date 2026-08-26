import { apiRequest } from "./client";
import type { ApiEnvelope, ApiPage, RiskEvent } from "./types";
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
