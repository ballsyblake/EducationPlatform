import "server-only";

import {
  AlignmentType,
  CheckBox,
  HeightRule,
  PageBreak,
  Paragraph,
  Table,
  TableRow,
  WidthType,
} from "docx";
import {
  B_DIPLOMA_RUBRIC,
  B_LEVELS,
  B_RUBRIC_PREAMBLE,
  B_TICK_HEADINGS,
  FA_COMPETENCIES,
} from "@/lib/b-diploma-rubric";
import {
  BODY,
  COMPETENT_FILL,
  HIGHLY_FILL,
  NYC_FILL,
  SHADE,
  SMALL,
  TEXT_WIDTH,
  bullet,
  candidateBlock,
  deliveryTable,
  quotedDiploma,
  signOff,
  tc,
} from "@/lib/assessment-plan-parts";
import { FULL_WIDTH, MAROON, para, text } from "@/lib/fq-docx";
import type { ParsedRegister, RegisterCoach } from "@/lib/register-file";

/**
 * The B Diploma's own two documents, which are not the C Diploma's.
 *
 * FQ run the two diplomas off different paperwork, and until now the export
 * built every coach's document off the C form. Laid out here from the copies
 * returned for Beau Weedon (formative assessment / action plan) and Matthew
 * Mckay (post-course feedback) on the August 2026 Toowoomba course.
 *
 * **Where they differ from the C form**, which is most of why this is a file
 * of its own rather than a flag on the other one:
 *
 * - They are two differently *titled* documents. The action plan is headed
 *   `Practical Coaching Formative Assessment`, the feedback letter
 *   `Practical Coaching Post-course Feedback`. The C form is one title for
 *   both.
 * - The tick table is three columns — NYC, C, HC — not four digits, and there
 *   is **no total**. The B Diploma does not add anything up: a level per area,
 *   then an overall outcome ticked on its own row. So nothing here prints
 *   `/ 18`, and `delivery-rubric.ts` is not consulted.
 * - The outcome is a two-box row, `COMPETENT` on white and
 *   `NOT COMPETENT YET` on FQ's maroon, rather than the C form's three bands.
 * - The appendix is FQ's B Diploma rubric, six areas against three levels. See
 *   the note at the head of `b-diploma-rubric.ts` about why it is not the FA
 *   grid with a column removed.
 * - The action plan carries a `Coach Development Plan` page the C form has no
 *   equivalent of.
 * - Only the action plan has a grading band and a tick table at all. The
 *   feedback letter is the write-ups, the finding and the rubric.
 *
 * **What is shared** lives in `assessment-plan-parts.ts`: the candidate block,
 * the delivery table, the cell helpers and the palette are the same on both
 * diplomas because FQ's own two forms share them.
 *
 * **What comes out blank, and why.** The same as the C form, for the same
 * reason. No 2026 register carries a per-area level, so the tick table ships
 * empty for the CETs. FQ's own copies colour the delivery headings and the
 * write-up text by the level the CET gave that session — Beau's first three
 * deliveries are salmon and his fourth yellow, Matthew's write-ups are green
 * and red — and that judgement is nowhere on a register either. Colouring them
 * off the free-text `Session Rating: n` would be asserting a conversion from
 * the 1-5 scale to NYC/C/HC that nobody has published. They come out plain.
 */

/* ------------------------------ The pieces -------------------------------- */

/** FQ's maroon, which is what the B form's outcome row and its boxes are in. */
const OUTCOME_MAROON = "990033";

/**
 * The three colours FQ name the levels in, in the feedback letter's own
 * sentence explaining the colour coding.
 *
 * Brighter than `LEVEL_TEXT`, which is the Excel font colour the write-ups
 * themselves carry. Their copy uses both, one for the legend and one for the
 * prose, so this does too rather than picking one and making the sentence
 * disagree with what it is describing.
 */
const LEGEND = { NYC: "F91E00", C: "E4B900", HC: "44A921" };

