import React from "react";

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-card border border-line bg-surface ${className}`}>
      {children}
    </div>
  );
}

export function SectionTitle({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-3">
      <h2 className="font-display text-[15px] font-semibold text-ink">{children}</h2>
      {hint && <p className="mt-0.5 text-2xs text-faint">{hint}</p>}
    </div>
  );
}

type Tone = "ok" | "warn" | "bad" | "neutral" | "action";
const toneMap: Record<Tone, string> = {
  ok: "bg-ok/10 text-ok border-ok/20",
  warn: "bg-warn/10 text-warn border-warn/25",
  bad: "bg-bad/10 text-bad border-bad/20",
  neutral: "bg-ink/5 text-muted border-line",
  action: "bg-action/10 text-action border-action/20",
};
export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: Tone;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-medium ${toneMap[tone]}`}
    >
      {children}
    </span>
  );
}

export function Button({
  children,
  variant = "primary",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline";
}) {
  const v =
    variant === "primary"
      ? "bg-action text-white hover:bg-action-700"
      : variant === "outline"
      ? "border border-line bg-surface text-ink hover:bg-ink/5"
      : "text-muted hover:bg-ink/5";
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${v} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-2xs font-medium uppercase tracking-wide text-faint">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-2xs text-faint">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-action";

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded-md ${className}`} />;
}

export function EmptyState({
  title,
  desc,
  action,
}: {
  title: string;
  desc: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-line bg-surface px-6 py-14 text-center">
      <div className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-ink/5 text-muted">
        ◫
      </div>
      <p className="font-display text-sm font-semibold text-ink">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-muted">{desc}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ msg, onRetry }: { msg: string; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-card border border-bad/20 bg-bad/5 px-4 py-3">
      <span className="mt-0.5 text-bad">▲</span>
      <div className="flex-1">
        <p className="text-sm font-medium text-bad">No se pudo completar la consulta</p>
        <p className="mt-0.5 text-xs text-muted">{msg}</p>
      </div>
      {onRetry && (
        <Button variant="outline" onClick={onRetry} className="!py-1.5 !text-xs">
          Reintentar
        </Button>
      )}
    </div>
  );
}
