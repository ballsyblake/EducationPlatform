import { Fragment } from "react";
import Link from "next/link";
import {
  AssessmentAreasSlide,
  CategoriesSlide,
  ClosingSlide,
  DeliveryProcessSlide,
  DisclaimerSlide,
  NextStepsSlide,
  ProcessCycleSlide,
  ProcessSlide,
  PurposeSlide,
  RatingSlideBoilerplate,
  ReviewAppealSlide,
  ScopeSlide,
} from "@/components/cda/report/boilerplate";
import {
  NonNegotiableCommentsSlide,
  NonNegotiablesSlide,
  TechnicalSlide,
  type CheckRow,
} from "@/components/cda/report/checks";
import {
  AwardSlide,
  CoverSlide,
  DividerSlide,
  DomainChartSlide,
  DomainSummarySlide,
  DomainTableSlide,
  HighlightSlide,
  ProseSlide,
  RatingSlide,
} from "@/components/cda/report/slides";
import { requireCdu } from "@/lib/cda/access";
import { areaKey, loadAssessment } from "@/lib/cda/assessment";
import { ASSESSED_DOMAINS } from "@/lib/cda/rubric";
import type { Domain } from "@prisma-client";

export const metadata = { title: "Preliminary rating report" };

/**
 * The club's preliminary rating, as the document Football Queensland sends.
 *
 * Thirty-three slides in FQ's own running order, built from the scores the
 * portal already holds. It exists because the document was being typed: the
 * overall workbooks were copied into a per-club rubric sheet, and the rubric
 * sheet was copied into a deck. Two transcriptions, the second producing the
 * artefact the club actually acts on — so when the deck and the master
 * disagreed, the club was working from the wrong number and nothing detected
 * it. FQ's own 2026 deck for Brisbane City has exactly that: D16 is 12 points
 * on the Delivery table and 18 on the "areas to improve" slide seven pages
 * later.
 *
 * Print to PDF for the file that goes to the club. The slides are fixed at the
 * 16:9 the originals are drawn at and the page box matches, so one slide is one
 * page with nothing reflowed across a break.
 *
 * The Unit's own view carries a readiness panel that the printed copy does not.
 * Everything else on screen is what the club receives.
 */