/**
 * The B form's grading band: the three levels, no point ranges.
 *
 * The C form prints `(0–11)`, `(12–14)`, `(15–18)` because it totals a score.
 * Carrying those over would put an arithmetic on this page that the B Diploma
 * does not do.
 */
const BAND_COLS = [3458, 3458, 3458, 4195];

function gradingBand() {
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
          band("NYC – Not Yet Competent", NYC_FILL, BAND_COLS[1]),
          band("C - Competent", COMPETENT_FILL, BAND_COLS[2]),
          band("HC – Highly Competent", HIGHLY_FILL, BAND_COLS[3]),
        ],
      }),
    ],
  });
}

/**
 * The six-area tick table: three real Word checkboxes and a comment column.
 *
 * Checkboxes rather than drawn boxes because this document is circulated to be
 * completed in Word and signed, which is the whole reason FQ want .docx.
 */
function tickTable() {
  const COLS = [3686, 1418, 1275, 1418, 6804];
  const LEVELS: [string, number][] = [
    ["NYC", COLS[1]],
    ["C", COLS[2]],
    ["HC", COLS[3]],
  ];

  const rows = B_DIPLOMA_RUBRIC.map((area) => {
    const [heading, sub] = B_TICK_HEADINGS[area.code] ?? [area.heading[0]];
    return new TableRow({
      cantSplit: true,
      children: [
        tc(
          [
            para(heading, { size: BODY, align: AlignmentType.CENTER }),
            ...(sub ? [para(sub, { size: SMALL, align: AlignmentType.CENTER })] : []),
          ],
          { width: COLS[0], middle: true },
        ),
        ...LEVELS.map(([label, width]) =>
          tc(
            [
              para(label, { size: BODY, align: AlignmentType.CENTER }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 0, after: 0 },
                children: [new CheckBox({})],
              }),
            ],
            { width, middle: true },
          ),
        ),
        // The CET's evidence for the level beside it, which is where this form
        // carries its longest writing.
        tc([para("", { size: SMALL })], { width: COLS[4] }),
      ],
    });
  });

  return new Table({ width: FULL_WIDTH, columnWidths: COLS, rows });
}

/**
 * The outcome row: two boxes, one of which the CETs tick.
 *
 * Built on the sign-off block's own columns so the two read as one block, which
 * is how FQ's copies have it — on their file the outcome row and the signature
 * rows are literally the same table.
 */
const SIGN_COLS = [2410, 5126, 2387, 4678];

function outcomeRow() {
  const box = (label: string, fill: string, color: string, span: number, width: number) =>
    tc(
      [
        new Paragraph({
          spacing: { before: 0, after: 0 },
          children: [text(`${label}    `, { bold: true, size: BODY, color }), new CheckBox({})],
        }),
      ],
      { fill, span, width, middle: true },
    );
  return new TableRow({
    children: [
      box("COMPETENT", "FFFFFF", OUTCOME_MAROON, 2, SIGN_COLS[0] + SIGN_COLS[1]),
      box("NOT COMPETENT YET", OUTCOME_MAROON, "FFFFFF", 2, SIGN_COLS[2] + SIGN_COLS[3]),
    ],
  });
}

/** The B rubric, printed at the foot of both documents. */
function rubricAppendix() {
  const COLS = [1838, 4205, 4205, 4206];
  const FILLS = [NYC_FILL, COMPETENT_FILL, HIGHLY_FILL];

  const rows = [
    new TableRow({
      tableHeader: true,
      children: [
        tc([para("Assessment Area", { size: BODY, align: AlignmentType.CENTER })], {
          fill: "D9D9D9",
          width: COLS[0],
          middle: true,
        }),
        ...B_LEVELS.map((level, i) =>
          tc([para(level, { size: BODY, align: AlignmentType.CENTER })], {
            fill: FILLS[i],
            width: COLS[i + 1],
            middle: true,
          }),
        ),
      ],
    }),
    ...B_DIPLOMA_RUBRIC.map(
      (area) =>
        new TableRow({
          cantSplit: true,
          children: [
            tc(
              [
                para(area.heading[0], { size: BODY, align: AlignmentType.CENTER }),
                ...area.heading.slice(1).map((sub) => bullet(sub, SMALL)),
              ],
              { width: COLS[0], middle: true },
            ),
            ...area.levels.map((descriptor, i) =>
              tc([para(descriptor, { size: SMALL })], { width: COLS[i + 1], middle: true }),
            ),
          ],
        }),
    ),
  ];

  return [
    para("B Diploma Assessment Rubric", {
      size: 12,
      align: AlignmentType.CENTER,
      before: 6,
      after: 5,
    }),
    para(B_RUBRIC_PREAMBLE, { size: SMALL, after: 5 }),
    new Table({ width: FULL_WIDTH, columnWidths: COLS, rows }),
  ];
}

