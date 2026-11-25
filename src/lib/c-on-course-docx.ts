import "server-only";

import { AlignmentType, CheckBox, PageBreak, Paragraph, Table, TableRow } from "docx";
import {
  DELIVERY_AREAS,
  MAX_DELIVERY_POINTS,
  outcomeFor,
  thresholdsFor,
  type DeliveryOutcome,
} from "@/lib/delivery-rubric";
import { bandFor } from "@/lib/support-rubric";
import {
  BODY,
  COMPETENT_FILL,
  HIGHLY_FILL,
  NYC_FILL,
  SHADE,
  SMALL,
  PAGE_ONE_LINES,
  TEXT_WIDTH,
  candidateBlock,
  deliveryTable,
  estimateDeliveryLines,
  faRubricAppendix,
  quotedDiploma,
  signOff,
  tc,
} from "@/lib/assessment-plan-parts";
import { FULL_WIDTH, para, text } from "@/lib/fq-docx";
import type { ParsedRegister, RegisterCoach } from "@/lib/register-file";
import type { CoachFilled } from "@/lib/assessment-plan-docx";

/**
 * FQ's `‘C’ Diploma Assessment – On Course Pass` document, filled in from a
 * register.
 *
 * Transcribed from the 2027 template Blake sent on 2026-11-18. It is the C
 * Diploma's *course* document: a coach was watched delivering during the
 * course, the CETs settled the six areas, and this is what goes out. That is a
 * different document from the 9 November self-reflection form in
 * `assessment-plan-docx.ts`, which is handed to a coach **ahead** of a video or
 * live reassessment — hence that one's self-reflection table, its video link
 * and its blank assessment date, none of which are on this page.
 *
 * So it replaces the course-feedback half of that form rather than adding a
 * fourth document. The feedback letter was the assessment form with the
 * video-assessment furniture stripped off, because until now FQ had no
 * course-end C form to transcribe; they do now, and it differs structurally
 * from the one it replaces:
 *
 * 1. **The six areas run across the page, not down it.** One header row of
 *    area names and one row of scores under it, in place of a column of
 *    `area | /3 | evidence` rows. There is no evidence column on this form at
 *    all — the CET's reasoning goes in the practical write-ups and the letter.
 * 2. **The grading scale is the total row.** No separate `Grading` band above
 *    the table: the total sits in the left-hand cell with FQ's three coloured
 *    bands and their point ranges beside it.
 * 3. **FQ wrote all three covering paragraphs**, one per outcome, with `If
 *    Highly Competent / If Competent / If Not Yet Competent` in front of each
 *    for whoever fills the form in. One of the three prints — which is Blake's
 *    ask of 2026-11-18 — and the `If …:` prefix comes off with the choosing.
 * 4. **The margins are the B's 1134, not the 9 November form's 720**, and the
 *    candidate block is back to the four column widths both older forms used,
 *    so the shared `candidateBlock` serves it.
 *
 * **What it fills in, and what it leaves blank.** Everything the register
 * holds: the course facts, every practical delivery's assessor, block,
 * component, topic, write-up and action steps, and the per-delivery NYC/C/HC
 * level as the heading's colour with no 1-5 number printed. The six `/3` cells
 * and the total are blank unless somebody hands them in through `filled`,
 * because no 2026 register carries a rubric score — see the note at the head of
 * `register-file.ts`. The covering paragraph is the one thing this form settles
 * without them; `outcomeOf` says how.
 */

/* ------------------------------- Geometry --------------------------------- */

/** The template's own page margin, a side, which is also the B's. */
export const C_ON_COURSE_MARGIN = 1134;

/**
 * The score table's grid, transcribed.
 *
 * Nine columns because the template draws two rows of different shapes through
 * one grid: six area columns across the top, and a total row of
 * `Total Score | NYC | C | HC` under them whose boundaries do not line up with
 * the areas'. Six cells spanning 2,1,2,1,2,1 give the areas; 1,3,3,2 give the
 * total row. The alternative is two tables, which Word then lays out to two
 * different widths.
 */
const SCORE_GRID = [2410, 23, 2434, 1796, 637, 2434, 1040, 1393, 2434];
/** The six area columns, as spans of that grid. */
const AREA_SPANS: [number, number][] = [
  [0, 2],
  [2, 1],
  [3, 2],
  [5, 1],
  [6, 2],
  [8, 1],
];
/** `Total Score | NYC | C | HC`, as spans of the same grid. */
const TOTAL_SPANS: [number, number][] = [
  [0, 1],
  [1, 3],
  [4, 3],
  [7, 2],
];

