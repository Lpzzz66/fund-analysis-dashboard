import { apiRequest } from "./client";
import type { DashboardOverviewResponse, DashboardSeriesResponse } from "./types";

export function getOverview(asOf?: string) {
  const query = asOf ? `?as_of=${encodeURIComponent(asOf)}` : "";
  return apiRequest<DashboardOverviewResponse>(`/dashboard/overview${query}`);
}

export function getSeries(params: { start?: string; end?: string } = {}) {
  const query = new URLSearchParams();
  if (params.start) query.set("start", params.start);
  if (params.end) query.set("end", params.end);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiRequest<DashboardSeriesResponse>(`/dashboard/series${suffix}`);
}