/**
 * The Coach Development Plan, which the coach fills in rather than the CETs.
 *
 * A canvas of empty boxes on FQ's copy, drawn as floating shapes. It is a table
 * here, because a page of free-floating text boxes is what makes a Word file
 * impossible to edit without dragging things around, and the whole point of
 * this page is that somebody types into it. The arrangement is theirs: the
 * coach's details down the left, strengths and the competency panels across the
 * top, the gap and the plan beneath.
 */
const PLAN_MAROON = MAROON;

function developmentPlan() {
  const COLS = [3000, 5800, 5800];
  const TALL = { value: 1700, rule: HeightRule.ATLEAST };

  const heading = (label: string) =>
    para(label, { bold: true, size: 14, color: "FF9E0C" });

  const field = (label: string) =>
    tc([para(label, { bold: true, size: BODY, align: AlignmentType.CENTER })], {
      width: COLS[0],
      middle: true,
      color: PLAN_MAROON,
    });

  /** One of the two competency panels, which are the only filled cells. */
  const panel = (title: string, items: string[]) =>
    tc(
      [
        para(title, { bold: true, size: BODY, color: "2E7116", align: AlignmentType.CENTER }),
        para(items.join("    "), {
          size: SMALL,
          color: "2E7116",
          align: AlignmentType.CENTER,
        }),
      ],
      { width: COLS[2], fill: "FBE4D5", middle: true, color: PLAN_MAROON },
    );

  return [
    new Paragraph({ children: [new PageBreak()] }),
    para("COACH DEVELOPMENT PLAN – B DIPLOMA", {
      bold: true,
      size: 18,
      align: AlignmentType.CENTER,
      after: 2,
    }),
    para("Section to be filled by the Coach", {
      size: 14,
      align: AlignmentType.CENTER,
      after: 8,
    }),
    new Table({
      width: FULL_WIDTH,
      columnWidths: COLS,
      rows: [
        new TableRow({
          height: TALL,
          children: [
            tc([para("Insert Picture of Coach", { size: BODY, align: AlignmentType.CENTER })], {
              width: COLS[0],
              middle: true,
              color: PLAN_MAROON,
            }),
            tc(
              [
                para("COACH DEVELOPMENT PLAN – B DIPLOMA", {
                  bold: true,
                  size: 14,
                  align: AlignmentType.CENTER,
                }),
              ],
              { span: 2, width: COLS[1] + COLS[2], middle: true, color: PLAN_MAROON },
            ),
          ],
        }),
        new TableRow({
          height: TALL,
          children: [
            field("Name:"),
            // Strengths runs beside all three competency rows, as on their
            // page, which is why it is a rowSpan rather than three cells.
            tc([heading("STRENGTHS")], { width: COLS[1], rowSpan: 3, color: PLAN_MAROON }),
            tc([heading("FA COACHING COURSE COMPETENCIES")], {
              width: COLS[2],
              middle: true,
              color: PLAN_MAROON,
            }),
          ],
        }),
        new TableRow({
          children: [field("Team:"), panel("OFF FIELD", FA_COMPETENCIES.offField)],
        }),
        new TableRow({
          children: [field("Years Coaching:"), panel("ON FIELD", FA_COMPETENCIES.onField)],
        }),
        new TableRow({
          height: TALL,
          children: [
            field("Qualifications:"),
            tc([heading("PERFORMANCE GAP")], {
              width: COLS[1],
              rowSpan: 2,
              color: PLAN_MAROON,
            }),
            tc([heading("GOALS/PLAN")], { width: COLS[2], rowSpan: 2, color: PLAN_MAROON }),
          ],
        }),
        new TableRow({ height: TALL, children: [field("Mentor:")] }),
      ],
    }),
  ];
}

