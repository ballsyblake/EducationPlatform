import Link from "next/link";
import type { ReactNode } from "react";

export type Tone = "muted" | "good" | "ok" | "warn" | "bad" | "info";

/* Badges are small, so this is where the highlight colours earn their keep —
   used as tints behind dark text, per "sparingly … to add brightness". */
const TONE_CLASSES: Record<Tone, string> = {
  muted: "bg-ink-100 text-ink-600",
  good: "bg-status-green-bg text-status-green-fg",
  ok: "bg-status-blue-bg text-status-blue-fg",
  warn: "bg-status-orange-bg text-status-orange-fg",
  // No red exists in the palette, so anything urgent speaks in Maroon.
  bad: "bg-maroon-100 text-maroon-800",
  info: "bg-status-blue-bg text-status-blue-fg",
};

export function Badge({ tone = "muted", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge ${TONE_CLASSES[tone]}`}>{children}</span>;
}

export function PageHeader({
  title,
  subtitle,
  breadcrumb,
  action,
}: {
  title: string;
  subtitle?: ReactNode;
  breadcrumb?: { href: string; label: string };
  action?: ReactNode;
}) {
  return (
    <div className="mb-6">
      {breadcrumb && (
        <Link
          href={breadcrumb.href}
          className="mb-2 inline-block text-sm text-ink-500 hover:text-maroon-700"
        >
          ← {breadcrumb.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {/* Main headlines: SemiBold, all caps, tracked out to match the logo (2.D). */}
          <h1 className="headline text-2xl text-ink-900">{title}</h1>
          {subtitle && <div className="mt-1 text-sm text-ink-500">{subtitle}</div>}
        </div>
        {action}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-10 text-center">
      <p className="font-semibold text-ink-700">{title}</p>
      {description && <p className="max-w-md text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone = "muted",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: Tone;
}) {
  // Figures are read as type, so they stay in colours that hold contrast —
  // Maroon leads, and the darkened highlight tones carry status.
  const accent: Record<Tone, string> = {
    muted: "text-ink-900",
    // Green, so an all-clear figure doesn't read as an alarm in Maroon.
    good: "text-status-green-fg",
    ok: "text-status-blue-fg",
    warn: "text-status-orange-fg",
    bad: "text-maroon-800",
    info: "text-status-blue-fg",
  };
  return (
    <div className="card card-pad">
      <p className="section-title">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent[tone]}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

export function ProgressBar({ value, tone = "good" }: { value: number; tone?: Tone }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  // A progress bar is a large area of colour, so the lead brand colour carries
  // it rather than a highlight.
  const fill: Record<Tone, string> = {
    muted: "bg-ink-300",
    good: "bg-maroon-600",
    ok: "bg-maroon-600",
    warn: "bg-highlight-orange",
    bad: "bg-maroon-800",
    info: "bg-maroon-600",
  };
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-ink-200"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={`h-full rounded-full ${fill[tone]}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p className="rounded-lg bg-maroon-50 px-3 py-2 text-sm text-maroon-700">{message}</p>;
}

export function FormSuccess({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p className="rounded-lg bg-maroon-50 px-3 py-2 text-sm text-maroon-800">{message}</p>;
}
