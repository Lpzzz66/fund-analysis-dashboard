import { apiRequest } from "./client";
import type {
  ApiEnvelope,
  ApiPage,
  AdminUser,
  AuthStatus,
  ChangePasswordInput,
  InitializeInput,
  LoginInput,
  UserSession,
} from "./types";

export async function authStatus(): Promise<AuthStatus> {
  const response = await apiRequest<ApiEnvelope<AuthStatus>>("/auth/status");
  return response.data;
}

export async function login(payload: LoginInput): Promise<UserSession> {
  const response = await apiRequest<ApiEnvelope<UserSession>>("/auth/login", {
    method: "POST",
    body: { username: payload.username, password: payload.password },
  });
  return response.data;
}

export async function initialize(payload: InitializeInput): Promise<UserSession> {
  const response = await apiRequest<ApiEnvelope<UserSession>>("/auth/initialize", {
    method: "POST",
    body: {
      username: payload.username,
      password: payload.password,
      display_name: payload.display_name,
    },
  });
  return response.data;
}

export async function me(): Promise<UserSession> {
  const response = await apiRequest<ApiEnvelope<UserSession>>("/auth/me");
  return response.data;
}

export function logout(): Promise<void> {
  return apiRequest<void>("/auth/logout", { method: "POST" });
}

export async function changePassword(
  payload: ChangePasswordInput,
): Promise<{ changed: boolean }> {
  const response = await apiRequest<ApiEnvelope<{ changed: boolean }>>(
    "/auth/change-password",
    { method: "POST", body: { ...payload } },
  );
  return response.data;
}

export function listUsers(params: { q?: string; role?: string; status?: string; page?: number; page_size?: number } = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== "") query.set(key, String(value)); });
  return apiRequest<ApiPage<AdminUser>>(`/users?${query.toString()}`);
}

export function createUser(payload: { username: string; password: string; role: string; display_name?: string }) {
  return apiRequest<ApiEnvelope<UserSession>>("/users", { method: "POST", body: payload });
}
export function disableUser(id: number, reason?: string) {
  return apiRequest<ApiEnvelope<UserSession>>(`/users/${id}/disable`, {
    method: "POST",
    body: reason ? { reason } : {},
  });
}
export function enableUser(id: number) { return apiRequest<ApiEnvelope<UserSession>>(`/users/${id}/enable`, { method: "POST" }); }
export function changeUserRole(id: number, role: string, reason?: string) {
  return apiRequest<ApiEnvelope<UserSession>>(`/users/${id}/role`, {
    method: "PATCH",
    body: reason ? { role, reason } : { role },
  });
}
export function resetUserPassword(id: number, password: string, reason?: string) {
  return apiRequest<ApiEnvelope<UserSession>>(`/users/${id}/reset-password`, {
    method: "POST",
    body: reason ? { password, reason } : { password },
  });
}
export function revokeUserSessions(id: number, reason?: string) {
  return apiRequest<ApiEnvelope<UserSession>>(`/users/${id}/revoke-sessions`, {
    method: "POST",
    body: reason ? { reason } : {},
  });
}