/* ------------------------------ The documents ----------------------------- */

/**
 * FQ's wording, transcribed from the two copies.
 *
 * The action plan's paragraphs are the C form's, which is why they read the
 * same — FQ use one covering letter across both diplomas. The feedback
 * letter's are its own and are *not* the C form's competent variant: that one
 * was written here for want of an FQ version, and this one is FQ's, so the B
 * Diploma uses theirs.
 */
const B_NARRATIVE = {
  opening: (name: string, qualification: string) =>
    `${name}, Congratulations on attending the Football Australia/AFC ${qualification} — this marks an important milestone in your coaching journey.`,
  framing:
    "Your formative assessment represents a valuable opportunity to build on what you have learned throughout the course. The CETs have identified both key strengths and areas where further development is needed. Continue to excel in your strengths - keep thriving in these areas. For the performance gap, we are looking for you to narrow the gap and show improvement in the upcoming months.",
  notYetCompetent: (qualification: string) =>
    `At this stage, the CETs for the ${qualification} have determined that your practical performance is not yet at the level required to be deemed competent in the course. We are sharing this information now to ensure you have ample time to focus on the areas identified and to work closely with your mentor to address the performance gaps outlined above.`,
  feedbackOpening: (qualification: string) =>
    `Congratulations on attending the Football Australia/AFC ${qualification} — this marks an important milestone in your coaching journey.`,
  feedbackFraming:
    "Your formative assessment that has been ongoing throughout the course represents a valuable opportunity to build on what you have learned throughout the course. The CETs have observed and consistently provided feedback after each practical component that you have delivered over the different blocks. This includes general comments of the session, as well as key areas to continually work on to further develop to the next level. Please see below for the feedback.",
  competent: (qualification: string) =>
    `At the conclusion of this course, the CETs for the ${qualification} have determined that your practical performance meets the standard required to be deemed competent. Congratulations.`,
  competentSupport:
    "The feedback provided is intended to support your continued professional development beyond the completion of the course. We encourage you to find a ‘critical friend’ and to continue to evaluate and reflect upon your coaching practice as part of your ongoing coaching life cycle.",
  competentClose: "We wish you every success in your continued coaching journey.",
};

/** The action plan's covering letter, inside its single ruled box. */
function actionPlanNarrative(coach: RegisterCoach, qualification: string) {
  const firstName = coach.name.trim().split(/\s+/)[0] || coach.name;
  return new Table({
    width: FULL_WIDTH,
    columnWidths: [TEXT_WIDTH],
    rows: [
      new TableRow({
        children: [
          tc(
            [
              para("ACTION PLAN / FURTHER COMMENTS", { bold: true, size: BODY, after: 6 }),
              para(B_NARRATIVE.opening(firstName, qualification), { size: BODY, after: 5 }),
              para(B_NARRATIVE.framing, { size: BODY, after: 5 }),
              para("Area of Strength:", { size: BODY, after: 3 }),
              bullet(""),
              bullet(""),
              bullet(""),
              para("Performance Gaps:", { size: BODY, before: 4, after: 3 }),
              bullet(""),
              bullet(""),
              bullet(""),
              // Highlighted on FQ's own copy, with the pen rather than a fill,
              // because it is the sentence the coach is meant to read first.
              para(B_NARRATIVE.notYetCompetent(qualification), {
                size: BODY,
                before: 5,
                after: 2,
                highlight: "yellow",
              }),
            ],
            { width: TEXT_WIDTH },
          ),
        ],
      }),
    ],
  });
}

