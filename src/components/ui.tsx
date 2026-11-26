/**
 * UI primitives — the small, reusable vocabulary of the interface.
 * Everything visual composes these; restyle the app from here.
 */
"use client";

import { Loader2, X, type LucideIcon } from "lucide-react";
import { useEffect, type ComponentProps, type CSSProperties, type ReactNode } from "react";
import { cx } from "@/lib/utils";

// ------------------------------------------------------------------ buttons
type Variant = "primary" | "accent" | "soft" | "ghost" | "danger" | "dangerSolid";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink text-paper hover:bg-black",
  accent: "bg-ember text-[#FFF6EE] shadow-sm hover:bg-ember-deep",
  soft: "border border-line bg-card text-ink hover:border-ink/30",
  ghost: "text-ink-soft hover:bg-ink/5 hover:text-ink",
  danger: "text-[#A93B2A] hover:bg-[#A93B2A]/10",
  dangerSolid: "bg-[#A93B2A] text-white hover:bg-[#8C2F21]",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
};

export function buttonStyles(variant: Variant = "soft", size: Size = "md", className?: string) {
  return cx(
    "inline-flex select-none items-center justify-center gap-1.5 rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember disabled:pointer-events-none disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

export function Button({
  variant = "soft",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button type="button" {...props} className={buttonStyles(variant, size, className)} />;
}

export function IconButton({
  label,
  className,
  ...props
}: ComponentProps<"button"> & { label: string }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      {...props}
      className={cx(
        "grid size-7 shrink-0 place-items-center rounded-md text-ink-soft transition-colors hover:bg-ink/[0.06] hover:text-ink",
        className,
      )}
    />
  );
}

// ------------------------------------------------------------------- modal
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/45 p-4 backdrop-blur-[2px] sm:items-center"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cx(
          "animate-pop flex max-h-[88vh] w-full flex-col overflow-hidden rounded-2xl border border-line bg-paper shadow-2xl",
          size === "lg" ? "max-w-2xl" : "max-w-lg",
        )}
      >
        <div className="flex items-center justify-between px-5 pb-3 pt-4">
          <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
          <IconButton label="Close" onClick={onClose}><X size={16} /></IconButton>
        </div>
        <div className="overflow-y-auto px-5 pb-5">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-line bg-card px-5 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open, onClose, onConfirm, title, body, confirmLabel = "Delete", busy = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: string;
  confirmLabel?: string;
  busy?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="dangerSolid" onClick={onConfirm} disabled={busy}>
            {busy ? <Spinner /> : confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-ink-soft">{body}</p>
    </Modal>
  );
}

// ------------------------------------------------------------------- fields
const FIELD =
  "w-full rounded-lg border border-line bg-white/70 px-3 py-2 text-sm text-ink placeholder:text-ink-soft/50 transition focus:border-ember/60 focus:outline-none focus:ring-2 focus:ring-ember/20";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input {...props} className={cx(FIELD, className)} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea {...props} className={cx(FIELD, "leading-relaxed", className)} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select {...props} className={cx(FIELD, "cursor-pointer", className)} />;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

export function Chip({
  active = false, className, ...props
}: ComponentProps<"button"> & { active?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition-colors",
        active
          ? "border-ink bg-ink text-paper"
          : "border-line bg-card text-ink-soft hover:border-ink/30 hover:text-ink",
        className,
      )}
    />
  );
}

// ----------------------------------------------------------------- progress
export function ProgressBar({
  value, trackClass, barClass, barStyle,
}: {
  value: number;
  trackClass?: string;
  barClass?: string;
  barStyle?: CSSProperties;
}) {
  return (
    <div className={cx("h-1.5 overflow-hidden rounded-full", trackClass ?? "bg-ink/10")}>
      <div
        className={cx("h-full rounded-full transition-[width] duration-500", barClass ?? "bg-ember")}
        style={{ width: `${Math.min(100, Math.max(0, value))}%`, ...barStyle }}
      />
    </div>
  );
}

export function ProgressRing({
  value, size = 64, strokeWidth = 5, className,
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className={cx("relative grid shrink-0 place-items-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={strokeWidth} opacity={0.22} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={strokeWidth}
          strokeLinecap="round" strokeDasharray={`${(c * value) / 100} ${c}`}
          className="transition-[stroke-dasharray] duration-500"
        />
      </svg>
      <span className="absolute text-xs font-bold">{value}%</span>
    </div>
  );
}

// -------------------------------------------------------------- misc pieces
export function EmptyState({
  icon: Icon, title, body, children,
}: {
  icon: LucideIcon;
  title: string;
  body?: string;
  children?: ReactNode;
}) {
  return (
    <div className="animate-fade-up flex flex-col items-center gap-2 py-14 text-center">
      <div className="grid size-14 place-items-center rounded-2xl bg-paper2 text-ink-soft">
        <Icon size={24} />
      </div>
      <h3 className="mt-2 font-display text-xl font-semibold text-ink">{title}</h3>
      {body && <p className="max-w-sm text-sm leading-relaxed text-ink-soft">{body}</p>}
      {children && <div className="mt-3 flex flex-wrap items-center justify-center gap-2">{children}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 size={16} className={cx("animate-spin", className)} />;
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cx("text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft", className)}>
      {children}
    </p>
  );
}