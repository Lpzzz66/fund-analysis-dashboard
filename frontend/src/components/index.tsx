/** Shared UI components implementing the cross-page interaction spec (docs 02 §1). */
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { App as AntdApp, Modal, Form, Input, Tag, Tooltip } from "antd";
import { can, type Capability } from "@/utils/permissions";
import { useAuth } from "@/app/auth";
import type { QualityStatus, ValidationLevel } from "@/utils/constants";
import {
  QUALITY_STATUS_LABEL,
  VALIDATION_LEVEL_LABEL,
} from "@/utils/constants";
import { dateStr } from "@/utils/format";

/* ---------- NumberText: monospace figures ---------- */
export function Num({
  children,
  dp,
  className = "",
  style,
}: {
  children: ReactNode;
  dp?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  let text: ReactNode = children;
  if (dp !== undefined && typeof children === "number") text = children.toFixed(dp);
  return (
    <span className={`num ${className}`} style={style}>
      {children === null || children === undefined ? "—" : text}
    </span>
  );
}

/* ---------- QualityBadge: semantic dot + label ---------- */
export function QualityBadge({ status, showLabel = true }: { status: QualityStatus; showLabel?: boolean }) {
  const cls = status === "valid" ? "q-dot--valid" : status === "warning" ? "q-dot--warning" : status === "pending" ? "q-dot--pending" : status === "partial" ? "q-dot--partial" : "q-dot--stale";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span className={`q-dot ${cls}`} />
      {showLabel && <span style={{ fontSize: 13 }}>{QUALITY_STATUS_LABEL[status]}</span>}
    </span>
  );
}

/* ---------- StatusRibbon: the signature element of every data page ---------- */
export function StatusRibbon({
  asOf,
  version,
  coverage,
  quality,
}: {
  asOf: string | null;
  version: string | null;
  coverage: { available: number; total: number };
  quality: QualityStatus;
}) {
  const cov = coverage.total === 0 ? "—" : `${coverage.available}/${coverage.total}`;
  return (
    <div className="fd-ribbon">
      <div className="fd-ribbon__cell">
        <span className="fd-ribbon__label">数据截至</span>
        <span className="fd-ribbon__value">{dateStr(asOf)}</span>
      </div>
      <div className="fd-ribbon__cell">
        <span className="fd-ribbon__label">已发布版本</span>
        <span className="fd-ribbon__value">{version ?? "—"}</span>
      </div>
      <div className="fd-ribbon__cell">
        <span className="fd-ribbon__label">覆盖率</span>
        <span className="fd-ribbon__value">{cov}</span>
      </div>
      <div className="fd-ribbon__cell">
        <span className="fd-ribbon__label">质量状态</span>
        <span className="fd-ribbon__value">
          <QualityBadge status={quality} showLabel />
        </span>
      </div>
    </div>
  );
}

/* ---------- PageHeader ---------- */
export function PageHeader({
  title,
  desc,
  extra,
}: {
  title: string;
  desc?: string;
  extra?: ReactNode;
}) {
  return (
    <div className="fd-page__bar">
      <div>
        <h1 className="fd-page__title">{title}</h1>
        {desc && <p className="fd-page__desc">{desc}</p>}
      </div>
      {extra && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>{extra}</div>}
    </div>
  );
}

/* ---------- RoleGuard: hide write buttons for viewer ---------- */
export function RoleGuard({ cap, children }: { cap: Capability; children: ReactNode }) {
  const { session } = useAuth();
  if (!can(session?.role, cap)) return null;
  return <>{children}</>;
}

/* ---------- ConfirmReason: destructive-action confirmation with reason ---------- */
const ConfirmCtx = createContext<{
  confirm: (opts: ConfirmOpts) => Promise<string | null>;
} | null>(null);

interface ConfirmOpts {
  title: string;
  description?: string;
  reasonLabel?: string;
  reasonRequired?: boolean;
  danger?: boolean;
  okText?: string;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOpts | null>(null);
  const [reason, setReason] = useState("");
  const resolver = useRef<(v: string | null) => void>(() => {});

  function confirm(o: ConfirmOpts): Promise<string | null> {
    setOpts(o);
    setReason("");
    setOpen(true);
    return new Promise((resolve) => {
      resolver.current = resolve;
    });
  }

  function close(v: string | null) {
    setOpen(false);
    resolver.current(v);
  }

