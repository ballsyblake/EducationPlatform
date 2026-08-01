import Link from "next/link";
import type { ReactNode } from "react";

export type Tone = "muted" | "good" | "ok" | "warn" | "bad" | "info";

const TONE_CLASSES: Record<Tone, string> = {
  muted: "bg-chalk-100 text-chalk-600",
  good: "bg-field-100 text-field-800",
  ok: "bg-sky-100 text-sky-800",
  warn: "bg-amber-100 text-amber-800",
  bad: "bg-red-100 text-red-800",
  info: "bg-indigo-100 text-indigo-800",
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
          className="mb-2 inline-block text-sm text-chalk-500 hover:text-field-700"
        >
          ← {breadcrumb.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-chalk-900">{title}</h1>
          {subtitle && <div className="mt-1 text-sm text-chalk-500">{subtitle}</div>}
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
      <p className="font-semibold text-chalk-700">{title}</p>
      {description && <p className="max-w-md text-sm text-chalk-500">{description}</p>}
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
  const accent: Record<Tone, string> = {
    muted: "text-chalk-900",
    good: "text-field-700",
    ok: "text-sky-700",
    warn: "text-amber-700",
    bad: "text-red-700",
    info: "text-indigo-700",
  };
  return (
    <div className="card card-pad">
      <p className="section-title">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent[tone]}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-chalk-500">{hint}</p>}
    </div>
  );
}

export function ProgressBar({ value, tone = "good" }: { value: number; tone?: Tone }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const fill: Record<Tone, string> = {
    muted: "bg-chalk-400",
    good: "bg-field-500",
    ok: "bg-sky-500",
    warn: "bg-amber-500",
    bad: "bg-red-500",
    info: "bg-indigo-500",
  };
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-chalk-200"
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
  return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>;
}

export function FormSuccess({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p className="rounded-lg bg-field-50 px-3 py-2 text-sm text-field-800">{message}</p>;
}