const SIGN_COLS = [2505, 7305, 1515, 3276];
const APPENDIX_COLS = [2245, 3603, 3461, 3461, 3602];

function span(from: number, count: number) {
  return SCORE_GRID.slice(from, from + count).reduce((sum, w) => sum + w, 0);
}

/* ------------------------------- Narrative -------------------------------- */

/**
 * The covering letter, in FQ's own words, all of it off the template.
 *
 * The outcome paragraphs are theirs verbatim, including the phrase each one
 * emboldens — `Highly Competent`, `Competent`, `not yet` — which is the only
 * emphasis on the page and the thing a coach reads first. Their `If Highly
 * Competent: ` prefixes are guidance to whoever fills the form in, so they
 * come off here: the document prints the paragraph that applies.
 *
 * `successfully completing` is FQ's wording in the congratulation and stays
 * even on a not-yet-competent letter, because completing the course and being
 * deemed competent are two different things and the paragraph is about the
 * first. Flagged to Blake rather than reworded: it is their sentence.
 */
const NARRATIVE = {
  opening: (qualification: string) =>
    `Congratulations on successfully completing the Football Australia/AFC ${qualification} — this marks an important milestone in your coaching journey.`,
  framing:
    "Your formative assessment represents a valuable opportunity to build on what you have learned throughout the course. The CETs have identified both key strengths and areas where further development is needed.",
};

/** FQ's paragraph for an outcome, as the runs it emboldens. */
function finding(outcome: DeliveryOutcome["label"], qualification: string) {
  const lead = `Based on your performance throughout the course, the CETs for the ${qualification} have determined that you have `;
  if (outcome === "Highly Competent") {
    return [
      text(`${lead}demonstrated the required competencies at high standard and are therefore deemed `, {
        size: BODY,
      }),
      text("Highly Competent", { size: BODY, bold: true }),
      text(
        ". Your consistent application of the coaching process and ability to positively impact player learning were evident throughout the course. Continue to build on these strengths and seek new challenges to further develop as you continue your coaching journey.",
        { size: BODY },
      ),
    ];
  }
  if (outcome === "Competent") {
    return [
      text(`${lead}demonstrated the required competencies and are therefore deemed `, { size: BODY }),
      text("Competent", { size: BODY, bold: true }),
      text(
        ". As you continue your coaching journey, build on your existing strengths and remain intentional in addressing the performance goals identified as you continue your coaching journey.",
        { size: BODY },
      ),
    ];
  }
  return [
    text(lead, { size: BODY }),
    text("not yet", { size: BODY, bold: true }),
    text(
      " demonstrated the competencies required to be deemed Competent at this time. This information is being provided now to ensure you have sufficient time to focus on the key areas for development and work closely with your mentor to address the performance gaps outlined above.",
      { size: BODY },
    ),
  ];
}

/**
 * Which of the three paragraphs prints, and where the answer comes from.
 *
 * Blake's ask is that the final comment follows the coach's outcome, and this
 * document is the one place that outcome is stated in words rather than ticked,
 * so it is worth being explicit about the order of precedence:
 *
 * 1. **What a CET settled**, handed back in `filled`. Either the three-way
 *    label outright, or the six scores — a complete set carries its own outcome
 *    by arithmetic, which is `outcomeFor`, and asking twice only invites the
 *    two disagreeing.
 * 2. **The register's course rating**, through `bandFor`. This is not the
 *    invented conversion the repository keeps warning about: nothing here
 *    derives eighteen rubric points from a 1-5 rating. The rating's own band
 *    table *is* FQ's published statement of what a rating means — `Highly
 *    Competent`, `Competent`, `Not yet competent`, transcribed off the
 *    register's rubric sheet — and what it is being asked for is the sentence,
 *    not the scores. The `/3` cells and the total stay blank.
 * 3. **The register's verdict**, for a coach with no rating at all: the
 *    pass/fail the review page classified them under, which cannot distinguish
 *    highly competent from competent and so says the lesser.
 */
