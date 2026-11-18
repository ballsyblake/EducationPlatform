import Link from "next/link";
import { Badge, EmptyState, PageHeader, StatTile, type Tone } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { listRegister, registerSummary, type RegisterRow } from "@/lib/coach-register";
import { formatDate } from "@/lib/format";
import { CoachDbImportForm } from "./import-form";

export const metadata = { title: "Coach register" };

const STATUS_TONE: Record<string, Tone> = {
  ACTIVE: "good",
  NOT_COACHING: "muted",
  UNKNOWN: "muted",
};

const RATING_TONE = (rating: number | null): Tone => {
  if (rating === null) return "muted";
  // 2.5 is the pass mark on every AFC/FA diploma — see Course.ratingThreshold.
  if (rating >= 3.5) return "good";
  if (rating >= 2.5) return "ok";
  return "warn";
};

function expiryTone(date: Date | null): Tone {
  if (!date) return "muted";
  const months = (date.getTime() - Date.now()) / (30 * 24 * 60 * 60 * 1000);
  if (months < 0) return "bad";
  if (months < 12) return "warn";
  return "muted";
}

function Row({ row }: { row: RegisterRow }) {
  return (
    <tr className="align-top">
      <td className="px-4 py-2">
        <span className="font-medium text-ink-800">{row.name ?? row.email}</span>
        <div className="text-xs text-ink-500">
          {row.email}
          {row.faNumber ? ` · fa.${row.faNumber}` : ""}
        </div>
        {row.statusNote && (
          <div className="mt-0.5 text-xs text-status-orange-fg">{row.statusNote}</div>
        )}
      </td>
      <td className="px-3 py-2 text-xs text-ink-600">
        {row.club ?? "—"}
        {row.club && !row.clubMatched && (
          <span className="ml-1 text-status-orange-fg">not on the affiliate list</span>
        )}
        {row.region && <div className="text-ink-500">{row.region}</div>}
      </td>
      <td className="px-3 py-2 text-xs text-ink-600">
        {row.qualifications.length ? (
          <ul className="space-y-0.5">
            {row.qualifications.map((q) => (
              <li key={q.name}>
                {q.name}
                {q.expiresAt && (
                  <span className={expiryTone(q.expiresAt) === "muted" ? "text-ink-500" : "text-status-orange-fg"}>
                    {" "}
                    · to {formatDate(q.expiresAt)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          "—"
        )}
      </td>
      <td className="px-3 py-2">
        {row.internalRating === null ? (
          <span className="text-xs text-ink-400">unrated</span>
        ) : (
          <Badge tone={RATING_TONE(row.internalRating)}>{row.internalRating}</Badge>
        )}
      </td>
      <td className="px-3 py-2">
        {row.bDiplomaInterest === "YES" ? (
          <Badge tone="info">Interested</Badge>
        ) : (
          <span className="text-xs text-ink-400">
            {row.bDiplomaInterest === "NO" ? "no" : "not asked"}
          </span>
        )}
      </td>
      <td className="px-3 py-2">
        {row.coachingStatus === "UNKNOWN" ? (
          <span className="text-xs text-ink-400">—</span>
        ) : (
          <Badge tone={STATUS_TONE[row.coachingStatus]}>
            {row.coachingStatus === "ACTIVE" ? "Coaching" : "Not coaching"}
          </Badge>
        )}
      </td>
      <td className="px-3 py-2 text-center text-xs tabular-nums text-ink-600">
        {row.enrolments || "—"}
      </td>
    </tr>
  );
}

/**
 * The coach register, and the one route that loads it.
 *
 * Every coach FQ holds a qualification for, which is a much longer list than
 * the coaches this platform has run a cohort for: 1,648 of these are on no
 * course here at all. `/admin/coaches` is the other half of the same word — a
 * row per enrolment, where somebody is up to on a course — and this is a row
 * per person.
 *
 * The filters are the questions the spreadsheet held the answers to and could
 * not be asked. "How many C Diploma coaches in Wide Bay", "whose licence
 * lapses this year", "who has asked about the B Diploma" were each one column
 * of a sheet, and each of them needed somebody to sort the file by hand.
 *
 * Admin only, like the rest of the register. The page shows every coach FQ
 * holds a record for, with their address and FQ's own judgement of them on the
 * row, which is not an educator's to read across the whole state.
 */
export default async function CoachDbPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    qualification?: string;
    region?: string;
    rating?: string;
    expiry?: string;
    interest?: string;
  }>;
}) {
  await requireAdmin();
  const filters = await searchParams;
  // The box is named `q` in the URL, like the one on /admin/coaches, and the
  // filter it feeds is called `query`. Mapped here rather than renamed either
  // end: a shared name for the search box across the two pages is worth more
  // than a shared name between a query string and a type.
  const [summary, page] = await Promise.all([
    registerSummary(),
    listRegister({ ...filters, query: filters.q }),
  ]);

  const href = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...filters, ...patch })) {
      if (value) next.set(key, value);
    }
    const qs = next.toString();
    return qs ? `/admin/coach-db?${qs}` : "/admin/coach-db";
  };

  const filtered = Object.values(filters).some(Boolean);

  return (
    <div className="space-y-8">
      <PageHeader
        breadcrumb={{ href: "/admin", label: "Manage" }}
        title="Coach register"
        subtitle="Every coach Football Queensland holds a qualification for — their club, their licences and FQ's own rating of them."
      />

      {summary.coaches > 0 && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <StatTile label="Coaches" value={summary.coaches} />
            <StatTile
              label="Rated by FQ"
              value={summary.rated}
              hint={`${summary.coaches - summary.rated} unrated`}
              href={href({ rating: "rated" })}
            />
            <StatTile
              label="Licence lapsing"
              value={summary.expiringWithin12Months}
              tone={summary.expiringWithin12Months ? "warn" : "good"}
              hint="Within twelve months"
              href={href({ expiry: "expiring" })}
            />
            <StatTile
              label="B Diploma interest"
              value={summary.interested}
              tone={summary.interested ? "info" : "muted"}
              href={href({ interest: "yes" })}
            />
            <StatTile
              label="At a club"
              value={summary.withClub}
              hint={
                summary.unmatchedClubs
                  ? `${summary.unmatchedClubs} club names unmatched`
                  : "All matched to the affiliate list"
              }
            />
          </div>

          <form action="/admin/coach-db" className="flex flex-wrap items-center gap-2">
            {/* The other filters ride along, so searching a name doesn't throw
                away the region you picked to get there. */}
            {Object.entries(filters)
              .filter(([key, value]) => key !== "q" && value)
              .map(([key, value]) => (
                <input key={key} type="hidden" name={key} value={value} />
              ))}
            <input
              name="q"
              defaultValue={filters.q ?? ""}
              placeholder="Search a name, an address, an FA number…"
              aria-label="Search the register"
              className="input w-full max-w-sm px-3 py-1.5 text-sm"
            />
            <button type="submit" className="btn-secondary btn-sm">
              Search
            </button>
            {filtered && (
              <Link href="/admin/coach-db" className="text-xs text-ink-500 underline">
                Clear every filter
              </Link>
            )}
          </form>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase tracking-wide text-ink-500">Qualification</span>
              <Link
                href={href({ qualification: undefined })}
                className={filters.qualification ? "btn-secondary btn-sm" : "btn-primary btn-sm"}
              >
                Any
              </Link>
              {summary.byQualification.slice(0, 8).map((q) => (
                <Link
                  key={q.name}
                  href={href({ qualification: q.name })}
                  className={
                    filters.qualification === q.name ? "btn-primary btn-sm" : "btn-secondary btn-sm"
                  }
                >
                  {q.name} ({q.count})
                </Link>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase tracking-wide text-ink-500">Region</span>
              <Link
                href={href({ region: undefined })}
                className={filters.region ? "btn-secondary btn-sm" : "btn-primary btn-sm"}
              >
                Any
              </Link>
              {summary.byRegion.map((r) => (
                <Link
                  key={r.region}
                  href={href({ region: r.region })}
                  className={
                    filters.region === r.region ? "btn-primary btn-sm" : "btn-secondary btn-sm"
                  }
                >
                  {r.region} ({r.count})
                </Link>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm text-ink-500">
              {page.total} coach{page.total === 1 ? "" : "es"}
              {filtered ? (page.total === 1 ? " matches these filters" : " match these filters") : ""}
              {summary.lastImport
                ? ` · last imported ${formatDate(summary.lastImport.at)}${
                    summary.lastImport.source ? ` from ${summary.lastImport.source}` : ""
                  }`
                : ""}
            </p>
            {page.rows.length ? (
              <div className="card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-500">
                    <tr>
                      <th className="px-4 py-2 font-medium">Coach</th>
                      <th className="px-3 py-2 font-medium">Club</th>
                      <th className="px-3 py-2 font-medium">Qualifications</th>
                      <th className="px-3 py-2 font-medium">FQ rating</th>
                      <th className="px-3 py-2 font-medium">B Diploma</th>
                      <th className="px-3 py-2 font-medium">Coaching</th>
                      <th className="px-3 py-2 font-medium">Courses</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-200">
                    {page.rows.map((row) => (
                      <Row key={row.userId} row={row} />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="No coach matches those filters"
                description="Clear one of them, or search a name instead."
              />
            )}
            {!page.complete && (
              <p className="mt-2 text-xs text-ink-500">
                Showing the first {page.rows.length} of {page.total}. Narrow it with a filter or a
                search.
              </p>
            )}
          </div>
        </>
      )}

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-ink-900">
            {summary.coaches ? "Import the workbook again" : "Import the coach database"}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-ink-600">
            Reads FQ&rsquo;s coach database workbook and shows what it would do before it does it.
            An import fills fields in and never empties one out, so a blank club or a missing region
            in the spreadsheet cannot delete what somebody has since filled in here — and a
            &ldquo;No rating&rdquo; cell can never land on top of a real rating, which is how 336 of
            them went missing in the file.
          </p>
        </div>
        <div className="card card-pad">
          <CoachDbImportForm />
        </div>
      </section>
    </div>
  );
}
