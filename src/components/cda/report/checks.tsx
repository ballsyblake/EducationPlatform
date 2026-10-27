import { Slide, SlideHeader } from "@/components/cda/report/slides";
import { SHIELD_LABELS } from "@/lib/cda/rubric";
import { pct } from "@/lib/cda/scoring";
import type { NonNegotiableVerdict, Shield } from "@prisma-client";

/**
 * The Non-Negotiables pages, and the Technical Qualifications page.
 *
 * Kept apart from the domain slides because they are shaped differently: the
 * Non-Negotiables are a compliance register with a pass or a level rather than
 * a score, and Technical has no line items at all — its points come from the
 * staff register against a team profile.
 */

export type CheckRow = {
  code: string;
  title: string;
  description: string;
  format: string | null;
  verdict: NonNegotiableVerdict;
  threshold: boolean;
  shieldMet: Shield | null;
  note: string | null;
};

/** FQ prints a bare Yes or No; the two states that are neither say so. */
function answer(verdict: NonNegotiableVerdict) {
  if (verdict === "PASS") return { text: "Yes", bg: "#92d050", fg: "#0b3b00" };
  if (verdict === "FAIL") return { text: "No", bg: "#ff0000", fg: "#ffffff" };
  if (verdict === "ON_NOTICE") return { text: "On Notice", bg: "#ffc000", fg: "#4a3000" };
  return { text: "Not yet checked", bg: "#d9d9d9", fg: "#404040" };
}