export function outcomeOf(
  coach: RegisterCoach,
  register: ParsedRegister,
  filled?: CoachFilled,
): DeliveryOutcome["label"] {
  if (filled?.outcomeLevel) return filled.outcomeLevel;

  const scores = DELIVERY_AREAS.map((area) => filled?.scores?.[area.code]).filter(
    (value): value is number => typeof value === "number",
  );
  if (scores.length === DELIVERY_AREAS.length) {
    const thresholds = thresholdsFor({
      qualification: register.qualification,
      title: register.courseTitle,
    });
    return outcomeFor(
      scores.reduce((sum, value) => sum + value, 0),
      thresholds,
    ).label;
  }

  if (filled?.outcome) {
    return filled.outcome === "competent" ? "Competent" : "Not Yet Competent";
  }

  // On an eighteen-point register the rating *is* the six-area total, and
  // FA's lines say what it means. Read through the 1-5 band table instead,
  // every Logan coach from 9/18 up printed Highly Competent.
  if (register.ratingScale === 18 && coach.rating !== null) {
    return outcomeFor(
      coach.rating,
      thresholdsFor({ qualification: register.qualification, title: register.courseTitle }),
    ).label;
  }

  // `faRating` is "Not yet competent" in sentence case on the band table and
  // "Not Yet Competent" on this form; the three labels are otherwise the same
  // words.
  const faRating = bandFor(coach.rating)?.faRating;
  if (faRating === "Highly Competent") return "Highly Competent";
  if (faRating === "Competent") return "Competent";
  if (faRating) return "Not Yet Competent";

  return coach.verdict === "passed" ? "Competent" : "Not Yet Competent";
}

/* ------------------------------ Page blocks ------------------------------- */

/**
 * The six areas as this template heads them.
 *
 * A main line at 11pt and the template's sub-line at 9pt under it, which is how
 * `PRESENTING` and `COACHING` carry their Es. Transcribed rather than composed
 * from `FA_RUBRIC_APPENDIX`, whose headings for the same six areas run to three
 * lines in a cell this form fills with one.
 *
 * The sixth is headed `MOTIVATIONAL CLIMATE` in this table and `Environment` in
 * the appendix on the following page — a contradiction on one document rather
 * than two names for two things — so it is headed with both, the same way the
 * 9 November form's scoring table is.
 */
const AREA_HEADINGS: Record<string, [string, string?]> = {
  OBJECTIVE: ["OBJECTIVE"],
  CONTENT: ["CONTENTS – 5Rs"],
  ORGANISATION: ["ORGANISATION"],
  PRESENTING: ["PRESENTING", "Engage / Explain / Exit"],
  COACHING: ["COACHING", "Enter / Educate / Enhance / Ensure"],
  ENVIRONMENT: ["ENVIRONMENT", "Motivational climate"],
};

/**
 * The practical write-ups off the register, straight under the candidate
 * block, which is where this template puts them.
 *
 * No `PRACTICAL COMMENTS` heading and no paragraph explaining what they are,
 * both of which the 9 November feedback letter carries. That form had no
 * section for the write-ups at all, so they arrived under a heading of our
 * own; this one is built around them — three columns, headed and ruled — and
 * the form explains itself. The app does not annotate FQ's paperwork.
 */
function practicalComments(coach: RegisterCoach): (Paragraph | Table)[] {
  return [
    // Shaded by the level the CET gave that session and with no 1-5 number on
    // it: the colour and the rating say the same thing about a session, and the
    // colour is the one the CET set. An unshaded delivery falls back to the
    // neutral grey rather than to the template's salmon, which means Not Yet
    // Competent on the same page.
    ...deliveryTable(coach, TEXT_WIDTH, { headerFill: SHADE, byLevel: "fill", rating: false }),
  ];
}

/**
 * The six scores across the page, and the total row with the grading bands.
 *
 * Blank where nobody has scored the areas, which is still the usual case: a
 * register carries no rubric score, and a table filled in from the 1-5 session
 * rating would be the platform quietly asserting a conversion between two
 * instruments that FA have never published one for. `/3` in an empty cell is
 * the template's own placeholder for the scale; a scored cell is the bare
 * number FQ write, bold, because the total row carries the `/ 18`.
 *
 * The band that matches the letter is bold even when the scores are blank. The
 * document states that outcome in words either way — see `outcomeOf` — and a
 * letter that says Competent over an unmarked grading scale reads as a form
 * somebody forgot to finish.
 */
