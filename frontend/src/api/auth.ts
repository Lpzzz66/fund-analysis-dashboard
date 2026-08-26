import { apiRequest } from "./client";
import type {
  ApiEnvelope,
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
