import "server-only";

import {
  AlignmentType,
  CheckBox,
  Document,
  PageBreak,
  Packer,
  Paragraph,
  Table,
  TableRow,
} from "docx";
import {
  DELIVERY_AREAS,
  MAX_DELIVERY_POINTS,
  outcomeFor,
  thresholdsFor,
  type DeliveryOutcome,
} from "@/lib/delivery-rubric";
import { cOnCourseBlocks } from "@/lib/c-on-course-docx";
import {
  bActionPlanBlocks,
  bDocumentTitle,
  bFeedbackBlocks,
  type BFilled,
} from "@/lib/b-diploma-docx";
import {
  BODY,
  COMPETENT_FILL,
  faRubricAppendix,
  HIGHLY_FILL,
  NYC_FILL,
  PAGE_ONE_LINES,
  SHADE,
  SMALL,
  TEXT_WIDTH,
  bullet,
  candidateBlock,
  deliveryTable,
  estimateDeliveryLines,
  isBDiploma,
  quotedDiploma,
  signOff,
  tc,
} from "@/lib/assessment-plan-parts";
import {
  assessmentFooter,
  assessmentHeader,
  docxFilename,
  FONT,
  FULL_WIDTH,
  INK,
  para,
  pt,
  text,
} from "@/lib/fq-docx";
import type { ParsedRegister, RegisterCoach } from "@/lib/register-file";
import { signatureFonts } from "@/lib/signature-font";

/**
 * FQ's `‘C’ Diploma Assessment – Action Plan` document, filled in from a
 * register.
 *
 * Transcribed from the 2027 template Blake sent on 2026-11-22. It is what a
 * coach the register does not sign off is sent at the end of a course: what
 * the CETs wrote about each practical delivery, the six areas scored out of
 * three, and FQ's action-plan letter. Its pair is the `On Course Pass` form in
 * `c-on-course-docx.ts`, which is the same course and the other verdict.
 *
 * **This layout replaced the 9 November self-reflection form, which this file
 * built from 2026-11-12.** That form was FQ's reassessment handout — the coach
 * scored themselves out of three in a `COACH SELF-REFLECTION` table, a video
 * link and a blank assessment date headed the page, and nothing off the
 * register appeared on it, because the assessment it described had not
 * happened yet. Blake reported on 2026-11-22 that the action plans the bundle
 * had just produced carried none of the register's feedback, and then said
 * plainly what the document is for: an action plan sets out the coach's
 * results from the course. So the self-reflection table, the video link and
 * the blank assessment date are gone with that form, and the write-ups the
 * CETs actually wrote are at the top of the page where the 2027 template's
 * course facts leave off. The old layout is in the history.
 *
 * **What the 2027 form differs on, against the on-course pass form.** The two
 * are the same document for two outcomes and differ in three places:
 *
 * 1. **The six areas run down the page, not across it**, with an evidence
 *    column beside each score — the on-course form has none, and puts the
 *    CET's reasoning in the write-ups and the letter.
 * 2. **The grading scale is its own band above the table**, as well as the
 *    three coloured cells in the total row.
 * 3. **FQ wrote one letter, not three.** This form is the not-yet-competent
 *    outcome, so their action-plan wording prints as it stands, with the
 *    `Area of Strength` and `Performance Gaps` lists their template leaves as
 *    `…` for a CET to fill in. A coach the CETs have deemed competent gets the
 *    other document; `kind` picks, in `assessmentPlanDocx`.
 *
 * **What this fills in, and what it leaves blank.** Everything the register
 * holds: the course facts, every practical delivery's assessor, block,
 * component, topic, write-up and action steps, the per-delivery NYC/C/HC level
 * as the heading's colour with no 1-5 number printed, and the CETs' names. The
 * six `/3` cells, the total and the strengths and gaps are blank unless
 * somebody hands them in through `filled`, because no 2026 register carries a
 * rubric score — see the note at the head of `register-file.ts`. Deriving
 * eighteen points from a 1-5 rating would be inventing a conversion nobody has
 * published.
 */

/* ------------------------------- Geometry --------------------------------- */

/**
 * The template's page margin, a side, which is the B's and the on-course
 * pass form's.
 *
 * The 9 November form this file used to build was set at 720 and every grid in
 * it was normalised to the wider text column that left. The 2027 action plan
 * is back at 1134, so the grids below are the template's own numbers and
 * `TEXT_WIDTH` is the shared one again.
 */
