import {
  ChevronLeft,
  CircleAlert,
  Info,
  OctagonAlert,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  Check,
  X,
  WifiOff,
  Sparkles,
} from "lucide-react";
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { ApiError } from "../lib/api";

/* ── Tombol ─────────────────────────────────────────────────────────────── */
type BtnVariant = "primary" | "ghost" | "danger" | "danger-ghost" | "xai" | "quiet";
interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  size?: "sm" | "md";
  block?: boolean;
  loading?: boolean;
  icon?: ReactNode;
}
export function Button({ variant = "primary", size = "md", block, loading, icon, children, className = "", disabled, ...rest }: BtnProps) {
  return (
    <button
      type="button"
      className={`btn btn-${variant} ${size === "sm" ? "btn-sm" : ""} ${block ? "btn-block" : ""} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

/* ── Zona: kata + bentuk + warna ───────────────────────────────────────── */
export function ZoneShape({ zone, size = 14 }: { zone: string; size?: number }) {
  if (zone === "merah")
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
        <path d="M5 1h6l4 4v6l-4 4H5l-4-4V5z" fill="currentColor" />
      </svg>
    );
  if (zone === "kuning")
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
        <path d="M8 1.5 15 14H1z" fill="currentColor" />
      </svg>
    );
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <circle cx="8" cy="8" r="6.5" fill="currentColor" />
    </svg>
  );
}

const ZONE_TEXT: Record<string, string> = { hijau: "Hijau", kuning: "Kuning: sapaan", merah: "Merah: kontak BK" };
export function ZoneChip({ zone, note }: { zone: string; note?: string }) {
  const cls = zone === "merah" ? "chip-bad" : zone === "kuning" ? "chip-warn" : "chip-ok";
  return (
    <span className={`chip ${cls}`}>
      <ZoneShape zone={zone} />
      {ZONE_TEXT[zone] ?? zone}
      {note && <span style={{ fontWeight: 600 }}>· {note}</span>}
    </span>
  );
}

const STATUS_CLS: Record<string, string> = {
  baru: "chip-info",
  disapa: "chip-ok",
  ditindaklanjuti: "chip-ok",
  ditutup: "chip-neutral",
  terlambat: "chip-bad",
  ditinjau: "chip-xai",
};
const STATUS_TXT: Record<string, string> = {
  baru: "Baru",
  disapa: "Disapa",
  ditindaklanjuti: "Ditindaklanjuti",
  ditutup: "Ditutup",
  terlambat: "Terlambat",
  ditinjau: "Sedang ditinjau",
};
export function StatusChip({ status }: { status: string }) {
  return <span className={`chip ${STATUS_CLS[status] ?? "chip-neutral"}`}>{STATUS_TXT[status] ?? status}</span>;
}

export function SimTag() {
  return (
    <span className="chip chip-sim" title="Data contoh, bukan data nyata">
      SIMULASI
    </span>
  );
}

/* ── Banner dan kotak XAI ───────────────────────────────────────────────── */
type BannerKind = "info" | "warn" | "bad" | "xai";
const BANNER_ICON: Record<BannerKind, ReactNode> = {
  info: <Info aria-hidden />,
  warn: <TriangleAlert aria-hidden />,
  bad: <OctagonAlert aria-hidden />,
  xai: <Sparkles aria-hidden />,
};
export function Banner({ kind = "info", children, action, role }: { kind?: BannerKind; children: ReactNode; action?: ReactNode; role?: string }) {
  return (
    <div className={`banner banner-${kind}`} role={role ?? (kind === "bad" ? "alert" : undefined)}>
      {BANNER_ICON[kind]}
      <div className="banner-body">{children}</div>
      {action && <div className="banner-action">{action}</div>}
    </div>
  );
}

export function XaiBox({ title, children, tag = "XAI" }: { title: string; children: ReactNode; tag?: string }) {
  return (
    <section className="xai-box" aria-label={title}>
      <div className="xai-head">
        <span className="xai-tag">{tag}</span>
        <h3>{title}</h3>
      </div>
      <div style={{ fontSize: 15 }}>{children}</div>
    </section>
  );
}

/* ── Saklar izin ───────────────────────────────────────────────────────── */
export function Switch({ checked, onChange, label, disabled, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; id?: string }) {
  return (
    <button type="button" role="switch" id={id} aria-checked={checked} aria-label={label} className="switch" disabled={disabled} onClick={() => onChange(!checked)}>
      <span className="track" />
      <span className="thumb" />
    </button>
  );
}

export function SwitchRow({
  label,
  desc,
  status,
  checked,
  onChange,
  disabled,
  statusOn,
}: {
  label: string;
  desc?: string;
  status?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  statusOn?: boolean;
}) {
  return (
    <div className="switch-row">
      <div className="switch-text">
        <div className="switch-label">{label}</div>
        {desc && <div className="switch-desc">{desc}</div>}
        {status && <div className={`switch-status ${statusOn ? "on" : ""}`}>{status}</div>}
      </div>
      <Switch checked={checked} onChange={onChange} label={label} disabled={disabled} />
    </div>
  );
}

/* ── Keadaan ───────────────────────────────────────────────────────────── */
export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon">{icon ?? <Check aria-hidden />}</span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ h = 16, w = "100%", r = 8 }: { h?: number; w?: number | string; r?: number }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: r }} aria-hidden />;
}

export function LoadingBlock({ lines = 3, label = "Memuat" }: { lines?: number; label?: string }) {
  return (
    <div className="stack" role="status" aria-label={label}>
      <Skeleton h={22} w="55%" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} h={72} r={12} />
      ))}
      <span className="sr-only">{label}…</span>
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: ApiError | Error; onRetry?: () => void }) {
  const offline = "offline" in error && (error as ApiError).offline;
  return (
    <div className="card">
      <div className="empty">
        <span className="empty-icon" style={{ background: offline ? "var(--panel)" : "var(--bad-soft)", color: offline ? "var(--body)" : "var(--bad)" }}>
          {offline ? <WifiOff aria-hidden /> : <CircleAlert aria-hidden />}
        </span>
        <h3>{offline ? "Tidak ada koneksi" : "Halaman belum bisa dimuat"}</h3>
        <p>{error.message}</p>
        {onRetry && (
          <Button variant="ghost" icon={<RefreshCw aria-hidden />} onClick={onRetry}>
            Coba lagi
          </Button>
        )}
      </div>
    </div>
  );
}

/* ── Kotak konfirmasi (dialog native) ──────────────────────────────────── */
export function ConfirmDialog({
  open,
  title,
  consequence,
  confirmLabel,
  cancelLabel = "Batal",
  danger,
  loading,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title: string;
  consequence: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="dialog" onCancel={(e) => (e.preventDefault(), onCancel())} aria-labelledby="dlg-title">
      <div className="dialog-body">
        <h2 id="dlg-title">{title}</h2>
        <p>{consequence}</p>
        {children}
      </div>
      <div className="dialog-actions">
        <Button variant="ghost" onClick={onCancel} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}

/* ── Kepala halaman ────────────────────────────────────────────────────── */
export function PageHead({ title, sub, meta, actions, back }: { title: string; sub?: ReactNode; meta?: ReactNode; actions?: ReactNode; back?: { to: string; label: string } }) {
  return (
    <header className="page-head">
      <div className="ph-text">
        {back && (
          <Link to={back.to} className="back-link">
            <ChevronLeft aria-hidden />
            {back.label}
          </Link>
        )}
        <div className="row" style={{ gap: 10 }}>
          <h1>{title}</h1>
          {meta}
        </div>
        {sub && <p className="ph-sub">{sub}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </header>
  );
}

export function Stat({ value, label, note, tone }: { value: ReactNode; label: string; note?: string; tone?: "bad" | "warn" }) {
  return (
    <div className={`stat ${tone ? `is-${tone}` : ""}`}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
      {note && <span className="stat-note">{note}</span>}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.id} role="tab" type="button" aria-selected={value === t.id} className="tab" onClick={() => onChange(t.id)}>
          {t.label}
          {t.count !== undefined && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function SeenPanel({ seen, notSeen, seenTitle = "Yang kami baca", notSeenTitle = "Yang tidak pernah kami baca" }: { seen: string[]; notSeen: string[]; seenTitle?: string; notSeenTitle?: string }) {
  return (
    <div className="seen-panel">
      <div className="seen-col yes">
        <h4>{seenTitle}</h4>
        <ul>
          {seen.map((s) => (
            <li key={s}>
              <Check aria-hidden />
              {s}
            </li>
          ))}
        </ul>
      </div>
      <div className="seen-col no">
        <h4>{notSeenTitle}</h4>
        <ul>
          {notSeen.map((s) => (
            <li key={s}>
              <X aria-hidden />
              {s}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function Steps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="steps" aria-label={`Langkah ${current + 1} dari ${steps.length}`}>
      {steps.map((s, i) => (
        <li key={s} data-state={i < current ? "done" : i === current ? "current" : "todo"} aria-current={i === current ? "step" : undefined}>
          {s}
        </li>
      ))}
    </ol>
  );
}

export function HumanNote({ children }: { children?: ReactNode }) {
  return (
    <p className="row nowrap-row small muted" style={{ gap: 8, alignItems: "flex-start" }}>
      <ShieldCheck aria-hidden style={{ width: 18, height: 18, flex: "none", color: "var(--xai)", marginTop: 2 }} />
      <span>{children ?? "Penandaan ini bukan diagnosis. Manusia yang memutuskan langkah berikutnya, bukan sistem."}</span>
    </p>
  );
}