export function NonNegotiablesSlide({ checks }: { checks: CheckRow[] }) {
  return (
    <Slide>
      <SlideHeader title="NON-NEGOTIABLES" colour="#ff5a5a" />
      <table className="w-full border-collapse text-[11px] leading-snug">
        <thead>
          <tr className="bg-ink-800 text-white">
            <th className="w-48 border border-ink-400 px-2 py-1">NON NEGOTIABLES</th>
            <th className="border border-ink-400 px-2 py-1">EXPLANATION</th>
            <th className="w-44 border border-ink-400 px-2 py-1">FORMAT</th>
            <th className="w-24 border border-ink-400 px-2 py-1">Yes / No</th>
          </tr>
        </thead>
        <tbody>
          {checks.map((c) => {
            const a = answer(c.verdict);
            return (
              <tr key={c.code}>
                <td
                  className="border border-ink-400 px-2 py-2 text-center font-semibold text-white"
                  style={{ background: "#ff5a5a" }}
                >
                  {c.title}
                </td>
                <td className="border border-ink-400 px-2 py-2 align-top text-ink-900">
                  {c.description}
                </td>
                <td className="border border-ink-400 px-2 py-2 text-center font-semibold text-ink-900">
                  {c.format ?? "Electronic submission"}
                </td>
                <td
                  className="border border-ink-400 px-2 py-2 text-center font-bold"
                  style={{ background: a.bg, color: a.fg }}
                >
                  {a.text}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Slide>
  );
}

/**
 * The commentary on the checks the club did not simply pass.
 *
 * Only those: a club that met everything does not need nine paragraphs saying
 * so, and FQ's own version lists the exceptions. The threshold checks appear
 * whatever their level, because "Silver Met" on a club chasing Gold is the
 * single most consequential line in the document.
 */
export function NonNegotiableCommentsSlide({
  club,
  checks,
  target,
}: {
  club: string;
  checks: CheckRow[];
  /** The shield the score alone earned, which is what the levels are read against. */
  target: Shield | null;
}) {
  const notable = checks.filter(
    (c) => c.threshold || c.verdict === "FAIL" || c.verdict === "ON_NOTICE" || c.verdict === "PENDING",
  );

  return (
    <Slide>
      <SlideHeader title="NON-NEGOTIABLES" colour="#ff5a5a" />
      <div className="py-2 text-center text-2xl font-bold text-ink-900" style={{ background: "#ff5a5a" }}>
        Comments
      </div>
      <div className="px-10 py-5 text-[15px] leading-snug text-ink-900">
        {notable.length === 0 ? (
          <p>{club} meets every Non-Negotiable standard.</p>
        ) : (
          <>
            <p className="mb-3">
              {club}&apos;s position against the Non-Negotiable standards
              {target ? `, read against ${SHIELD_LABELS[target]}` : ""}:
            </p>
            <ul className="space-y-2">
              {notable.map((c) => (
                <li key={c.code}>
                  <span className="font-bold">
                    {c.code} — {c.title.toUpperCase()}
                  </span>{" "}
                  — <Verdict check={c} />
                  {c.note && <p className="mt-0.5 pl-4 text-ink-700">{c.note}</p>}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm">
              Clubs can only be on notice for the same line item for one season and no more than
              one line item in a year. Repeated non-compliance may result in a lower shield rating.
            </p>
          </>
        )}
      </div>
    </Slide>
  );
}

function Verdict({ check }: { check: CheckRow }) {
  if (check.threshold) {
    if (check.verdict === "ON_NOTICE") return <span className="font-semibold text-[#c00000]">On Notice</span>;
    if (check.shieldMet)
      return (
        <span className="font-semibold text-ink-700">{SHIELD_LABELS[check.shieldMet]} Met</span>
      );
    return <span className="font-semibold text-ink-500">Not yet recorded</span>;
  }
  if (check.verdict === "FAIL") return <span className="font-semibold text-[#c00000]">Not Met</span>;
  if (check.verdict === "PENDING")
    return <span className="font-semibold text-ink-500">Not yet checked</span>;
  return <span className="font-semibold text-[#2e7d32]">Met</span>;
}

/* -------------------------------------------------------------------------- */

export function TechnicalSlide({
  earned,
  available,
  profile,
  note,
  unfilled,
}: {
  earned: number;
  available: number;
  /** FQ's team-profile line; the maximum is derived from it. */
  profile: string | null;
  note: string | null;
  /** Roles the club has nobody in — the most actionable thing on the page. */
  unfilled: string[];
}) {
  const percent = available === 0 ? 0 : (earned / available) * 100;

  return (
    <Slide>
      <SlideHeader title="TECHNICAL STAFF QUALIFICATIONS" colour="#cfe2f3" />
      <div className="px-12 py-10">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr style={{ background: "#b4c7e7" }}>
              <th className="border border-ink-400 px-4 py-2 font-semibold">
                TECHNICAL STAFF QUALIFICATION
              </th>
              {["Maximum Score", "Score", "Points Missed", "% Grade"].map((h) => (
                <th key={h} className="w-36 border border-ink-400 px-3 py-2 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-ink-400 px-4 py-4 text-center text-ink-800">
                {profile ?? "Club team profile not recorded"}
              </td>
              <td className="border border-ink-400 px-3 py-4 text-center text-2xl tabular-nums">
                {available}
              </td>
              <td className="border border-ink-400 px-3 py-4 text-center text-2xl tabular-nums">
                {earned}
              </td>
              <td className="border border-ink-400 px-3 py-4 text-center text-2xl tabular-nums">
                {available - earned}
              </td>
              <td className="border border-ink-400 bg-ink-200 px-3 py-4 text-center text-2xl font-bold tabular-nums">
                {pct(percent, 0)}
              </td>
            </tr>
          </tbody>
        </table>

        <table className="mt-10 w-full border-collapse text-sm">
          <thead>
            <tr style={{ background: "#b4c7e7" }}>
              <th className="w-72 border border-ink-400 px-4 py-2 font-semibold">ITEM</th>
              <th className="border border-ink-400 px-4 py-2 font-semibold">Comments</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-ink-400 px-4 py-6 text-center text-lg text-ink-800">
                Technical Staff Qualification
              </td>
              <td className="border border-ink-400 px-4 py-6 align-top leading-snug text-ink-900">
                {note ?? (
                  <span className="report-draft text-ink-400">
                    No commentary written yet — add it on the assessment page before sending.
                  </span>
                )}
                {unfilled.length > 0 && (
                  <p className="mt-2 text-ink-700">
                    Roles with nobody appointed: {unfilled.join(", ")}.
                  </p>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Slide>
  );
}