export const C_MARGIN = 1134;

/** The grading band above the score table. */
const BAND_COLS = [3686, 4111, 3402, 3402];
/**
 * The score table's grid, transcribed.
 *
 * Six columns because the template draws two rows of different shapes through
 * one grid. A scoring row is `area | /3 | evidence`, spanning 2, 1 and 3; the
 * total row is `Total Score | NYC | C | HC`, spanning 1, 3, 1 and 1, and its
 * boundaries do not line up with the scoring rows'. One grid serves both,
 * which is how the template does it and the only way the two line up down the
 * page.
 */
const SCORE_COLS = [3650, 36, 1028, 3083, 3402, 3402];
/** The letter box and the signatures, which are one table on this form. */
const SIGN_COLS = [2505, 7305, 1515, 3390];
const APPENDIX_COLS = [2245, 3603, 3461, 3461, 3602];

function span(from: number, count: number) {
  return SCORE_COLS.slice(from, from + count).reduce((sum, w) => sum + w, 0);
}

/* ------------------------------- Narrative -------------------------------- */

/**
 * The covering letter, in FQ's own words, all of it off the template.
 *
 * One letter, because this document is one outcome. The three-way choice is
 * the on-course pass form's, where FQ wrote a paragraph per outcome and
 * `outcomeOf` picks; here their form says what an action plan says.
 *
 * No salutation and no closing good-luck line: the 9 November form's
 * `Dear <first name>,` and `Good luck with your next attempt` were ours, and
 * this template has neither. Their congratulation opens the box and is written
 * in the second person throughout.
 */
const NARRATIVE = {
  opening: (qualification: string) =>
    `Congratulations on attending the Football Australia/AFC ${qualification} — this marks an important milestone in your coaching journey.`,
  framing:
    "Your formative assessment represents a valuable opportunity to build on what you have learned throughout the course. The CETs have identified both key strengths and areas where further development is needed. Continue to excel in your strengths - keep thriving in these areas. For the performance gap, we are looking for you to narrow the gap and show improvement in the upcoming months.",
  finding: (qualification: string) =>
    `At this stage, the CETs for the ${qualification} have determined that your practical performance is not yet at the level required to be deemed competent in the course. We are sharing this information now to ensure you have ample time to focus on the areas identified and to work closely with your mentor to address the performance gaps outlined above.`,
  /** What the template leaves in an empty list for a CET to write over. */
  placeholder: "…",
};

/* ------------------------------ Page blocks ------------------------------- */

/**
 * The practical write-ups off the register, straight under the candidate
 * block.
 *
 * The top of the page, which is where Blake asked for them: an action plan
 * exists because of what the CETs saw, and the coach reads that before the
 * scoring of it. No heading and no paragraph explaining what they are — the
 * 9 November form had a `PRACTICAL COMMENTS` box of our own making because
 * their form had no section for the write-ups at all, and this one's columns
 * are headed and ruled and explain themselves. The app does not annotate FQ's
 * paperwork.
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
 * The six areas as the template heads them, underlined, with its sub-lines.
 *
 * Transcribed rather than built out of `FA_RUBRIC_APPENDIX`, which heads the
 * same six areas at much greater length: composing them from the appendix put
 * three lines in a cell the template fills with one and pushed the form onto
 * an extra page.
 *
 * The sixth is the one divergence. FQ's form says `MOTIVATIONAL CLIMATE` in
 * this table and `Environment` in the appendix on the following page, which is
 * a contradiction on one document rather than two names for two things, so it
 * is headed with both.
 */
const AREA_HEADINGS: Record<string, [string, string?]> = {
  OBJECTIVE: ["OBJECTIVE"],
  CONTENT: ["CONTENTS – 5Rs"],
  ORGANISATION: ["ORGANISATION"],
  PRESENTING: ["PRESENTING", "Engage – Explain - Exit"],
  COACHING: ["COACHING", "Enter – Educate / Enhance - Ensure"],
  ENVIRONMENT: ["ENVIRONMENT", "Motivational climate"],
};

