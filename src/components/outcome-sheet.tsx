import { Avatar } from "@/components/avatar";
import { BrandLogo } from "@/components/brand";
import {
  RATING_GUIDE,
  type OutcomeDelivery,
  type OutcomeSheet,
} from "@/lib/outcome";

/**
 * FQ's coach assessment outcome document, one coach to a page.
 *
 * Laid out off their own `C - LICENCE COACH ASSESSMENT` form: header band,
 * photo and name, the session block, the rating guide, the evidence, the action
 * plan, and the overall rating with the three outcomes beside it. Styled for
 * paper rather than for the app — borders instead of shadows, black on white,
 * and a page break between coaches — because the thing people do with it is
 * print it or save it as a PDF and send it.
 *
 * A plain server component with no interactivity in it: the only control on the
 * page is the browser's own print dialog, and anything that needed JavaScript
 * to render would be a thing that could be missing from the printout.
 */

/** A blank that still gives an empty cell its height on paper. */
const NBSP = "\u00a0";

/** The outcomes, in the order FQ's form prints them. */
const OUTCOMES = [
  "Highly Competent",
  "Competent",
  "Not yet competent",
] as const;

/** An empty value prints as the form's rule, not as a dash. */
function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex min-w-0 gap-2 px-3 py-2">
      <span className="shrink-0 text-[11px] font-semibold tracking-[0.06em] text-ink-600 uppercase">
        {label}
      </span>
      <span className="min-w-0 flex-1 border-b border-ink-300 text-sm text-ink-900">
        {value || NBSP}
      </span>
    </div>
  );
}

function SheetHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-4 bg-maroon-800 px-3 py-1.5 text-[11px] font-semibold tracking-[0.08em] text-white uppercase print:bg-ink-100 print:text-ink-900">
      {children}
    </h3>
  );
}

function DeliveryBlock({
  delivery,
  only,
}: {
  delivery: OutcomeDelivery;
  only: boolean;
}) {
  return (
    <section>
      {/* With one write-up the form's own unnumbered session block is right.
          With several, each needs saying which delivery it is, or the coach has
          three identical blocks and no way to tell them apart. */}
      {!only && (
        <p className="mt-4 text-[11px] font-semibold tracking-[0.06em] text-maroon-800 uppercase">
          Delivery {delivery.deliveryNo}
        </p>
      )}

      {/* The form's 2x3 block of facts, ruled. `divide-*` rather than borders
          on each field: the grid wraps to one column on a narrow screen, and
          per-cell borders double up wherever it does. */}
      <div className="mt-2 grid divide-y divide-ink-200 border border-ink-300 sm:grid-cols-2 sm:divide-x">
        <Field label="Assessor" value={delivery.assessor} />
        <Field label="Block / when" value={delivery.block} />
        <Field label="Component" value={delivery.component} />
        <Field label="Topic" value={delivery.topic} />
        <Field label="Date" value={delivery.date} />
        <Field label="Session" value={delivery.session} />
      </div>

      <SheetHeading>Assessor comment / evidence</SheetHeading>
      <p className="min-h-20 border border-t-0 border-ink-300 px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap text-ink-900">
        {delivery.comment || NBSP}
      </p>

      <SheetHeading>Action plan</SheetHeading>
      <ol className="border border-t-0 border-ink-300 text-sm text-ink-900">
        {/* Three rows whether or not three were written. The form is something a
            coach works through, and an action plan with room left on it reads as
            a plan rather than as a finished list. */}
        {[0, 1, 2].map((i) => (
          <li
            key={i}
            className="flex gap-2 border-b border-ink-200 px-3 py-2 last:border-b-0"
          >
            <span className="shrink-0 font-semibold text-ink-600">
              {i + 1}.
            </span>
            <span className="min-w-0 flex-1 whitespace-pre-wrap">
              {delivery.actions[i] || NBSP}
            </span>
          </li>
        ))}
      </ol>

      {/* The session's own numbers. Separate from the overall rating at the
          foot, and labelled, because the two have been confused on paper. */}
      {(delivery.rating !== null || delivery.points) && (
        <p className="mt-1.5 text-[11px] text-ink-600">
          {delivery.rating !== null && (
            <>This session: {delivery.rating.toFixed(1)} / 5. </>
          )}
          {delivery.points && (
            <>
              FA rubric {delivery.points.scored} / {delivery.points.total} —{" "}
              {delivery.points.outcome}.
            </>
          )}
        </p>
      )}
    </section>
  );
}

