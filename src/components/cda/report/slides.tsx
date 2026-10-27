import { ShieldBadge } from "@/components/cda/shield";
import { DOMAIN_LABELS } from "@/lib/cda/rubric";
import { pct, type AreaResult } from "@/lib/cda/scoring";
import type { Domain } from "@prisma-client";

/**
 * The club's preliminary rating document, as slides.
 *
 * This reproduces the deck Football Queensland sends each club — same running
 * order, same tables, same colour coding — from the scores the portal already
 * holds, so the document a club receives and the rating it can challenge are
 * one computation rather than two transcriptions of it.
 *
 * Laid out at a fixed 1334 x 750, which is the 16:9 the originals are drawn
 * at. Fixed rather than fluid on purpose: the deliverable is a PDF with one
 * slide per page, and a layout that reflows would put a table across a page
 * break. The screen view is the same thing scaled, so what the Unit reviews is
 * what the club receives.
 */

export const SLIDE_WIDTH = 1334;
export const SLIDE_HEIGHT = 750;

/**
 * FQ colour-codes the report by domain and has done since 2020, so the colours
 * are part of the document rather than a choice: a club comparing this year's
 * Delivery pages with last year's is looking for the amber ones.
 */
const DOMAIN_TONE: Record<Domain, { title: string; band: string; head: string }> = {
  TECHNICAL: { title: "#cfe2f3", band: "#b4c7e7", head: "#b4c7e7" },
  PLANNING: { title: "#9dc3e6", band: "#bdd7ee", head: "#9dc3e6" },
  DELIVERY: { title: "#ffd966", band: "#ffe699", head: "#ffd966" },
  OUTCOMES: { title: "#a9d18e", band: "#c5e0b4", head: "#a9d18e" },
};

export function Slide({
  children,
  className = "",
  dark = false,
}: {
  children: React.ReactNode;
  className?: string;
  /** The maroon full-bleed slides: covers and dividers. */
  dark?: boolean;
}) {
  return (
    <section
      className={`report-slide ${dark ? "report-slide-dark" : "bg-white"} ${className}`}
      style={{ width: SLIDE_WIDTH, height: SLIDE_HEIGHT }}
    >
      {children}
    </section>
  );
}

/** The maroon bar every content slide carries, with the mark on the right. */
export function SlideHeader({ title, colour = "#ffffff" }: { title: string; colour?: string }) {
  return (
    <header className="flex items-center justify-between bg-maroon-800 px-12 py-4">
      <h2 className="text-4xl font-bold tracking-tight" style={{ color: colour }}>
        {title}
      </h2>
      <Mark />
    </header>
  );
}

/**
 * The Football Queensland mark.
 *
 * Nothing here draws it — the guidelines forbid re-creating the logo — so this
 * renders the official artwork when it has been supplied and the organisation's
 * name set in brand type when it has not. Same arrangement as `BrandLogo`, and
 * the same environment variable.
 */