  return (
    <ConfirmCtx.Provider value={{ confirm }}>
      {children}
      <Modal
        open={open}
        title={opts?.title}
        okText={opts?.okText ?? "确认"}
        okButtonProps={{ danger: opts?.danger, disabled: opts?.reasonRequired && !reason }}
        cancelText="取消"
        onCancel={() => close(null)}
        onOk={() => close(opts?.reasonRequired ? reason.trim() || null : reason.trim() || "")}
        destroyOnClose
      >
        {opts?.description && <p style={{ color: "var(--muted)" }}>{opts.description}</p>}
        <Form layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item label={opts?.reasonLabel ?? "操作原因"} required={opts?.reasonRequired}>
            <Input.TextArea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="请填写原因，将记入审计日志"
              maxLength={500}
              showCount
            />
          </Form.Item>
        </Form>
      </Modal>
    </ConfirmCtx.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmCtx);
  if (!ctx) throw new Error("useConfirm outside provider");
  return ctx.confirm;
}

/* ---------- SourceLink: traceability affordance ---------- */
export function SourceLink({ label = "查看来源", hint }: { label?: string; hint?: string }) {
  return (
    <Tooltip title={hint ?? "定位到产品、估值日、版本、原始文件和字段来源"}>
      <span className="fd-source-link">{label}</span>
    </Tooltip>
  );
}

/* ---------- ValidationLevelTag ---------- */
export function LevelTag({ level }: { level: ValidationLevel }) {
  const color =
    level === "critical" ? "error" : level === "warning" ? "warning" : "default";
  return (
    <Tag color={color} style={{ marginInlineEnd: 0 }}>
      {VALIDATION_LEVEL_LABEL[level]}
    </Tag>
  );
}

/* ---------- EmptyState ---------- */
export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="fd-empty">
      <p style={{ fontSize: 15, color: "var(--ink)", margin: "0 0 4px" }}>{title}</p>
      {hint && <p style={{ margin: "0 0 16px" }}>{hint}</p>}
      {action}
    </div>
  );
}

/* ---------- PollingTask: 2s→5s polling, stop on unmount or completion ---------- */
export function usePolling(
  isActive: boolean,
  isDone: (r: unknown) => boolean,
  fetch: () => Promise<unknown>,
  onUpdate: (r: unknown) => void,
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stableTicks = useRef(0);
  const isDoneRef = useRef(isDone);
  const fetchRef = useRef(fetch);
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    isDoneRef.current = isDone;
    fetchRef.current = fetch;
    onUpdateRef.current = onUpdate;
  }, [fetch, isDone, onUpdate]);
  useEffect(() => {
    if (!isActive) return;
    let cancelled = false;
    async function tick() {
      try {
        const r = await fetchRef.current();
        if (cancelled) return;
        onUpdateRef.current(r);
        if (isDoneRef.current(r)) {
          stableTicks.current = 0;
          return; // stop polling when done
        }
        stableTicks.current += 1;
        const next = stableTicks.current >= 15 ? 5000 : 2000; // 15 ticks (~30s) → 5s
        timer.current = setTimeout(tick, next);
      } catch {
        if (!cancelled) timer.current = setTimeout(tick, 5000);
      }
    }
    tick();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      stableTicks.current = 0;
    };
  }, [isActive]);
}

/* ---------- Toast access ---------- */
export function useToast() {
  const { message } = AntdApp.useApp();
  return message;
}

/* ---------- Truncate: collapse long text in dense table cells ---------- */
// Renders text in a constrained-width box. Short values stay on one line;
// values longer than `maxChars` collapse to an ellipsised preview with a
// toggle link to expand / collapse. JSON values are stringified once and
// then truncated the same way. Use this anywhere a Table cell could blow
// out the column width on a single long entry.
export function Truncate({
  value,
  maxChars = 80,
  className = "",
}: {
  value?: string | number | boolean | null | object;
  maxChars?: number;
  className?: string;
}) {
  const text = (() => {
    if (value === null || value === undefined || value === "") return "";
    if (typeof value === "string") return value;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  })();
  const [expanded, setExpanded] = useState(false);
  if (!text) return <span className="fd-caption">—</span>;
  const overflows = text.length > maxChars;
  if (!overflows) {
    return (
      <Tooltip title={text} mouseEnterDelay={0.4}>
        <span className={`fd-truncate ${className}`.trim()}>{text}</span>
      </Tooltip>
    );
  }
  const shown = expanded ? text : `${text.slice(0, maxChars)}…`;
  return (
    <span className={`fd-truncate ${className}`.trim()}>
      <Tooltip title={text} mouseEnterDelay={0.4}>
        <span>{shown}</span>
      </Tooltip>{" "}
      <a
        role="button"
        onClick={(e) => {
          e.stopPropagation();
          setExpanded((current) => !current);
        }}
      >
        {expanded ? "收起" : "展开"}
      </a>
    </span>
  );
}
