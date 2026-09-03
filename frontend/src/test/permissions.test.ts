import { navForRole } from "@/utils/permissions";

describe("role navigation", () => {
  it("shows the full navigation to system administrators", () => {
    expect(navForRole("admin")).toEqual([
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
    ]);
  });

  it("keeps business operators on data operations", () => {
    expect(navForRole("operator")).toEqual([
      "dashboard",
      "risk",
      "funds",
      "imports",
      "reviews",
      "mail",
    ]);
  });

  it("limits read-only users to view pages", () => {
    expect(navForRole("viewer")).toEqual(["dashboard", "risk", "funds"]);
  });
});
