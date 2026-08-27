import { afterEach, describe, expect, it, vi } from "vitest";
import { dec, timeStr, today } from "@/utils/format";

afterEach(() => {
  vi.useRealTimers();
});

describe("timeStr", () => {
  it("converts backend UTC timestamps to Beijing time", () => {
    expect(timeStr("2026-08-27T01:30:00+00:00")).toBe("2026-08-27 09:30");
  });

  it("treats timezone-less backend timestamps as UTC", () => {
    expect(timeStr("2026-08-27T01:30:00")).toBe("2026-08-27 09:30");
  });

  it("does not disguise invalid timestamps as formatted values", () => {
    expect(timeStr("not-a-date-value")).toBe("not-a-date-value");
  });
});

describe("dec", () => {
  it("renders an empty backend value as missing", () => {
    expect(dec("")).toBe("—");
  });
});

describe("today", () => {
  it("uses the Shanghai calendar date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-26T16:30:00Z"));

    expect(today()).toBe("2026-08-27");
  });
});
