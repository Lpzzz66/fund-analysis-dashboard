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

/** Format an ISO datetime to YYYY-MM-DD HH:mm. */
export function timeStr(value: string | null | undefined): string {
  if (!value) return "—";
  const d = value.slice(0, 16).replace("T", " ");
  return d;
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

/** Build a CSV blob and trigger download (simulates export of current view). */
export function exportCsv(
  rows: Record<string, unknown>[],
  filename: string,
  asOf?: string,
): void {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => esc(r[h])).join(",")),
  ];
  const note = `# 导出时间: ${new Date().toISOString()}\n# 数据截至: ${asOf ?? "—"}\n`;
  const blob = new Blob(["\ufeff" + note + lines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Sleep helper for mock async latency. */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