/**
 * A score in the template's `/3` cell.
 *
 * `/3` on its own where there is no answer, which is the template's own
 * placeholder for the scale, and `1.5 / 3` where there is. Half points are the
 * reason this is a cell rather than the four checkboxes FQ's October form had:
 * they settle the six areas by email after a course closes and score 1.5 for
 * an area that drew constructive feedback, FA's grid has no box between 1 and
 * 2, and rounding to the nearest box would change a coach's mark.
 */
function scoreOutOfThree(score?: number) {
  return score === undefined ? "/3" : `${score} / 3`;
}

/** The grading scale as the template's four cells, above the score table. */
function gradingBand(thresholds: ReturnType<typeof thresholdsFor>) {
  const band = (label: string, fill: string, width: number) =>
    tc([para(label, { size: BODY, align: AlignmentType.CENTER })], {
      fill,
      width,
      middle: true,
    });
  return new Table({
    width: FULL_WIDTH,
    columnWidths: BAND_COLS,
    rows: [
      new TableRow({
        children: [
          tc([para("Grading", { size: BODY, align: AlignmentType.CENTER })], {
            fill: SHADE,
            width: BAND_COLS[0],
            middle: true,
          }),
          // The template's own ranges — `(0–8)`, `(9–11)`, `(12–18)` — off the
          // diploma's thresholds rather than its printed numbers, so a
          // register with another pass mark does not print the C's lines.
          band(
            `NYC – Not Yet Competent (0–${thresholds.competent - 1})`,
            NYC_FILL,
            BAND_COLS[1],
          ),
          band(
            `C - Competent (${thresholds.competent}–${thresholds.highlyCompetent - 1})`,
            COMPETENT_FILL,
            BAND_COLS[2],
          ),
          band(
            `HC – Highly Competent (${thresholds.highlyCompetent}–${MAX_DELIVERY_POINTS})`,
            HIGHLY_FILL,
            BAND_COLS[3],
          ),
        ],
      }),
    ],
  });
}

/**
 * A score per area, keyed by `DeliveryArea.code`, where somebody has one.
 *
 * No register carries these — FQ settle them by email after a course closes,
 * and the one that prompted this arrived as six lines in a reply from the CET
 * who ran the practical, agreed by the State Technical Director. So they are
 * passed in rather than read, and the table comes out blank when they are not,
 * which is still the usual case.
 */
export type AreaScores = Partial<Record<string, number>>;

/** Everything a CET, or the coach, may already have written on one form. */
export type CoachFilled = BFilled & {
  scores?: AreaScores;
  /**
   * The three-way outcome the on-course pass letter states in words.
   *
   * `BFilled.outcome` is two-way — the B Diploma's form ticks a box, and the
   * C's two forms bold one of three coloured cells off the total — and neither
   * can say Highly Competent without a complete set of scores. FQ's on-course
   * pass letter has a paragraph per outcome and the register carries no
   * scores, so this is how a CET who has settled it says which one prints.
   * Left out, `outcomeOf` works it out; see the precedence there.
   */
  outcomeLevel?: DeliveryOutcome["label"];
};

/**
 * The assessors' six-area table, the evidence beside each score, and the total
 * under them.
 *
 * Blank unless a CET hands scores back. A register carries no rubric score, so
 * there is nothing to score from — and a table filled in from the 1-5 session
 * rating would be the platform quietly asserting a conversion between two
 * instruments that FA have never published one for.
 *
 * Where a complete set does settle it, that outcome's label in the total row is
 * bold. It follows from the total rather than being asked for, because FA's
 * guide says what nine points means and asking twice only invites the two
 * disagreeing.
 */
