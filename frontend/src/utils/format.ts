/** Formatting helpers. Decimals arrive as strings from the backend
 * (str(Decimal), e.g. "90000.0000000000"); we parse and reformat for display. */

/** Trim trailing zeros from a decimal string, keep at least 2dp for currency. */
export function dec(value: string | null | undefined, dp = 2): string {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (!isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}

/** Percentage from a ratio string like "0.0123456789" → "+1.23%". */
export function pct(value: string | null | undefined, dp = 2): string {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (!isFinite(n)) return "—";
  const s = (n * 100).toFixed(dp);
  return `${n >= 0 ? "+" : ""}${s}%`;
}

/** Signed percentage without the leading + for negatives. */
export function pctPlain(value: string | null | undefined, dp = 2): string {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (!isFinite(n)) return "—";
  return `${(n * 100).toFixed(dp)}%`;
}

/** Weight in percent. */
export function weight(value: string | null | undefined, dp = 2): string {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (!isFinite(n)) return "—";
  return `${(n * 100).toFixed(dp)}%`;
}

/** Compact number for large nav, e.g. 9,000,000 → 9,000,000 (keep full). */
export function money(value: string | null | undefined, unit = "元"): string {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (!isFinite(n)) return "—";
  return `${dec(value, 2)} ${unit}`;
}

/** Format an ISO date/datetime string to YYYY-MM-DD. */
export function dateStr(value: string | null | undefined): string {
  if (!value) return "—";
  return value.slice(0, 10);
}

/** Format a backend UTC ISO datetime as Beijing local time. */
export function timeStr(value: string | null | undefined): string {
  if (!value) return "—";
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16).replace("T", " ");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

/** Sign-colored value for returns. */
export function returnColor(value: string | null | undefined): string {
  if (value === null || value === undefined) return "var(--text-2)";
  const n = Number(value);
  if (!isFinite(n)) return "var(--text-2)";
  if (n > 0) return "var(--sage)";
  if (n < 0) return "var(--crimson)";
  return "var(--text-2)";
}

/** Today as ISO date. */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
