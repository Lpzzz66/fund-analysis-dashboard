import type { UserRole, UserStatus } from "@/utils/constants";

export interface ApiEnvelope<T> {
  data: T;
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