export function OutcomeSheetPage({ sheet }: { sheet: OutcomeSheet }) {
  return (
    <article className="sheet mx-auto mb-8 max-w-[820px] bg-white p-8 shadow-sm print:mb-0 print:max-w-none print:p-0 print:shadow-none">
      {/* The header band, which FQ repeats on every page of the file. */}
      <header className="flex items-center justify-between gap-4 border-b-2 border-maroon-800 pb-3">
        <BrandLogo />
        <p className="headline text-sm text-maroon-800">
          {sheet.qualification} coach assessment
        </p>
      </header>

      <div className="mt-4 flex items-center gap-4 border border-ink-300 bg-ink-50 px-4 py-3 print:bg-white">
        <Avatar
          user={{
            name: sheet.name,
            email: sheet.email,
            photoId: sheet.photoId,
          }}
          size="lg"
        />
        <div className="min-w-0">
          <p className="headline text-xl text-ink-900">{sheet.name}</p>
          <p className="text-[11px] tracking-[0.08em] text-ink-500 uppercase">
            Coach
          </p>
        </div>
        <div className="ml-auto text-right text-[11px] text-ink-600">
          <p>{sheet.courseTitle}</p>
          {sheet.clubName && <p>{sheet.clubName}</p>}
          {sheet.location && <p>{sheet.location}</p>}
        </div>
      </div>

      {sheet.deliveries.length === 0 ? (
        // A blank form rather than nothing. Somebody printing a sheet for a
        // coach nobody has written up yet is taking it to the grass to fill in.
        <DeliveryBlock
          delivery={{
            deliveryNo: 1,
            assessor: null,
            block: null,
            component: null,
            topic: null,
            session: null,
            date: null,
            comment: null,
            actions: [],
            rating: null,
            points: null,
          }}
          only
        />
      ) : (
        sheet.deliveries.map((delivery) => (
          <DeliveryBlock
            key={delivery.deliveryNo}
            delivery={delivery}
            only={sheet.deliveries.length === 1}
          />
        ))
      )}

      {/* Heading and table in one section so `break-inside: avoid` keeps them
          together — the heading was landing alone at the foot of a page. */}
      <section>
        <SheetHeading>Assessment rating guide</SheetHeading>
        <table className="w-full border-collapse border border-t-0 border-ink-300 text-[11px]">
          <thead>
            <tr className="bg-ink-50 text-left print:bg-white">
              <th className="border-b border-ink-300 px-3 py-1.5 font-semibold text-ink-700">
                FA rating
              </th>
              <th className="border-b border-ink-300 px-3 py-1.5 font-semibold text-ink-700">
                FQ rating
              </th>
              <th className="border-b border-ink-300 px-3 py-1.5 font-semibold text-ink-700">
                Description
              </th>
            </tr>
          </thead>
          <tbody>
            {RATING_GUIDE.map((row) => {
              // A rule only where the FA band changes, as the form's merged cell
              // reads: a line under every half step would make nine bands of
              // three.
              const rule = row.faRating ? "border-t border-ink-300" : "";
              return (
                <tr key={row.rating}>
                  <td
                    className={`px-3 py-1 align-top font-semibold text-ink-800 ${rule}`}
                  >
                    {row.faRating ?? NBSP}
                  </td>
                  <td className={`px-3 py-1 align-top text-ink-900 ${rule}`}>
                    {row.rating.toFixed(1)}
                  </td>
                  <td className={`px-3 py-1 align-top text-ink-700 ${rule}`}>
                    {row.description ?? NBSP}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* The foot of the form: the coach's rating for the course, and the FA
          outcome that goes with it. The outcome is ticked from `bandFor`, not
          chosen again here — two people deciding the same thing twice is how a
          rating and an outcome end up contradicting each other on one page. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-2 border-maroon-800 px-4 py-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.06em] text-ink-600 uppercase">
            Overall rating (1-5)
          </p>
          <p className="headline text-2xl text-maroon-800">
            {sheet.rating !== null ? sheet.rating.toFixed(1) : "—"}
          </p>
        </div>
        <ul className="flex flex-wrap items-center gap-4 text-sm">
          {OUTCOMES.map((label) => {
            const ticked = sheet.band?.faRating === label;
            return (
              <li key={label} className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className={`flex h-4 w-4 items-center justify-center border text-[11px] leading-none ${
                    ticked
                      ? "border-maroon-800 bg-maroon-800 font-bold text-white print:bg-white print:text-ink-900"
                      : "border-ink-400"
                  }`}
                >
                  {ticked ? "X" : NBSP}
                </span>
                <span
                  className={
                    ticked ? "font-semibold text-ink-900" : "text-ink-600"
                  }
                >
                  {label}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {sheet.rating === null && (
        <p className="mt-1.5 text-[11px] text-ink-600">
          Nobody has rated this coach for the course yet, so no outcome is
          ticked. The rating is set on the assessment page, and it is a
          judgement across every delivery rather than a total of them.
        </p>
      )}

      {/* Not on FQ's template and not stored anywhere, so it prints as a rule to
          sign rather than as a name the app has put in somebody's mouth. */}
      <div className="mt-6 grid gap-6 text-[11px] text-ink-600 sm:grid-cols-2">
        <p className="border-t border-ink-400 pt-1.5">
          Assessor signature and date
        </p>
        <p className="border-t border-ink-400 pt-1.5">
          Coach acknowledgement and date
        </p>
      </div>
    </article>
  );
}

/** Shown above the sheets on screen, and not printed. */
export function PrintBar({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mx-auto mb-6 flex max-w-[820px] flex-wrap items-center justify-between gap-3 print:hidden">
      <div className="min-w-0">
        <p className="headline text-sm text-ink-900">{title}</p>
        <p className="text-xs text-ink-500">{subtitle}</p>
      </div>
      <p className="text-xs text-ink-500">
        Print this page, or save it as a PDF from the print dialog.
      </p>
    </div>
  );
}
