import { Avatar } from "@/components/avatar";
import { BrandLogo } from "@/components/brand";
import { DELIVERY_LEVELS, MAX_DELIVERY_POINTS } from "@/lib/delivery-rubric";
import type { OutcomeDelivery, OutcomeSheet } from "@/lib/outcome";

/**
 * FQ's coach assessment outcome document, one coach to a page.
 *
 * Laid out off their own `C - LICENCE COACH ASSESSMENT` form: header band,
 * photo and name, the session block, the assessor's evidence, the action plan,
 * and the outcome with Highly Competent / Competent / Not Yet Competent beside
 * it. Scored on Football Australia's six areas out of eighteen rather than on
 * FQ's old 1-5 column — see `src/lib/outcome.ts` for why both still appear.
 *
 * Styled for paper rather than for the app — borders instead of shadows, black
 * on white, and a page break between coaches — because the thing people do with
 * it is print it or save it as a PDF and send it.
 *
 * A plain server component with no interactivity in it: the only control on the
 * page is the browser's own print dialog, and anything that needed JavaScript
 * to render would be a thing that could be missing from the printout.
 */

/** A blank that still gives an empty cell its height on paper. */
const NBSP = " ";

/** The outcomes, in the order FQ's form prints them. */
const OUTCOMES = [
  "Highly Competent",
  "Competent",
  "Not Yet Competent",
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

/**
 * The six areas and their marks, with the total under them.
 *
 * The scoresheet itself rather than a summary line. It is what the outcome is
 * read off, so a coach handed this document can see which area cost them the
 * points instead of only the number they came to.
 */
function Scoresheet({
  points,
}: {
  points: NonNullable<OutcomeDelivery["points"]>;
}) {
  return (
    <table className="w-full border-collapse border border-t-0 border-ink-300 text-sm">
      <tbody>
        {points.areas.map((area) => (
          <tr key={area.code} className="border-b border-ink-200">
            <td className="px-3 py-1 text-ink-800">{area.title}</td>
            <td className="w-16 border-l border-ink-200 px-3 py-1 text-right font-semibold text-ink-900">
              {/* A blank area is not a nought — see `totalPoints`. */}
              {area.score ?? "—"}
              <span className="text-[11px] font-normal text-ink-500"> / 3</span>
            </td>
          </tr>
        ))}
        <tr className="bg-ink-50 print:bg-white">
          <td className="px-3 py-1.5 text-[11px] font-semibold tracking-[0.06em] text-ink-700 uppercase">
            Total
          </td>
          <td className="w-16 border-l border-ink-200 px-3 py-1.5 text-right font-semibold text-ink-900">
            {points.scored}
            <span className="text-[11px] font-normal text-ink-500">
              {" "}
              / {points.total}
            </span>
          </td>
        </tr>
      </tbody>
    </table>
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

      {delivery.points && (
        <>
          <SheetHeading>
            Assessment — six areas, {MAX_DELIVERY_POINTS} points
          </SheetHeading>
          <Scoresheet points={delivery.points} />
          <p className="mt-1.5 text-[11px] text-ink-600">
            {delivery.points.complete && delivery.points.outcome ? (
              <>
                This session: {delivery.points.scored} / {delivery.points.total}{" "}
                — {delivery.points.outcome.label}.
              </>
            ) : (
              <>
                Not every area has been scored, so this session has no outcome
                yet. A blank area is not a nought.
              </>
            )}
          </p>
        </>
      )}

      {/* Outside the scoresheet block on purpose. The 2026 registers carry a
          1-5 session rating and no area scores at all, so a rating printed only
          beside a scoresheet is a rating that never prints for the intakes
          whose write-ups are already imported. */}
      {delivery.rating !== null && (
        <p className="mt-1.5 text-[11px] text-ink-600">
          Rated {delivery.rating.toFixed(1)} / 5 on the register.
          {!delivery.points &&
            " This session has not been scored on the six areas."}
        </p>
      )}

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
    </section>
  );
}

/** A delivery with nothing on it, for a coach nobody has written up yet. */
const BLANK_DELIVERY: OutcomeDelivery = {
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
};

export function OutcomeSheetPage({ sheet }: { sheet: OutcomeSheet }) {
  const { thresholds, assessed } = sheet;

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
        <DeliveryBlock delivery={BLANK_DELIVERY} only />
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
                Score
              </th>
              <th className="border-b border-ink-300 px-3 py-1.5 font-semibold text-ink-700">
                Level
              </th>
              <th className="border-b border-ink-300 px-3 py-1.5 font-semibold text-ink-700">
                What it means
              </th>
            </tr>
          </thead>
          <tbody>
            {DELIVERY_LEVELS.map((level) => (
              <tr key={level.score}>
                <td className="px-3 py-1 align-top font-semibold text-ink-900">
                  {level.score}
                </td>
                <td className="px-3 py-1 align-top whitespace-nowrap text-ink-800">
                  {level.label}
                </td>
                <td className="px-3 py-1 align-top text-ink-700">
                  {level.description}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {/* The lines printed on the page, so the document evidences its own
            outcome instead of asking the reader to take it on trust. */}
        <p className="mt-1.5 text-[11px] text-ink-600">
          Six areas, {MAX_DELIVERY_POINTS} points in all, scored on a best fit
          of what the session showed and never averaged.{" "}
          {/* The course's own wording, not the letter the rubric keys off.
              FQ calls this one a C Licence; printing "C Diploma" under a
              header that says Licence reads as a different qualification. */}
          {thresholds.assumed
            ? "Nothing on this course names its diploma, so the C Diploma's lines apply:"
            : `On a ${sheet.qualification}:`}{" "}
          under {thresholds.competent} is Not Yet Competent,{" "}
          {thresholds.competent} to {thresholds.highlyCompetent - 1} is
          Competent, and {thresholds.highlyCompetent} or more is Highly
          Competent.
          {thresholds.inferred &&
            " Football Australia has published the competency line for this diploma but not the Highly Competent one, which follows the C Diploma's three-point step."}
        </p>
      </section>

      {/* The foot of the form: the total the outcome is read off, and the
          outcome itself. Ticked by arithmetic rather than chosen again here —
          FA's guide says what nine points means, and asking an assessor to pick
          the outcome as well only invites the two disagreeing. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-2 border-maroon-800 px-4 py-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.06em] text-ink-600 uppercase">
            Overall score
          </p>
          <p className="headline text-2xl text-maroon-800">
            {assessed ? (
              <>
                {assessed.points.scored}
                <span className="text-base text-ink-500">
                  {" "}
                  / {assessed.points.total}
                </span>
              </>
            ) : (
              "—"
            )}
          </p>
        </div>
        <ul className="flex flex-wrap items-center gap-4 text-sm">
          {OUTCOMES.map((label) => {
            const ticked = assessed?.points.outcome?.label === label;
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

      <p className="mt-1.5 text-[11px] text-ink-600">
        {assessed ? (
          <>
            Read off delivery {assessed.deliveryNo}
            {sheet.deliveries.length > 1 &&
              ", the most recent session scored in full"}
            . Totals are never averaged across sessions, so one assessment
            carries the outcome and the others above it are the evidence it was
            reached through.
          </>
        ) : (
          <>
            No session has been scored in full yet, so there is no outcome. All
            six areas have to carry a mark before a total means anything.
          </>
        )}
        {/* The register's own number. Not convertible to the eighteen points,
            and the one `courseResult` reads to decide post-course support, so
            it is named for what it is rather than quietly dropped. */}
        {sheet.rating !== null && sheet.band && (
          <>
            {" "}
            Separately, the course rating on the register is{" "}
            {sheet.rating.toFixed(1)} / 5 — {sheet.band.outcome.toLowerCase()}.
            It is a judgement across everything this coach delivered rather than
            a total of their sessions.
          </>
        )}
      </p>

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