function scoreTable(
  outcome: DeliveryOutcome["label"],
  thresholds: ReturnType<typeof thresholdsFor>,
  filled?: CoachFilled,
) {
  const scores = filled?.scores;
  const given = DELIVERY_AREAS.map((area) => scores?.[area.code]).filter(
    (value): value is number => typeof value === "number",
  );
  // Only once every area has an answer. A sheet half filled in is not a coach
  // who scored nothing in the rest, so a partial set leaves the total blank.
  const total =
    given.length === DELIVERY_AREAS.length
      ? given.reduce((sum, value) => sum + value, 0)
      : null;

  const heads = new TableRow({
    tableHeader: true,
    children: DELIVERY_AREAS.map((area, i) => {
      const [main, sub] = AREA_HEADINGS[area.code] ?? [area.title.toUpperCase()];
      const [from, count] = AREA_SPANS[i];
      return tc(
        [
          para(main, { size: BODY, align: AlignmentType.CENTER }),
          ...(sub ? [para(sub, { size: SMALL, align: AlignmentType.CENTER })] : []),
        ],
        { width: span(from, count), span: count > 1 ? count : undefined, middle: true },
      );
    }),
  });

  const marks = new TableRow({
    children: DELIVERY_AREAS.map((area, i) => {
      const score = scores?.[area.code];
      const [from, count] = AREA_SPANS[i];
      return tc(
        [
          para(score === undefined ? "/3" : String(score), {
            size: score === undefined ? BODY : 12,
            bold: score !== undefined,
            align: AlignmentType.CENTER,
          }),
        ],
        { width: span(from, count), span: count > 1 ? count : undefined, middle: true },
      );
    }),
  });

  // The band the six scores come to, which is what ticks the box — not
  // `outcome`, which this form will also take from a CET or from the
  // register's 1-5 rating when there are no scores. A letter may state an
  // outcome in words off the rating; a tick on the scoring grid is a claim
  // about the grid, so it waits for a complete set of six.
  const scored = total === null ? null : outcomeFor(total, thresholds).label;

  const band = (
    label: string,
    fill: string,
    at: number,
    matches: boolean,
    tick: boolean,
  ) => {
    const [from, count] = TOTAL_SPANS[at];
    return tc(
      [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 0 },
          children: [
            // A real Word checkbox, so a CET who reads the total differently
            // clicks it rather than retyping the row. Box before the label,
            // which is the order on Blake's marked-up copy. His ask of
            // 2026-11-24.
            new CheckBox({ checked: tick }),
            text(` ${label}`, { size: BODY, bold: matches }),
          ],
        }),
      ],
      {
        fill,
        width: span(from, count),
        span: count > 1 ? count : undefined,
        middle: true,
      },
    );
  };

  const totals = new TableRow({
    children: [
      tc(
        [
          para(`Total Score ${total ?? "x"} / ${MAX_DELIVERY_POINTS}`, {
            size: BODY,
            align: AlignmentType.CENTER,
          }),
        ],
        { fill: SHADE, width: span(...TOTAL_SPANS[0]), middle: true },
      ),
      // The template's own ranges rather than the inequalities the 9 November
      // form prints — `(0-8)`, `(9-11)`, `(12-18)` — off the diploma's own
      // thresholds, so a B or an A register run through this layout would not
      // print the C's lines.
      band(
        `NYC – Not Yet Competent (0-${thresholds.competent - 1})`,
        NYC_FILL,
        1,
        outcome === "Not Yet Competent",
        scored === "Not Yet Competent",
      ),
      band(
        `C – Competent (${thresholds.competent}-${thresholds.highlyCompetent - 1})`,
        COMPETENT_FILL,
        2,
        outcome === "Competent",
        scored === "Competent",
      ),
      band(
        `HC – Highly Competent (${thresholds.highlyCompetent}-${MAX_DELIVERY_POINTS})`,
        HIGHLY_FILL,
        3,
        outcome === "Highly Competent",
        scored === "Highly Competent",
      ),
    ],
  });

  return new Table({ width: FULL_WIDTH, columnWidths: SCORE_GRID, rows: [heads, marks, totals] });
}

/**
 * The covering letter, inside the template's single ruled box.
 *
 * The heading follows the letter: FQ's blank form says `ACTION PLAN / FURTHER
 * COMMENTS` because one template serves all three outcomes, and a coach who has
 * been deemed competent is not reading an action plan. It is the one word on
 * the page that is not theirs, and the 9 November letter makes the same
 * substitution.
 */