function scoreTable(thresholds: ReturnType<typeof thresholdsFor>, filled?: CoachFilled) {
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
  const outcome = total === null ? null : outcomeFor(total, thresholds);

  const rows = DELIVERY_AREAS.map((area) => {
    const [main, sub] = AREA_HEADINGS[area.code] ?? [area.title.toUpperCase()];
    // The CET's reasoning beside the score, which is where this form carries
    // its longest writing, and blank for them to fill in.
    const evidence = filled?.evidence?.[area.code] ?? [];
    return new TableRow({
      cantSplit: true,
      children: [
        tc(
          [
            para(main, { size: BODY, align: AlignmentType.CENTER }),
            ...(sub ? [para(sub, { size: SMALL, align: AlignmentType.CENTER })] : []),
          ],
          { width: span(0, 2), span: 2, middle: true },
        ),
        tc(
          [
            para(scoreOutOfThree(scores?.[area.code]), {
              size: BODY,
              align: AlignmentType.CENTER,
            }),
          ],
          { width: span(2, 1), middle: true },
        ),
        tc(
          (evidence.length ? evidence : [""]).map((line) => para(line, { size: SMALL })),
          { span: 3, width: span(3, 3) },
        ),
      ],
    });
  });

  // FQ's own total row, with their Word checkbox in each of the three cells.
  // Real content controls rather than a drawn box, because Blake asked on
  // 2026-11-24 for a box the CETs can change: the tick follows the total and
  // an assessor who disagrees clicks it. They were left off until then
  // because an unticked sdt renders as a crossed box in anything but Word,
  // and three apparently ticked outcomes on a PDF is worse than a blank row.
  // That trade went the other way once the box carries the answer: a PDF of a
  // scored form now shows three crossed boxes rather than one tick, so send
  // these as .docx, which is how FQ circulate them anyway.
  //
  // Ticked only off a complete set of six scores — `outcome` is null without
  // one. Never off the register's 1-5 rating, which is the conversion this
  // whole file refuses to invent.
  const outcomeBox = (label: string, fill: string, from: number, count: number, band: string) =>
    tc(
      [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 0 },
          children: [
            text(`${label}  `, { size: BODY, bold: outcome?.label === band }),
            new CheckBox({ checked: outcome?.label === band }),
          ],
        }),
      ],
      { fill, width: span(from, count), span: count > 1 ? count : undefined, middle: true },
    );

  rows.push(
    new TableRow({
      children: [
        tc(
          [
            // The one underline on the page, which is the template's: its
            // table style carries one and every other run turns it off.
            para(`Total Score ${total ?? "x"} / ${MAX_DELIVERY_POINTS}`, {
              size: BODY,
              underline: true,
              align: AlignmentType.CENTER,
            }),
          ],
          { fill: SHADE, width: span(0, 1), middle: true },
        ),
        outcomeBox("NYC – Not Yet Competent", NYC_FILL, 1, 3, "Not Yet Competent"),
        outcomeBox("C – Competent", COMPETENT_FILL, 4, 1, "Competent"),
        outcomeBox("HC – Highly Competent", HIGHLY_FILL, 5, 1, "Highly Competent"),
      ],
    }),
  );

  return new Table({ width: FULL_WIDTH, columnWidths: SCORE_COLS, rows });
}

/**
 * The covering letter and the signatures, which are one table on this form.
 *
 * FQ's template runs the letter as a cell spanning the four signature columns
 * with the CET rows under it, so `signOff` takes it as a row above its own
 * rather than the two being separate tables. Two tables get laid out by Word
 * to two different widths when the text in them differs, which on a letter
 * whose length is a coach's write-ups is every document.
 */
function narrativeRow(coach: RegisterCoach, register: ParsedRegister, filled?: CoachFilled) {
  const qualification = quotedDiploma(register.qualification);
  // `after` is twips at half a point each — `pt()` in `fq-docx.ts` — so FQ's
  // own 160-twip gap between these paragraphs is 80 here, not 8. The rest of
  // the form is set at the house's near-zero spacing; the letter is not,
  // because it is prose in a ruled box and FQ space it.
  //
  // Three quarters of their gap rather than all of it. The scoring, the letter
  // and the signatures are one page on this form, and at FQ's own spacing a
  // coach with two CETs pushed the second signature line alone onto a page of
  // its own — a whole page for one row. The difference is a point and a half
  // between paragraphs and nobody can see it; the orphan, everybody can.
  const GAP = 60;
  const inner: Paragraph[] = [
    para("ACTION PLAN / FURTHER COMMENTS", { bold: true, size: BODY, after: GAP }),
    para(NARRATIVE.opening(qualification), { size: BODY, after: GAP }),
    para(NARRATIVE.framing, { size: BODY, after: GAP }),
  ];

  // Both lists print, with the template's own `…` where nobody has written
  // one. They are not ours to leave off — FQ's form asks for them in this
  // order, above the finding that refers to "the performance gaps outlined
  // above" — and twelve of the Moreton action plans came back with them filled
  // in by hand, which a rebuild that dropped them would destroy.
  //
  // One `…` each rather than the template's two. A CET types over a bullet and
  // Word makes the next one, so the second is spare; and the two lines it
  // saves are what keep a third CET's signature on page two for a coach whose
  // deliveries were watched by three — Joel Anderson on the Logan register,
  // whose third signature line otherwise sat alone on a page of its own.
  const list = (lines?: string[]) =>
    (lines?.length ? lines : [NARRATIVE.placeholder]).map((line) => bullet(line));
  inner.push(
    para("Area of Strength:", { size: BODY, after: 3 }),
    ...list(filled?.strengths),
    para("Performance Gaps:", { size: BODY, before: 4, after: 3 }),
    ...list(filled?.gaps),
  );

  inner.push(para(NARRATIVE.finding(qualification), { size: BODY, before: GAP, after: GAP }));

  if (coach.assessmentComment) {
    inner.push(
      para("Course comment:", { size: BODY, before: 4, after: 3 }),
      para(coach.assessmentComment, { size: BODY }),
    );
  }

  return new TableRow({
    // Kept whole, as the on-course pass form keeps its letter. A coach with
    // long write-ups runs page one over and everything after it flows, and
    // split, the ruled box put its top edge at the foot of one page and the
    // competency finding alone at the head of the next.
    cantSplit: true,
    children: [tc(inner, { span: 4, width: SIGN_COLS.reduce((sum, w) => sum + w, 0) })],
  });
}

