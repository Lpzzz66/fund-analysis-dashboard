import type { UserRole } from "./constants";

/**
 * Permission model mirrors the role matrix in docs/产品与功能范围.md.
 * viewer: read-only, no write buttons anywhere.
 * operator: + upload/import, review/publish, maintain funds/subjects/rules, read audit.
 * admin: everything incl. user management & system settings.
 */
const MATRIX = {
  admin: {
    dashboard: true,
    risk: true,
    funds: true,
    imports: true,
    reviews: true,
    mail: true,
    adminFunds: true,
    adminSubjects: true,
    adminRiskRules: true,
    adminUsers: true,
    adminAudit: true,
    adminSettings: true,
    adminRetention: true,
    write: true,
    publish: true,
    manageUsers: true,
    manageSettings: true,
  },
  operator: {
    dashboard: true,
    risk: true,
    funds: true,
    imports: true,
    reviews: true,
    mail: true,
    adminFunds: true,
    adminSubjects: true,
    adminRiskRules: true,
    adminUsers: false,
    adminAudit: true,
    adminSettings: false,
    adminRetention: false,
    write: true,
    publish: true,
    manageUsers: false,
    manageSettings: false,
  },
  viewer: {
    dashboard: true,
    risk: true,
    funds: true,
    imports: false,
    reviews: false,
    mail: false,
    adminFunds: false,
    adminSubjects: false,
    adminRiskRules: false,
    adminUsers: false,
    adminAudit: false,
    adminSettings: false,
    adminRetention: false,
    write: false,
    publish: false,
    manageUsers: false,
    manageSettings: false,
  },
} as const;

export type Capability = keyof (typeof MATRIX)[UserRole];

export function can(role: UserRole | undefined, cap: Capability): boolean {
  if (!role) return false;
  return MATRIX[role][cap] ?? false;
}

export function navForRole(role: UserRole): string[] {
  if (role === "admin")
    return [
      "dashboard",
      "risk",
      "funds",
      "imports",
      "reviews",
      "adminFunds",
      "adminSubjects",
      "adminRiskRules",
      "adminUsers",
      "adminAudit",
      "adminSettings",
      "adminRetention",
      "mail",
    ];
  if (role === "operator")
    return [
      "dashboard",
      "risk",
      "funds",
      "imports",
      "reviews",
      "adminFunds",
      "adminSubjects",
      "adminRiskRules",
      "mail",
      "adminAudit",
    ];
  return ["dashboard", "risk", "funds"];
}
