import { apiRequest } from "./client";
import type { DashboardOverviewResponse } from "./types";

export function getOverview(asOf?: string) {
  const query = asOf ? `?as_of=${encodeURIComponent(asOf)}` : "";
  return apiRequest<DashboardOverviewResponse>(`/dashboard/overview${query}`);
}