/* -------------------------------- Packing --------------------------------- */

/**
 * One coach's C Diploma action plan, in the template's own order.
 *
 * ```
 * 1  who the coach is, and the CETs' feedback on each practical delivery
 * 2  the grading scale, the six areas, the covering letter and the sign-off
 * 3  FA's rubric, the first three areas
 * 4  FA's rubric, the last three
 * ```
 *
 * The break after the write-ups follows the on-course pass form's rule, which
 * is Blake's of 2026-11-18: a document a coach signs should break where it
 * changes subject, and the break is forced only where the write-ups
 * plausibly fit above it. Forced regardless, a coach whose third delivery runs
 * a line past the foot of page one gets that line alone on a page of its own.
 */
function coachBlocks(coach: RegisterCoach, register: ParsedRegister, filled?: CoachFilled) {
  const thresholds = thresholdsFor({
    qualification: register.qualification,
    title: register.courseTitle,
  });

  return [
    candidateBlock(coach, register),
    para("", { size: 2 }),
    ...practicalComments(coach),
    ...(estimateDeliveryLines(coach) <= PAGE_ONE_LINES
      ? [new Paragraph({ children: [new PageBreak()] })]
      : [para("", { size: 2 })]),
    gradingBand(thresholds),
    para("", { size: 2 }),
    scoreTable(thresholds, filled),
    para("", { size: 2 }),
    signOff(coach, register, {
      columns: SIGN_COLS,
      before: [narrativeRow(coach, register, filled)],
    }),
    // Three areas a page, which splits FA's six evenly and puts its own break
    // in front of each. Even is the point: the descriptors are long and a
    // 5 + 1 split reads as an overflow rather than a reference.
    ...faRubricAppendix(APPENDIX_COLS, { perPage: 3 }),
  ];
}

/**
 * What the letterhead and the footer say, which is both C templates' own line.
 *
 * The same on the action plan and the on-course pass form: FQ head both
 * `‘C’ Diploma Practical Coaching Assessment` and name the document only in
 * its file name. #46 briefly printed `Assessment – Action Plan` here, which put
 * "Action Plan" at the head of every coach's On Course Pass.
 */
function documentTitle(register: ParsedRegister) {
  return `${quotedDiploma(register.qualification)} Practical Coaching Assessment`;
}

/**
 * One coach's document.
 *
 * Landscape at the templates' own page and margins, which is the only way the
 * practical write-ups fit side by side and the rubric's descriptors stay
 * readable. All four forms are at 1134 a side now: the one that was not was
 * FQ's 9 November video-assessment form at 720, and the 2027 action plan that
 * replaced it is back at the margin the other three use.
 *
 * `kind` decides which document this is, not the coach's verdict, because the
 * export route already knows: it asks for a feedback letter when the register
 * signed the coach off and an action plan otherwise, and for the not-yet-judged
 * bundle it asks for action plans on coaches with no verdict at all. Deriving
 * it from the verdict here would send that bundle out as feedback letters the
 * moment somebody passed a single coach on the sheet.
 *
 * So there are four documents behind two kinds, and `kind` with the register's
 * qualification picks one:
 *
 * ```
 *          action plan                     feedback
 *   B      formative assessment            post-course feedback letter
 *   C      action plan (2027 form)         on course pass  (c-on-course-docx)
 * ```
 */