/** `'B' Diploma Practical Coaching Formative Assessment`. */
export function bActionPlanBlocks(coach: RegisterCoach, register: ParsedRegister) {
  const qualification = quotedDiploma(register.qualification);
  return [
    candidateBlock(coach, register),
    para("", { size: 5 }),
    gradingBand(),
    para("", { size: 3 }),
    // The headings take their colour from the level the CET gave that session,
    // which is the shading on the register's own write-up cell. That is where
    // FQ's copy gets it: Beau's fourth delivery is yellow where his first
    // three are salmon.
    ...deliveryTable(coach, TEXT_WIDTH, { byLevel: "fill" }),
    para("", { size: 5 }),
    // The band again above the tick table. FQ's copy repeats it, and it earns
    // the repeat: the deliveries can run to a second page, and a CET ticking
    // the table wants the key on the page they are ticking.
    gradingBand(),
    para("", { size: 3 }),
    tickTable(),
    para("", { size: 5 }),
    actionPlanNarrative(coach, qualification),
    para("", { size: 5 }),
    signOff(coach, register, { columns: SIGN_COLS, before: [outcomeRow()] }),
    new Paragraph({ children: [new PageBreak()] }),
    ...rubricAppendix(),
    ...developmentPlan(),
  ];
}

/** `'B' Diploma Practical Coaching Post-course Feedback`. */
export function bFeedbackBlocks(coach: RegisterCoach, register: ParsedRegister) {
  const qualification = quotedDiploma(register.qualification);
  return [
    candidateBlock(coach, register),
    para("", { size: 5 }),
    new Table({
      width: FULL_WIDTH,
      columnWidths: [TEXT_WIDTH],
      rows: [
        new TableRow({
          children: [
            tc(
              [
                para("PRACTICAL COMMENTS", { bold: true, size: BODY, after: 6 }),
                para(B_NARRATIVE.feedbackOpening(qualification), { size: BODY, after: 5 }),
                para(
                  [
                    text(`${B_NARRATIVE.feedbackFraming} `, { size: BODY }),
                    text("The feedback is colour coded to reflect ", { size: BODY }),
                    text("not yet competent", { size: BODY, color: LEGEND.NYC }),
                    text(", ", { size: BODY }),
                    text("competent", { size: BODY, color: LEGEND.C }),
                    text(" or ", { size: BODY }),
                    text("highly competent", { size: BODY, color: LEGEND.HC }),
                    text(
                      ", as per the assessment rubric at the bottom of the document.",
                      { size: BODY },
                    ),
                  ],
                  { after: 2 },
                ),
              ],
              { width: TEXT_WIDTH },
            ),
          ],
        }),
      ],
    }),
    para("", { size: 3 }),
    // The write-ups themselves are coloured here rather than the headings,
    // which is how FQ's letter does it — the text keeps the colour of the
    // register cell it was pasted out of.
    ...deliveryTable(coach, TEXT_WIDTH, { byLevel: "text" }),
    para("", { size: 3 }),
    new Table({
      width: FULL_WIDTH,
      columnWidths: [TEXT_WIDTH],
      rows: [
        new TableRow({
          children: [
            tc(
              [
                para(B_NARRATIVE.competent(qualification), { size: BODY, after: 5 }),
                para(B_NARRATIVE.competentSupport, { size: BODY, after: 5 }),
                para(B_NARRATIVE.competentClose, { size: BODY, after: 2 }),
              ],
              { width: TEXT_WIDTH },
            ),
          ],
        }),
      ],
    }),
    para("", { size: 3 }),
    signOff(coach, register, { columns: SIGN_COLS, before: [outcomeRow()], signature: false }),
    new Paragraph({ children: [new PageBreak()] }),
    ...rubricAppendix(),
  ];
}

/** What the letterhead and the footer say, which differs by document here. */
export function bDocumentTitle(register: ParsedRegister, competent: boolean) {
  const qualification = quotedDiploma(register.qualification);
  return competent
    ? `${qualification} Practical Coaching Post-course Feedback`
    : `${qualification} Practical Coaching Formative Assessment`;
}