function Mark() {
  const src = process.env.NEXT_PUBLIC_FQ_LOGO_LIGHT ?? process.env.NEXT_PUBLIC_FQ_LOGO;
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- fixed-size print asset
    return <img src={src} alt="Football Queensland" className="h-14 w-auto" />;
  }
  return (
    <span className="headline text-right text-xs leading-tight text-white/90">
      FOOTBALL
      <br />
      QUEENSLAND
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Covers                                                                     */
/* -------------------------------------------------------------------------- */

export function CoverSlide({
  club,
  year,
  tier,
  subtitle,
}: {
  club: string;
  year: number;
  tier: string;
  subtitle?: string;
}) {
  return (
    <Slide dark>
      <div className="flex h-full flex-col items-center justify-center px-24 text-center">
        <Mark />
        <h1 className="mt-16 text-6xl font-bold text-[#7fd9e8]">{club.toUpperCase()}</h1>
        <p className="mt-4 text-5xl font-bold text-white">CLUB ASSESSMENT {year}</p>
        <p className="mt-6 text-xl text-white/80">
          {subtitle ?? `${tier} Preliminary Rating Score for ${year + 1}`}
        </p>
      </div>
    </Slide>
  );
}

export function DividerSlide({ club, year }: { club: string; year: number }) {
  return (
    <Slide dark>
      <div className="flex h-full flex-col items-center justify-center text-center">
        <p className="text-6xl font-bold text-[#7fd9e8]">{year}</p>
        <p className="mt-4 text-5xl font-bold text-white">CLUB ASSESSMENT</p>
        <p className="mt-8 text-xl text-white/70">{club}</p>
      </div>
    </Slide>
  );
}

/** A slide of prose — the boilerplate pages that open and close the document. */
export function ProseSlide({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Slide>
      <SlideHeader title={title} />
      <div className="report-prose px-12 py-8 text-[17px] leading-relaxed text-maroon-800">
        {children}
      </div>
    </Slide>
  );
}

/* -------------------------------------------------------------------------- */
/* Domain slides                                                              */
/* -------------------------------------------------------------------------- */

type Row = { code: string; title: string; stars: number; weight: number; points: number };

/**
 * One domain's line items, grouped by macro-area.
 *
 * The area subtotal is the column FQ's report is built around and the one a
 * club acts on: "Player Services and Support 48 of 72" names something to fix,
 * where "Planning 82%" does not.
 */
export function DomainTableSlide({
  domain,
  areas,
  earned,
  available,
  goldMin,
}: {
  domain: Domain;
  areas: AreaResult[];
  earned: number;
  available: number;
  /** The Gold bar, which is what FQ's gold/grey cell shading actually marks. */
  goldMin: number;
}) {
  const tone = DOMAIN_TONE[domain];
  const label = domain === "OUTCOMES" ? "OUTCOMES" : DOMAIN_LABELS[domain].toUpperCase();

  return (
    <Slide>
      <SlideHeader title={label} colour={tone.title} />

      <div className="px-6 py-3">
        <table className="w-full border-collapse text-[10px] leading-[1.45]">
          <tbody>
            {areas.map((area) => {
              const rows: Row[] = area.outcomes.map((o) => ({
                code: o.criterion.code,
                title: o.criterion.title,
                stars: o.stars ?? 0,
                weight: o.criterion.weight,
                points: (o.stars ?? 0) * o.criterion.weight,
              }));

              return (
                <Area
                  key={`${area.domain}-${area.area}`}
                  area={area}
                  rows={rows}
                  tone={tone}
                  goldMin={goldMin}
                />
              );
            })}
          </tbody>
        </table>

        <table className="mt-3 w-full border-collapse text-[11px]">
          <tbody>
            <tr>
              <td
                className="w-1/2 border border-ink-300 px-4 py-2 text-center text-base font-semibold text-maroon-900"
                style={{ background: tone.head }}
              >
                {label}
              </td>
              <Total label="Maximum Score" value={available} head={tone.band} />
              <Total label="Score" value={earned} head={tone.band} bold />
              <Total label="Points Missed" value={available - earned} head={tone.band} />
              <Total
                label="% Grade"
                value={pct(available === 0 ? 0 : (earned / available) * 100, 0)}
                head={tone.band}
                bold
                grade={available === 0 ? 0 : (earned / available) * 100}
                goldMin={goldMin}
              />
            </tr>
          </tbody>
        </table>
      </div>
    </Slide>
  );
}

function Area({
  area,
  rows,
  tone,
  goldMin,
}: {
  area: AreaResult;
  rows: Row[];
  tone: { band: string; head: string };
  goldMin: number;
}) {
  const missed = area.available - area.earned;

  return (
    <>
      <tr style={{ background: tone.head }} className="text-[9px]">
        <th
          colSpan={2}
          className="border border-ink-300 px-2 py-[2px] text-left font-semibold whitespace-nowrap uppercase"
        >
          {area.area ?? "Ungrouped"}
        </th>
        {[
          "Club Score",
          "Weighting",
          "Points",
          "Area Maximum Score",
          "Area Score",
          "Points Missed",
          "% Grade for area",
        ].map((h) => (
          <th
            key={h}
            className="border border-ink-300 px-1 py-[2px] text-center font-medium whitespace-nowrap"
          >
            {h}
          </th>
        ))}
      </tr>

      {rows.map((r, i) => (
        <tr key={r.code}>
          <td className="w-10 border border-ink-300 px-2 py-[1px] text-ink-600">{r.code}</td>
          <td className="border border-ink-300 px-2 py-[1px]">{r.title}</td>
          <td className="w-16 border border-ink-300 px-1 py-[1px] text-center tabular-nums">
            {r.stars}
          </td>
          <td className="w-16 border border-ink-300 px-1 py-[1px] text-center tabular-nums">
            {r.weight}
          </td>
          <td className="w-16 border border-ink-300 px-1 py-[1px] text-center tabular-nums">
            {r.points}
          </td>

          {/* The area subtotals span the area's rows, as they do on FQ's own
              sheet — the figure belongs to the block, not to its first line. */}
          {i === 0 && (
            <>
              <td
                rowSpan={rows.length}
                className="w-24 border border-ink-300 text-center text-[15px] tabular-nums"
              >
                {area.available}
              </td>
              <td
                rowSpan={rows.length}
                className="w-20 border border-ink-300 text-center text-[15px] font-semibold tabular-nums"
              >
                {area.earned}
              </td>
              <td
                rowSpan={rows.length}
                className="w-20 border border-ink-300 text-center text-[15px] tabular-nums"
              >
                {missed}
              </td>
              <td
                rowSpan={rows.length}
                className="w-24 border border-ink-300 text-center text-[15px] font-semibold tabular-nums"
                style={{ background: area.percent >= goldMin ? "#ffc000" : "#d9d9d9" }}
              >
                {pct(area.percent, 0)}
              </td>
            </>
          )}
        </tr>
      ))}
    </>
  );
}

function Total({
  label,
  value,
  head,
  bold,
  grade,
  goldMin,
}: {
  label: string;
  value: number | string;
  head: string;
  bold?: boolean;
  grade?: number;
  goldMin?: number;
}) {
  return (
    <td className="border border-ink-300 p-0 text-center align-top">
      <div
        className="border-b border-ink-300 px-3 py-[2px] text-[10px] font-semibold whitespace-nowrap"
        style={{ background: head }}
      >
        {label}
      </div>
      <div
        className={`px-3 py-1 text-base tabular-nums ${bold ? "font-bold" : ""}`}
        style={
          grade !== undefined && goldMin !== undefined
            ? { background: grade >= goldMin ? "#ffc000" : "#d9d9d9" }
            : undefined
        }
      >
        {value}
      </div>
    </td>
  );
}

/** The same areas as a column chart — FQ puts one after every domain table. */
export function DomainChartSlide({ domain, areas }: { domain: Domain; areas: AreaResult[] }) {
  const tone = DOMAIN_TONE[domain];
  const label = domain === "OUTCOMES" ? "OUTCOMES" : DOMAIN_LABELS[domain].toUpperCase();

  return (
    <Slide>
      <SlideHeader title={label} colour={tone.title} />
      <div className="px-16 py-8">
        <div className="rounded bg-ink-100 px-10 pt-6 pb-4">
          <p className="mb-4 text-center text-2xl text-ink-700">{label}</p>
          <div className="flex h-[420px] items-end gap-6 border-b-2 border-ink-800">
            {areas.map((a) => (
              <div key={a.area} className="flex h-full flex-1 flex-col items-center justify-end">
                <div
                  className="flex w-full items-start justify-center pt-2 text-xl font-bold text-white"
                  style={{ height: `${Math.max(a.percent, 6)}%`, background: tone.head }}
                >
                  {pct(a.percent, 0)}
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-6 pt-2">
            {areas.map((a) => (
              <p key={a.area} className="flex-1 text-center text-sm text-ink-700">
                {(a.area ?? "Ungrouped").toUpperCase()}
              </p>
            ))}
          </div>
        </div>
      </div>
    </Slide>
  );
}

/** The Unit's paragraph per area — the part of the report a club acts on. */
export function DomainSummarySlide({
  domain,
  areas,
  notes,
}: {
  domain: Domain;
  areas: AreaResult[];
  notes: Map<string, string>;
}) {
  const tone = DOMAIN_TONE[domain];
  const label = domain === "OUTCOMES" ? "OUTCOMES" : DOMAIN_LABELS[domain].toUpperCase();

  return (
    <Slide>
      <SlideHeader title={`${label} SUMMARY`} colour={tone.title} />
      <div
        className="border-b border-ink-300 py-3 text-center text-3xl font-semibold text-ink-900"
        style={{ background: tone.band }}
      >
        Comments
      </div>
      <div className="space-y-3 px-10 py-6 text-[15px] leading-snug text-ink-900">
        {areas.map((a) => {
          const note = notes.get(`${a.domain}|${a.area ?? ""}`);
          return (
            <p key={a.area}>
              <strong>{a.area}</strong>:{" "}
              {note ?? (
                <span className="text-ink-400">
                  No feedback written for this area yet — add it on the assessment page before
                  sending.
                </span>
              )}
            </p>
          );
        })}
      </div>
    </Slide>
  );
}

/* -------------------------------------------------------------------------- */
/* Summary slides                                                             */
/* -------------------------------------------------------------------------- */

export function RatingSlide({
  rows,
  earned,
  available,
  percent,
  goldMin,
  profile,
}: {
  rows: { domain: Domain; earned: number; available: number }[];
  earned: number;
  available: number;
  percent: number;
  goldMin: number;
  /** FQ's team-profile line, e.g. "FQ Academy Boys - 2x U9s…". */
  profile: string | null;
}) {
  const tone: Record<Domain, string> = {
    TECHNICAL: "#b4c7e7",
    PLANNING: "#9dc3e6",
    DELIVERY: "#ffd966",
    OUTCOMES: "#a9d18e",
  };
  const short: Record<Domain, string> = {
    TECHNICAL: "TECH QUAL",
    PLANNING: "PLANNING",
    DELIVERY: "DELIVERY",
    OUTCOMES: "OUTCOMES",
  };

  return (
    <Slide>
      <SlideHeader title="PRELIMINARY RATING" colour="#7fd9e8" />
      <div className="grid grid-cols-[1fr_1fr] gap-10 px-12 py-10">
        <table className="h-fit w-full border-collapse text-sm">
          <thead>
            <tr>
              <th colSpan={5} className="bg-maroon-800 px-4 py-3 text-center text-2xl font-bold text-white">
                FQ Academy Club Audit Summary
              </th>
            </tr>
            <tr className="bg-maroon-700 text-white">
              <th className="px-3 py-2 text-left font-semibold">OVERALL SCORE</th>
              {["Maximum Score", "Score", "Points Missed", "% Grade"].map((h) => (
                <th key={h} className="px-3 py-2 text-center font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const p = r.available === 0 ? 0 : (r.earned / r.available) * 100;
              return (
                <tr key={r.domain}>
                  <td
                    className="border border-ink-300 px-3 py-2 font-semibold"
                    style={{ background: tone[r.domain] }}
                  >
                    {short[r.domain]}
                  </td>
                  <td className="border border-ink-300 px-3 py-2 text-center text-lg tabular-nums">
                    {r.available}
                  </td>
                  <td className="border border-ink-300 px-3 py-2 text-center text-lg tabular-nums">
                    {r.earned}
                  </td>
                  <td className="border border-ink-300 px-3 py-2 text-center text-lg tabular-nums">
                    {r.available - r.earned}
                  </td>
                  <td
                    className="border border-ink-300 px-3 py-2 text-center text-lg font-bold tabular-nums"
                    style={{ background: p >= goldMin ? "#ffc000" : "#d9d9d9" }}
                  >
                    {pct(p, 0)}
                  </td>
                </tr>
              );
            })}
            <tr>
              <td colSpan={5} className="h-4" />
            </tr>
            <tr>
              <td className="border border-ink-300 bg-maroon-800 px-3 py-3 font-semibold text-white">
                {profile ?? "FQ Academy Boys and Girls"}
              </td>
              <td className="border border-ink-300 px-3 py-3 text-center text-xl tabular-nums">
                {available}
              </td>
              <td className="border border-ink-300 px-3 py-3 text-center text-xl font-bold tabular-nums">
                {earned}
              </td>
              <td className="border border-ink-300 px-3 py-3 text-center text-xl tabular-nums">
                {available - earned}
              </td>
              <td
                className="border border-ink-300 px-3 py-3 text-center text-xl font-bold tabular-nums"
                style={{ background: percent >= goldMin ? "#ffc000" : "#d9d9d9" }}
              >
                {pct(percent, 0)}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="rounded bg-ink-100 px-8 pt-5 pb-3">
          <p className="mb-3 text-center text-xl font-semibold text-ink-800">ACADEMY TOTAL SCORE</p>
          <div className="flex h-[330px] items-end gap-6 border-b-2 border-ink-800">
            {rows.map((r) => {
              const p = r.available === 0 ? 0 : (r.earned / r.available) * 100;
              return (
                <div key={r.domain} className="flex h-full flex-1 flex-col items-center justify-end">
                  <div
                    className="flex w-full items-start justify-center pt-2 text-lg font-bold text-white"
                    style={{ height: `${Math.max(p, 6)}%`, background: tone[r.domain] }}
                  >
                    {pct(p, 0)}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-6 pt-2">
            {rows.map((r) => (
              <p key={r.domain} className="flex-1 text-center text-xs text-ink-700">
                {short[r.domain]}
              </p>
            ))}
          </div>
        </div>
      </div>
    </Slide>
  );
}

export function AwardSlide({
  club,
  year,
  earned,
  percent,
  shield,
  provisional,
  cappedBy,
}: {
  club: string;
  year: number;
  earned: number;
  percent: number;
  shield: Parameters<typeof ShieldBadge>[0]["shield"];
  provisional: Parameters<typeof ShieldBadge>[0]["shield"];
  /** Threshold checks holding the award below what the score earned. */
  cappedBy: string[];
}) {
  return (
    <Slide>
      <SlideHeader title={`SUMMARY OF PRELIMINARY RATING ${year + 1}`} colour="#7fd9e8" />
      <div className="flex h-[520px] flex-col items-center justify-center">
        <table className="border-collapse text-center">
          <thead>
            <tr className="bg-maroon-800 text-white">
              {["CLUB ASSESSMENT", "PRELIMINARY SCORE", "SCORE PERCENTAGE", "PRELIMINARY RATING"].map(
                (h) => (
                  <th key={h} className="border border-maroon-900 px-10 py-4 text-sm font-semibold">
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-ink-400 px-10 py-10 text-lg font-semibold text-ink-800">
                {club}
              </td>
              <td className="border border-ink-400 px-10 py-10 text-3xl font-bold tabular-nums text-maroon-800">
                {earned}
              </td>
              <td className="border border-ink-400 px-10 py-10 text-3xl font-bold tabular-nums text-maroon-800">
                {pct(percent, 0)}
              </td>
              <td className="border border-ink-400 px-10 py-10">
                <ShieldBadge shield={shield} size="lg" />
              </td>
            </tr>
          </tbody>
        </table>

        {/* Said on the slide that carries the shield, not left for the club to
            work out by joining this page to the Non-Negotiables one. */}
        {cappedBy.length > 0 && (
          <p className="mt-6 max-w-3xl text-center text-sm text-maroon-800">
            The score alone earns {labelOf(provisional)}. The award is held at{" "}
            {labelOf(shield)} by {cappedBy.join(", ")}.
          </p>
        )}
      </div>
    </Slide>
  );
}

function labelOf(shield: Parameters<typeof ShieldBadge>[0]["shield"]) {
  if (!shield) return "no shield";
  return shield === "DEVELOPMENT_COMMITTED" ? "Development Committed" : shield.toLowerCase();
}

/** Top five strengths, or top five to improve. Both are the same table. */
export function HighlightSlide({
  title,
  rows,
  derived,
}: {
  title: string;
  rows: { area: string | null; code: string; name: string; stars: number; weight: number }[];
  /** Note that the selection came from the scores rather than from the Unit. */
  derived: boolean;
}) {
  return (
    <Slide>
      <SlideHeader title={title} colour="#ffff00" />
      <table className="w-full border-collapse text-base">
        <thead>
          <tr style={{ background: "#ffff00" }}>
            {["Area", "Line Item", "Points Scored", "Weighting", "Total Score"].map((h) => (
              <th key={h} className="border border-ink-400 px-4 py-3 font-bold text-ink-900">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.code}>
              <td className="border border-ink-400 px-4 py-6 text-center text-ink-800">{r.area}</td>
              <td className="border border-ink-400 px-4 py-6 text-ink-800">
                {r.code} – {r.name}
              </td>
              <td className="border border-ink-400 px-4 py-6 text-center font-semibold tabular-nums">
                {r.stars}
              </td>
              <td className="border border-ink-400 px-4 py-6 text-center font-semibold tabular-nums">
                {r.weight}
              </td>
              <td className="border border-ink-400 px-4 py-6 text-center font-semibold tabular-nums">
                {r.stars * r.weight}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {derived && (
        <p className="report-draft px-6 pt-3 text-xs text-ink-500">
          Ranked from the scores. Football Queensland&apos;s own selection is curated — review
          before sending.
        </p>
      )}
    </Slide>
  );
}