export async function assessmentPlanDocx(
  coaches: RegisterCoach[],
  register: ParsedRegister,
  kind: "action plan" | "feedback" = "action plan",
  /**
   * What a CET has already settled, where one has, keyed by coach name.
   *
   * The register carries none of it and the export leaves every one of these
   * blank without it, which is still what the bundle does. This is for the
   * cases FQ actually have: six scores agreed by email after a C Diploma
   * closed, or a B Diploma form a CET has already ticked and written up in
   * Word, which a document rebuilt from the register would otherwise lose.
   *
   * `scores` is the C's and the B ignores it — the B ticks a level per area
   * and totals nothing. `levels` is the B's and the C ignores it. `evidence`,
   * `strengths`, `gaps` and `outcome` are read by both.
   */
  filled?: Record<string, CoachFilled>,
) {
  const b = isBDiploma(register);
  const competent = kind === "feedback";
  const margin = C_MARGIN;
  const title = b ? bDocumentTitle(register, competent) : documentTitle(register);

  // The register's own six scores, where it carries them, fill the C forms'
  // `/3` cells — read, not derived: the eighteen-point registers score the
  // areas themselves. A CET's scores handed back in `filled` still win.
  const cFilled = (coach: RegisterCoach): CoachFilled | undefined => {
    const own = filled?.[coach.name];
    if (own?.scores || !Object.keys(coach.scores ?? {}).length) return own;
    return { ...own, scores: coach.scores };
  };

  const blocksFor = (coach: RegisterCoach) =>
    b
      ? competent
        ? bFeedbackBlocks(coach, register, filled?.[coach.name])
        : bActionPlanBlocks(coach, register, filled?.[coach.name])
      : competent
        ? cOnCourseBlocks(coach, register, cFilled(coach))
        : coachBlocks(coach, register, cFilled(coach));

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: pt(BODY), color: INK } } } },
    // The handwriting face for the signature lines rides inside the file, so
    // it renders on a machine that has never heard of it. One place for it:
    // all four documents - both C forms and both B forms - come out of this
    // one constructor.
    fonts: await signatureFonts(),
    sections: [
      {
        properties: {
          page: {
            size: { orientation: "landscape" },
            margin: {
              top: margin,
              bottom: margin,
              left: margin,
              right: margin,
              header: 578,
              footer: 641,
            },
          },
        },
        headers: { default: await assessmentHeader(title) },
        footers: { default: assessmentFooter(title) },
        children: coaches.flatMap((coach, i) => [
          ...(i ? [new Paragraph({ children: [new PageBreak()] })] : []),
          ...blocksFor(coach),
        ]),
      },
    ],
  });

  return Packer.toBuffer(doc);
}

/**
 * What a coach's file is called inside the bundle.
 *
 * `Billy Ho-Fung Wong - B Diploma Assessment - Action Plan.docx`, which is the
 * convention Blake circulates these under and the one FQ's own template file
 * is named for (`C Diploma Assessment - Action Plan / Feedback`). The
 * qualification is in the name because a coach can sit both diplomas and the
 * two files would otherwise collide in whatever folder they end up in.
 *
 * Not the document's own title, which is longer and differs between the B's
 * two documents (`Formative Assessment` against `Post-course Feedback`): the
 * file name is for finding the file, and a column of names that agree down to
 * the last three words is harder to scan, not easier.
 */
export function planFilename(
  coach: RegisterCoach,
  kind: "action plan" | "feedback",
  register: ParsedRegister,
) {
  // The C's course-end document is FQ's `On Course Pass` form and is named
  // for it, because the file name is how Blake can tell at a glance which of
  // the two C layouts a document came out of. The B's pair keep Feedback /
  // Action Plan.
  const what =
    kind === "feedback"
      ? isBDiploma(register)
        ? "Feedback"
        : "On Course Pass"
      : "Action Plan";
  return docxFilename(
    coach.name,
    `${register.qualification ?? "Diploma"} Assessment`,
    what,
  );
}

export { docxFilename };
