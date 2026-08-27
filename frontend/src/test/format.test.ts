import { describe, expect, it } from "vitest";
import { timeStr } from "@/utils/format";

describe("timeStr", () => {
  it("converts backend UTC timestamps to Beijing time", () => {
    expect(timeStr("2026-08-27T01:30:00+00:00")).toBe("2026-08-27 09:30");
  });

  it("treats timezone-less backend timestamps as UTC", () => {
    expect(timeStr("2026-08-27T01:30:00")).toBe("2026-08-27 09:30");
  });
});