export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCdu();
  const { id } = await params;
  const overview = await loadAssessment(id);

  const { assessment, areas, areaNotes, rating, technical } = overview;
  const club = assessment.club.name;
  const year = assessment.cycle.year;
  const tier = rating.tier === "T2" ? "Tier 2" : "Tier 1";

  /* ------------------------------- checks --------------------------------- */

  const checks: CheckRow[] = assessment.nonNegotiables.map((r) => ({
    code: r.nonNegotiable.code,
    title: r.nonNegotiable.title,
    description: r.nonNegotiable.description,
    format: r.nonNegotiable.format,
    verdict: r.verdict,
    threshold: r.nonNegotiable.kind === "SHIELD_THRESHOLD",
    shieldMet: r.shieldMet,
    note: r.adminNote,
  }));

  /* ----------------------------- highlights ------------------------------- */

  // Flattened across the three scored domains. Technical has no line items, so
  // it cannot appear in either list — which matches FQ's own, where every row
  // carries a P, D or O code.
  const items = areas.flatMap((a) =>
    a.outcomes.map((o) => ({
      area: a.area,
      code: o.criterion.code,
      name: o.criterion.title,
      stars: o.stars ?? 0,
      weight: o.criterion.weight,
      points: (o.stars ?? 0) * o.criterion.weight,
      missed: (o.criterion.maxScore - (o.stars ?? 0)) * o.criterion.weight,
    })),
  );

  // Strengths: the best-scoring item in each of five different areas, which is
  // the shape of FQ's own list — five areas, never two from one. Improvements
  // are ranked on points missed and allowed to repeat an area, also theirs.
  const strengths: typeof items = [];
  for (const item of [...items].sort((a, b) => b.points - a.points)) {
    if (strengths.length === 5) break;
    if (strengths.some((s) => s.area === item.area)) continue;
    strengths.push(item);
  }
  const improve = [...items].sort((a, b) => b.missed - a.missed).slice(0, 5);

  /* ------------------------------ readiness ------------------------------- */

  const missingNotes = areas.filter((a) => !areaNotes.get(areaKey(a.domain, a.area)));
  const blockers = [
    overview.unresolved.length > 0 &&
      `${overview.unresolved.length} line item${overview.unresolved.length === 1 ? " is" : "s are"} still unreconciled`,
    missingNotes.length > 0 &&
      `${missingNotes.length} area${missingNotes.length === 1 ? "" : "s"} have no written feedback`,
    !assessment.summary && "No overall assessment summary has been written",
    rating.eligibility.pending.length > 0 &&
      `${rating.eligibility.pending.length} Non-Negotiable${rating.eligibility.pending.length === 1 ? " is" : "s are"} unverified`,
  ].filter(Boolean) as string[];

  const domains: Domain[] = [...ASSESSED_DOMAINS];
  const areasFor = (d: Domain) => areas.filter((a) => a.domain === d);

  return (
    <>
      <style>{PRINT_CSS}</style>

      <div className="report-chrome mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href={`/cda/cdu/assessments/${id}`} className="text-sm text-ink-500 hover:text-maroon-700">
            ← Assessment
          </Link>
          <h1 className="headline text-2xl text-ink-900">
            {club} — {year} preliminary rating
          </h1>
          <p className="text-sm text-ink-600">
            Print this page to produce the PDF that goes to the club. One slide per page.
          </p>
        </div>

        <div className={`card card-pad max-w-xl ${blockers.length ? "border-maroon-300" : ""}`}>
          <p className="font-semibold text-ink-900">
            {blockers.length === 0 ? "Ready to send" : "Not ready to send"}
          </p>
          {blockers.length === 0 ? (
            <p className="mt-1 text-sm text-ink-600">
              Every line item is reconciled, every area has feedback, and the checks are verified.
            </p>
          ) : (
            <ul className="mt-1 list-disc pl-5 text-sm text-ink-700">
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
          {!overview.frozen && (
            <p className="mt-2 text-xs text-ink-500">
              This assessment is not locked, so these figures still move as the Unit resolves
              scores. Lock it before sending.
            </p>
          )}
        </div>
      </div>

      <div className="report-root">
        {/* 1-13: Football Queensland's standing pages. */}
        <CoverSlide club={club} year={year} tier={tier} />
        <DisclaimerSlide year={year} />
        <PurposeSlide />
        <ProcessCycleSlide />
        <AssessmentAreasSlide />
        <ScopeSlide year={year} />
        <ProseSlide title="SHIFTING WEIGHTING WITHIN THE CLUB ASSESSMENT">
          <p>
            The balance between the four assessment areas has moved deliberately since 2020:
            Planning has reduced as clubs have established their core documents, while Delivery and
            Outcomes have grown as the focus has shifted to what reaches the pitch and what it
            produces.
          </p>
          <table className="mt-6 w-full border-collapse text-center text-sm">
            <thead>
              <tr className="bg-ink-100">
                <th className="border border-ink-300 px-4 py-2">Area</th>
                <th className="border border-ink-300 px-4 py-2">Share of the {year} rating</th>
              </tr>
            </thead>
            <tbody>
              {(["TECHNICAL", "PLANNING", "DELIVERY", "OUTCOMES"] as Domain[]).map((d) => (
                <tr key={d}>
                  <td className="border border-ink-300 px-4 py-2">{SHARE_LABELS[d]}</td>
                  <td className="border border-ink-300 px-4 py-2 tabular-nums">
                    {rating.shares[d].toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-sm text-ink-600">
            A domain&apos;s share is how many of the available points sit in it, not a figure set
            anywhere.
          </p>
        </ProseSlide>
        <ProcessSlide />
        <DeliveryProcessSlide />
        <RatingSlideBoilerplate year={year} />
        <CategoriesSlide
          goldMin={assessment.cycle.goldMin}
          silverMin={assessment.cycle.silverMin}
          bronzeMin={assessment.cycle.bronzeMin}
        />
        <ProseSlide title="CLUB SHIELDS">
          <p>
            Clubs can only communicate a &lsquo;confirmed&rsquo; Academy Assessment rating by
            displaying their Club Shield. Once confirmed, the Club Shield is presented as a digital
            design and serves as a club snapshot of standards based on a three-part measuring
            system (Planning, Delivery and Outcomes).
          </p>
          <p>
            These visual Club Shields will be available on the FQ website, and each club will have
            the opportunity to place their Club Shield on their own social media and club
            collateral.
          </p>
        </ProseSlide>
        <ReviewAppealSlide />

        {/* 14-31: this club. */}
        <DividerSlide club={club} year={year} />
        <NonNegotiablesSlide checks={checks} />
        <NonNegotiableCommentsSlide club={club} checks={checks} target={rating.provisionalShield} />
        <TechnicalSlide
          earned={technical.earned}
          available={technical.available}
          profile={null}
          note={areaNotes.get(areaKey("TECHNICAL", null)) ?? null}
          unfilled={technical.unfilledRoles.map((r) => r.label)}
        />

        {domains.map((d) => (
          <Fragment key={d}>
            <DomainTableSlide
              domain={d}
              areas={areasFor(d)}
              earned={rating.points[d].earned}
              available={rating.points[d].available}
              goldMin={assessment.cycle.goldMin}
            />
            <DomainChartSlide domain={d} areas={areasFor(d)} />
            <DomainSummarySlide domain={d} areas={areasFor(d)} notes={areaNotes} />
          </Fragment>
        ))}

        <HighlightSlide title={`TOP 5 STRENGTHS IN ${year}`} rows={strengths} derived />
        <HighlightSlide title={`TOP 5 AREAS TO IMPROVE FOR ${year + 1}`} rows={improve} derived />

        <ProseSlide title="ASSESSMENT SUMMARY">
          {assessment.summary ? (
            assessment.summary.split("\n").filter(Boolean).map((p, i) => <p key={i}>{p}</p>)
          ) : (
            <p className="report-draft text-ink-400">
              No overall summary has been written for this club yet — add it on the assessment page
              before sending.
            </p>
          )}
        </ProseSlide>

        <RatingSlide
          rows={(["TECHNICAL", "PLANNING", "DELIVERY", "OUTCOMES"] as Domain[]).map((d) => ({
            domain: d,
            earned: rating.points[d].earned,
            available: rating.points[d].available,
          }))}
          earned={rating.earned}
          available={rating.available}
          percent={rating.percent}
          goldMin={assessment.cycle.goldMin}
          profile={null}
        />
        <AwardSlide
          club={club}
          year={year}
          earned={rating.earned}
          percent={rating.percent}
          shield={rating.shield}
          provisional={rating.provisionalShield}
          cappedBy={rating.cappedDown ? rating.eligibility.cappedBy.map((c) => c.title) : []}
        />

        {/* 32-33. */}
        <NextStepsSlide />
        <ClosingSlide year={year} />
      </div>
    </>
  );
}

const SHARE_LABELS: Record<Domain, string> = {
  TECHNICAL: "Technical Staff Qualifications",
  PLANNING: "Planning",
  DELIVERY: "Delivery",
  OUTCOMES: "Outcomes",
};

/**
 * Fixed-size slides, one per printed page.
 *
 * The page box matches the slide exactly, so nothing is scaled and no table
 * lands across a break. Printing isolates the deck with the visibility trick
 * rather than by hiding the app's own chrome by selector: the chrome lives in a
 * layout this route does not own, and a selector written against it would stop
 * working the first time that layout changed — silently, in the document that
 * goes to clubs.
 */
const PRINT_CSS = `
.report-slide {
  position: relative;
  overflow: hidden;
  margin: 0 auto 1.5rem;
  box-shadow: 0 1px 3px rgba(0,0,0,.18);
}
.report-slide-dark {
  background: radial-gradient(120% 120% at 70% 20%, #7a1437 0%, #4d0d24 60%, #3b0a1c 100%);
}
.report-prose > p { margin-bottom: 0.85rem; }
/* Wider than the app's content column on purpose: the slide is a fixed size
   and must not be clipped by the shell it is previewed in. The page scrolls. */
.report-root { width: 1334px; }

@page { size: 1334px 750px; margin: 0; }

@media print {
  body * { visibility: hidden; }
  .report-root, .report-root * { visibility: visible; }
  .report-root { position: absolute; left: 0; top: 0; overflow: visible; }
  .report-chrome { display: none !important; }
  .report-slide {
    margin: 0;
    box-shadow: none;
    break-after: page;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .report-slide:last-child { break-after: auto; }
}
`;