function narrativeBlock(
  coach: RegisterCoach,
  register: ParsedRegister,
  outcome: DeliveryOutcome["label"],
  filled?: CoachFilled,
) {
  const competent = outcome !== "Not Yet Competent";
  const qualification = quotedDiploma(register.qualification);

  // No salutation. FQ's form has none — their congratulation opens the box and
  // is written in the second person throughout — and the 9 November letter's
  // `Dear <first name>,` was ours. Same rule as the heading above the
  // deliveries: this is their form.
  // `after` is twips at half a point each — `pt()` in `fq-docx.ts` — so FQ's
  // own 160-twip gap between these paragraphs is 80 here, not 8. The rest of
  // the form is set at the house's near-zero spacing; the letter is not,
  // because it is four paragraphs of prose in a ruled box and FQ space it.
  // Three quarters of FQ's 160-twip gap, the same trim the action plan's
  // letter takes and for the same reason: this form is four fixed pages, and
  // page two holds the scoring grid, the letter and the signatures. The
  // checkbox on the total row and the handwriting on the signature lines are
  // each a little taller than the Arial they replaced, which was enough to
  // push a second CET's signature onto a page of its own. A point and a half
  // between paragraphs nobody sees; the orphan everybody does.
  const GAP = 60;
  const inner: Paragraph[] = [
    para(competent ? "FEEDBACK / FURTHER COMMENTS" : "ACTION PLAN / FURTHER COMMENTS", {
      bold: true,
      size: BODY,
      after: GAP,
    }),
    para(NARRATIVE.opening(qualification), { size: BODY, after: GAP }),
    para(NARRATIVE.framing, { size: BODY, after: GAP }),
    para(finding(outcome, qualification), { size: BODY, after: GAP }),
  ];

  // No strengths or gaps lists. FQ's form has none, and Blake confirmed on
  // 2026-11-25 that neither C document carries them — they are the B Diploma
  // action plan's. `filled.strengths` and `filled.gaps` are still read there,
  // and ignored here even when a CET hands some back.

  if (coach.assessmentComment) {
    inner.push(
      para("Course comment:", { size: BODY, before: 4, after: 3 }),
      para(coach.assessmentComment, { size: BODY }),
    );
  }

  return new Table({
    width: FULL_WIDTH,
    columnWidths: [TEXT_WIDTH],
    // Kept whole. The letter is the half of this page a coach reads, and a
    // register's write-ups are long enough that it lands on the page break
    // often rather than rarely: split, it puts the ruled box's top edge at the
    // foot of page one and the competency finding alone on page two. Word
    // falls back to splitting it anyway if it ever outgrows a page, which is
    // the right failure and not one a bundle off a register has hit.
    rows: [new TableRow({ cantSplit: true, children: [tc(inner, { width: TEXT_WIDTH })] })],
  });
}

/* -------------------------------- Packing --------------------------------- */

/**
 * One coach's on-course pass document, in the template's own order, on four
 * pages that are fixed rather than wherever the text happens to run out.
 *
 * ```
 * 1  who the coach is, and the CETs' feedback on each practical delivery
 * 2  the six areas, the grading scale, the covering letter and the sign-off
 * 3  FA's rubric, the first three areas
 * 4  FA's rubric, the last three
 * ```
 *
 * Blake asked for this on 2026-11-18, and it is a layout decision rather than
 * a cosmetic one: left to flow, the break landed in the middle of whichever
 * block was unlucky — the ruled letter box split across two pages on a coach
 * with two write-ups, and the rubric put five areas on one page and the sixth
 * alone under a repeated header on the next. A document a coach signs should
 * break where it changes subject.
 *
 * A coach with three long write-ups still pushes everything down a page. That
 * is the right failure: the break after the deliveries is a minimum, not a
 * budget, and nothing is squeezed to hold the count at four.
 */
export function cOnCourseBlocks(
  coach: RegisterCoach,
  register: ParsedRegister,
  filled?: CoachFilled,
) {
  const thresholds = thresholdsFor({
    qualification: register.qualification,
    title: register.courseTitle,
  });
  const outcome = outcomeOf(coach, register, filled);

  return [
    candidateBlock(coach, register),
    para("", { size: 2 }),
    ...practicalComments(coach),
    // Only where the write-ups plausibly fit above it. Forced regardless, a
    // coach whose third delivery runs a line past the foot of page one gets
    // that line alone on a page of its own; left to flow, that coach's
    // document is still four pages and still breaks between subjects, just
    // one line later.
    ...(estimateDeliveryLines(coach) <= PAGE_ONE_LINES
      ? [new Paragraph({ children: [new PageBreak()] })]
      : [para("", { size: 2 })]),
    scoreTable(outcome, thresholds, filled),
    para("", { size: 2 }),
    narrativeBlock(coach, register, outcome, filled),
    para("", { size: 2 }),
    signOff(coach, register, { columns: SIGN_COLS }),
    // Three areas a page, which splits FA's six evenly and puts its own break
    // in front of each. Even is the point: the descriptors are long and a
    // 5 + 1 split reads as an overflow rather than a reference.
    ...faRubricAppendix(APPENDIX_COLS, { perPage: 3 }),
  ];
}
