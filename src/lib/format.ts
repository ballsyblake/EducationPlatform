const DATE_TIME = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const DATE_ONLY = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function formatDateTime(date: Date | null | undefined) {
  return date ? DATE_TIME.format(date) : "—";
}

export function formatDate(date: Date | null | undefined) {
  return date ? DATE_ONLY.format(date) : "—";
}

/** Value for a `datetime-local` input, in the server's local time. */
export function toDateTimeLocal(date: Date | null | undefined) {
  if (!date) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function relativeDue(due: Date | null | undefined, now = new Date()) {
  if (!due) return { text: "No due date", overdue: false, soon: false };

  const diffMs = due.getTime() - now.getTime();
  const overdue = diffMs < 0;
  const abs = Math.abs(diffMs);
  const days = Math.floor(abs / 86_400_000);
  const hours = Math.floor(abs / 3_600_000);

  let span: string;
  if (days >= 1) span = `${days} day${days === 1 ? "" : "s"}`;
  else if (hours >= 1) span = `${hours} hour${hours === 1 ? "" : "s"}`;
  else span = `${Math.max(1, Math.floor(abs / 60_000))} min`;

  return {
    text: overdue ? `Overdue by ${span}` : `Due in ${span}`,
    overdue,
    soon: !overdue && diffMs < 2 * 86_400_000,
  };
}

export function initials(name: string | null | undefined, email: string) {
  const source = name?.trim() || email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?").concat(parts[1]?.[0] ?? "").toUpperCase();
}

export function displayName(user: { name: string | null; email: string }) {
  return user.name?.trim() || user.email;
}
