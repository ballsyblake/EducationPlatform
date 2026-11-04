import "server-only";

import {
  AlignmentType,
  BorderStyle,
  CheckBox,
  Document,
  PageBreak,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import {
  DELIVERY_AREAS,
  MAX_DELIVERY_POINTS,
  thresholdsFor,
} from "@/lib/delivery-rubric";
import { APPENDIX_LEVELS, FA_RUBRIC_APPENDIX } from "@/lib/fa-rubric-appendix";
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
import type { ParsedRegister, RegisterCoach, RegisterDelivery } from "@/lib/register-file";
import { bandFor } from "@/lib/support-rubric";

/**
 * FQ's `Assessment — Action Plan / Feedback` document, filled in from a
 * register.
 *
 * Laid out off the copy returned for Leesa Faunt's October 2026 C Diploma
 * assessment, and **laid out off it closely**: the same landscape page, the
 * same four-cell candidate block, the same salmon delivery headings, the same
 * grading band in grey, salmon, yellow and green, the same tick table with the
 * area centred and the descriptors beside it, the same red-amber-green rubric
 * appendix. A coach receiving one of these next to one typed by hand should not
 * be able to tell which was which.
 *
 * That is why this file carries a palette and column widths rather than
 * percentages and the house maroon. The first version of it was built in the
 * app's own visual language — maroon section bands, small grey labels — and
 * read as a different document, which on paperwork a coach signs is a
 * difference that matters. The brand furniture it does share lives in
 * `fq-docx.ts`.
 *
 * **Two documents out of one layout.** The template's covering paragraph is
 * pre-written for a coach who has not been deemed competent, while the form
 * above it still offers a Competent box — one document cannot carry both, and
 * the structure note at
 * `/mnt/project-files/action-plan-doc/c-diploma-action-plan-structure.md`
 * flagged it. So the narrative is conditional: a coach the register has signed
 * off as passed gets the feedback wording, and a coach who needs an action plan
 * gets the referral wording. Everything else is identical, because it is the
 * same assessment either way.
 *
 * **What this fills in, and what it leaves blank.** Everything the register
 * holds is filled: the course facts, every practical delivery's assessor,
 * block, component, topic and write-up, the action steps the assessors wrote,
 * the 1-5 session and course ratings, and the CETs' names. The six-area rubric
 * is left for the CETs to tick, and the total out of eighteen left blank,
 * because no 2026 register carries a rubric score — see the note at the head of
 * `register-file.ts`. Deriving eighteen points from a 1-5 rating would be
 * inventing a conversion nobody has published. Areas of strength are left blank
 * for the same reason: the register records gaps, in its action steps, and
 * nothing in it is marked as a strength.
 */

/* -------------------------------- Palette -------------------------------- */

// Lifted from the template's own fills, by hex, rather than approximated from
// the app's palette. These are the colours a CET sees on the form they already
// use; a near miss reads as a different document.
const SHADE = "F2F2F2"; // Label cells and the total-score cell.
const NYC_FILL = "FFC0B8"; // Not Yet Competent, and the delivery headings.
const COMPETENT_FILL = "FFEFAD";
const HIGHLY_FILL = "BFEFAE";

/** The appendix's four level headings, which are a traffic light. */
const LEVEL_FILLS = ["A6A6A6", "EE0000", "FFC000", "00B050"];

/** The template's rule: one hairline, mid grey, on every edge. */
const RULE = { style: BorderStyle.SINGLE, size: 4, color: "929292" } as const;
const BORDERS = { top: RULE, bottom: RULE, left: RULE, right: RULE };
const NONE = { style: BorderStyle.NONE, size: 0, color: "auto" } as const;

/**
 * Body text is 11pt here, not the 9pt the outcome sheet uses.
 *
 * The template is set at 11, and size is most of why the first version read as
 * a different document however closely the structure matched: the same page at
 * 9pt looks like a dense internal report rather than something handed to a
 * coach. The delivery cells and the rubric descriptors drop to 9.5, which is
 * what the template drops them to.
 */
const BODY = 11;
const SMALL = 9.5;

/* ------------------------------ Cell helpers ------------------------------ */

type CellOpts = {
  fill?: string;
  span?: number;
  /** Twips. The template fixes every table's columns, so this does too. */
  width?: number;
  align?: (typeof AlignmentType)[keyof typeof AlignmentType];
  middle?: boolean;
  borders?: boolean;
};

/**
 * The template's own cell margins: 57 twips top and bottom, the default sides.
 *
 * Named because the sides are arithmetic elsewhere — a table nested inside one
 * of these cells has to be built to the cell's content width, not the page's,
 * or it overhangs by exactly this much.
 */
const CELL_PAD = { top: 57, bottom: 57, left: 108, right: 108 } as const;

function tc(children: Paragraph[], o: CellOpts = {}) {
  return new TableCell({
    children,
    columnSpan: o.span,
    shading: o.fill ? { fill: o.fill } : undefined,
    width: o.width ? { size: o.width, type: WidthType.DXA } : undefined,
    verticalAlign: o.middle ? VerticalAlign.CENTER : undefined,
    borders: o.borders === false ? { top: NONE, bottom: NONE, left: NONE, right: NONE } : BORDERS,
    margins: { ...CELL_PAD },
  });
}

/** A label cell and its value, which is how the candidate block is built. */
function labelled(label: string, value: string | null, widths: [number, number]) {
  return [
    tc([para(label, { bold: true, size: BODY })], { fill: SHADE, width: widths[0] }),
    tc([para(value || "", { size: BODY })], { width: widths[1] }),
  ];
}

/* ------------------------------- Narrative -------------------------------- */

/**
 * The covering paragraphs, in FQ's own words.
 *
 * The opening and the framing are transcribed from the template. The closing
 * paragraph exists twice: `notYetCompetent` is the template's, verbatim bar the
 * diploma's name; `competent` is **not** on FQ's template, which has no
 * competent variant at all, and is written here to the same shape. It is the
 * one piece of wording in this document that FQ have not signed off, and it is
 * in one place so they can.
 */
const NARRATIVE = {
  opening: (qualification: string) =>
    `Congratulations on attending the Football Australia/AFC ${qualification} — this marks an important milestone in your coaching journey.`,
  framing:
    "Your formative assessment represents a valuable opportunity to build on what you have learned throughout the course. The CETs have identified both key strengths and areas where further development is needed. Continue to excel in your strengths - keep thriving in these areas. For the performance gap, we are looking for you to narrow the gap and show improvement in the upcoming months.",
  notYetCompetent: (qualification: string) =>
    `At this stage, the CETs for the ${qualification} have determined that your practical performance is not yet at the level required to be deemed competent in the course. We are sharing this information now to ensure you have ample time to focus on the areas identified and to work closely with your mentor to address the performance gaps outlined above. It is recommended that you reach out to a mentor/'critical friend' in your environment to continually seek feedback and self-evaluate. Next steps in working towards being competent will involve completing a video assessment in the next 3 to 6 months, with appropriate elevation and audio.`,
  competent: (qualification: string) =>
    `The CETs for the ${qualification} have determined that your practical performance meets the level required to be deemed competent in the course. The areas identified above are the ones to keep working on: competent is a standard reached, not a ceiling. It is recommended that you reach out to a mentor/'critical friend' in your environment to continually seek feedback and self-evaluate as you apply this in your own coaching.`,
  practicalComments:
    "The CETs observed and provided feedback after each practical component you delivered throughout the course. This includes general comments on each session, as well as key areas to continue working on to develop to the next level. This feedback is intended to support your ongoing development and should be read alongside the assessment and action plan below.",
};

/**
 * The diploma as the template writes it: `'C' Diploma`, curly quotes and all.
 *
 * Off the register's own `B Diploma` / `C Diploma`, because the whole document
 * is headed with it and FQ's wording quotes the letter.
 */
function quotedDiploma(qualification: string | null) {
  const letter = qualification?.trim().match(/^([abc])\b/i)?.[1]?.toUpperCase();
  return letter ? `‘${letter}’ Diploma` : (qualification?.trim() || "course");
}

/* ------------------------------ Page blocks ------------------------------- */

/** The template's four-cell candidate block, in its own column widths. */
function candidateBlock(coach: RegisterCoach, register: ParsedRegister) {
  const widths: [number, number] = [3666, 4129];
  const right: [number, number] = [3404, 3372];
  return new Table({
    width: FULL_WIDTH,
    columnWidths: [3666, 4129, 3404, 3372],
    rows: [
      new TableRow({
        children: [
          ...labelled("Candidate Name", coach.name, widths),
          ...labelled("Accreditation Level", quotedDiploma(register.qualification), right),
        ],
      }),
      new TableRow({
        children: [
          ...labelled("Course Date (MM/YY)", register.courseDates, widths),
          ...labelled("Course Location", register.location, right),
        ],
      }),
    ],
  });
}

/** One delivery's cell: the little form the register's own cell holds. */
function deliveryCell(delivery: RegisterDelivery, width: number) {
  const line = (label: string, value: string | null) =>
    value
      ? [
          para([
            text(`${label}: `, { bold: true, size: SMALL }),
            text(value, { size: SMALL }),
          ]),
        ]
      : [];

  const blocks: Paragraph[] = [
    ...line("Assessor", delivery.assessor),
    ...line("When", delivery.block),
    ...line("Component", delivery.component),
    ...line("Topic", delivery.topic),
  ];

  if (delivery.comment) {
    blocks.push(para("Comment:", { bold: true, size: SMALL, before: 5 }));
    // The write-ups are paragraphed by the assessor and reflow badly as one
    // run, so the line breaks they typed are kept.
    for (const line of delivery.comment.split(/\r?\n/).filter(Boolean)) {
      blocks.push(para(line, { size: SMALL }));
    }
  }

  if (delivery.actions.length) {
    blocks.push(para("Action plan:", { bold: true, size: SMALL, before: 5 }));
    delivery.actions.forEach((step, i) => {
      blocks.push(para(`${i + 1}. ${step}`, { size: SMALL }));
    });
  }

  if (delivery.rating !== null) {
    blocks.push(
      para(
        [
          text("Session rating (1-5): ", { bold: true, size: SMALL }),
          text(String(delivery.rating), { size: SMALL }),
        ],
        { before: 5 },
      ),
    );
  }

  return tc(blocks.length ? blocks : [para("—", { size: SMALL })], { width });
}

/**
 * The practical write-ups, one column each, as the template sets them out.
 *
 * Side by side rather than stacked because that is how a CET reads them: the
 * point of the block is the arc across the deliveries, and a coach whose first
 * session was prompted throughout and whose third was not has a story that a
 * vertical list hides.
 */
function practicalComments(coach: RegisterCoach, width: number) {
  const inner: (Paragraph | Table)[] = [
    para("PRACTICAL COMMENTS", { bold: true, size: BODY, after: 5 }),
    para(NARRATIVE.practicalComments, { size: BODY, after: 6 }),
  ];

  if (coach.deliveries.length) {
    // Inside the outer box, not the page: a nested table is laid out in its
    // parent cell's *content* area, so building it at the full text width
    // overhangs by the cell's own side padding and the box ends up with a
    // visible step down its left edge.
    const content = width - CELL_PAD.left - CELL_PAD.right;
    const each = Math.floor(content / coach.deliveries.length);
    inner.push(
      new Table({
        width: { size: each * coach.deliveries.length, type: WidthType.DXA },
        columnWidths: coach.deliveries.map(() => each),
        rows: [
          new TableRow({
            tableHeader: true,
            children: coach.deliveries.map((d) =>
              tc(
                [
                  para(`Practical Delivery ${d.deliveryNo}`, {
                    bold: true,
                    size: BODY,
                    align: AlignmentType.CENTER,
                  }),
                ],
                { width: each, fill: NYC_FILL },
              ),
            ),
          }),
          new TableRow({ children: coach.deliveries.map((d) => deliveryCell(d, each)) }),
        ],
      }),
    );
  } else {
    inner.push(
      para("No practical delivery write-ups for this coach on the register's Assessment sheet.", {
        size: BODY,
      }),
    );
  }

  // A cell may not end on a table: Word requires a paragraph after one, and
  // where there isn't one it supplies its own at the document's 11pt with the
  // default spacing under it, which leaves a band of white between the
  // deliveries and the bottom of the box. This is that paragraph, made as
  // short as a paragraph gets.
  if (coach.deliveries.length) inner.push(para("", { size: 1, after: 0 }));

  // The template wraps the whole block in one ruled box, heading and all.
  return new Table({
    width: FULL_WIDTH,
    columnWidths: [width],
    rows: [new TableRow({ children: [tc(inner as Paragraph[], { width })] })],
  });
}

/**
 * The grading band's columns, shared with the total row under the tick table.
 *
 * The template's own figures. The two rows have to agree: the band says what
 * each outcome means and the total row is where one of them is ticked, and a
 * reader lines them up by eye.
 */
const BAND_COLS = [3686, 4111, 3402, 3402];

/** The grading scale as the template's four coloured cells. */
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

/** A digit over a tickable box, which is one cell of the rubric's tick table. */
function scoreBox(score: number, width: number) {
  return tc(
    [
      para(String(score), { size: BODY, align: AlignmentType.CENTER }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0 },
        children: [new CheckBox({})],
      }),
    ],
    { width, middle: true },
  );
}

/**
 * The six-area tick table, blank, and the total under it.
 *
 * Real Word checkboxes rather than drawn ones, as on the template: this
 * document is sent out to be completed and signed, and a box somebody can click
 * is the difference between filling the form in Word and printing it to tick by
 * hand.
 *
 * Left blank, with a line saying why. A register carries no rubric score, so
 * there is nothing to tick from — and a table pre-filled from the 1-5 rating
 * would be the platform quietly asserting a conversion between two instruments
 * that FA have never published one for.
 *
 * The sixth area is headed `Environment`, which is what the template's own
 * appendix calls it and what `DeliveryScore.code` stores. The template's tick
 * table says `MOTIVATIONAL CLIMATE` on the same page as an appendix that says
 * Environment; following that would be copying a contradiction.
 */
function rubricTable(thresholds: ReturnType<typeof thresholdsFor>) {
  const COLS = [3686, 1028, 1028, 1028, 1027, 6804];

  const rows = DELIVERY_AREAS.map((area) => {
    const appendix = FA_RUBRIC_APPENDIX.find((r) => r.code === area.code);
    const sub = appendix?.heading.slice(1) ?? [];
    return new TableRow({
      cantSplit: true,
      children: [
        tc(
          [
            para(area.title, { size: BODY, caps: true, align: AlignmentType.CENTER }),
            ...(sub.length
              ? [para(sub.join(" – "), { size: SMALL, align: AlignmentType.CENTER })]
              : []),
          ],
          { width: COLS[0], middle: true },
        ),
        scoreBox(0, COLS[1]),
        scoreBox(1, COLS[2]),
        scoreBox(2, COLS[3]),
        scoreBox(3, COLS[4]),
        // The evidence column, blank: the CET's reasoning for the score beside
        // it, which is where the template carries its longest writing.
        tc([para("", { size: SMALL })], { width: COLS[5] }),
      ],
    });
  });

  const outcomeBox = (label: string, fill: string, width: number) =>
    tc(
      [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 0 },
          children: [text(`${label}    `, { size: BODY }), new CheckBox({})],
        }),
      ],
      { fill, width, middle: true },
    );

  // The total row sits under the grid but on the *grading band's* columns, not
  // the grid's, which is what the template does and the only way the three
  // outcomes line up with the three bands that define them. Spanning the grid
  // instead squeezes "NYC – Not Yet Competent" into the width of two
  // checkboxes, so it is a table of its own.
  const total = new Table({
    width: FULL_WIDTH,
    columnWidths: BAND_COLS,
    rows: [
      new TableRow({
        children: [
          tc(
            [
              para(`Total Score ____ / ${MAX_DELIVERY_POINTS}`, {
                size: BODY,
                align: AlignmentType.CENTER,
              }),
            ],
            { fill: SHADE, width: BAND_COLS[0], middle: true },
          ),
          outcomeBox("NYC – Not Yet Competent", NYC_FILL, BAND_COLS[1]),
          outcomeBox("C – Competent", COMPETENT_FILL, BAND_COLS[2]),
          outcomeBox("HC – Highly Competent", HIGHLY_FILL, BAND_COLS[3]),
        ],
      }),
    ],
  });

  return [
    gradingBand(thresholds),
    para("", { size: 4 }),
    new Table({ width: FULL_WIDTH, columnWidths: COLS, rows }),
    total,
    para(
      `The register carries no score on Football Australia's six-area rubric, so this table is for the CETs to complete. The outcome follows from the total: ${thresholds.competent} points is the minimum for competency on this diploma and ${thresholds.highlyCompetent} is Highly Competent.` +
        (thresholds.inferred
          ? " The Highly Competent line at this level is inferred from the C Diploma's three-point step, not quoted from FA."
          : ""),
      { size: SMALL, before: 3, after: 6 },
    ),
  ];
}

/** A bulleted line, as the template lists strengths and gaps. */
function bullet(content: TextRun[] | string) {
  return new Paragraph({
    children: typeof content === "string" ? [text(content, { size: BODY })] : content,
    bullet: { level: 0 },
    spacing: { before: 0, after: pt(2) },
  });
}

/**
 * The narrative block: the covering letter, the gaps, the course judgement and
 * the sign-off, all inside the template's single ruled box.
 *
 * The performance gaps are the action steps the assessors already wrote on the
 * register, collated and labelled with the delivery each came from. That is the
 * one part of this document the register can genuinely fill, and it is the part
 * the coach acts on.
 */
function narrativeBlock(coach: RegisterCoach, register: ParsedRegister, width: number) {
  const competent = coach.verdict === "passed";
  const qualification = quotedDiploma(register.qualification);

  const inner: Paragraph[] = [
    para(competent ? "FEEDBACK / FURTHER COMMENTS" : "ACTION PLAN / FURTHER COMMENTS", {
      bold: true,
      size: BODY,
      after: 6,
    }),
    para(NARRATIVE.opening(qualification), { size: BODY, after: 5 }),
    para(NARRATIVE.framing, { size: BODY, after: 5 }),
    para("Area of Strength:", { size: BODY, after: 3 }),
    // Not filled in: nothing on a register is marked as a strength, and three
    // bullets of invented praise on a coach's own paperwork is worse than a
    // blank the CET fills.
    bullet(""),
    bullet(""),
    para(competent ? "Areas to continue working on:" : "Performance Gaps:", {
      size: BODY,
      before: 4,
      after: 3,
    }),
  ];

  const steps = coach.deliveries.flatMap((d) =>
    d.actions.map((step) => ({ deliveryNo: d.deliveryNo, step })),
  );
  if (steps.length) {
    for (const { deliveryNo, step } of steps) {
      inner.push(
        bullet([
          text(step, { size: BODY }),
          text(`  (Practical Delivery ${deliveryNo})`, { size: SMALL }),
        ]),
      );
    }
  } else {
    inner.push(bullet("No action steps were recorded against this coach's deliveries."));
  }

  if (coach.assessmentComment) {
    inner.push(
      para("Course comment:", { size: BODY, before: 4, after: 3 }),
      para(coach.assessmentComment, { size: BODY }),
    );
  }

  inner.push(
    para(
      competent ? NARRATIVE.competent(qualification) : NARRATIVE.notYetCompetent(qualification),
      { size: BODY, before: 5, after: 2 },
    ),
  );

  return new Table({
    width: FULL_WIDTH,
    columnWidths: [width],
    rows: [new TableRow({ children: [tc(inner, { width })] })],
  });
}

/**
 * The course judgement, which the template has no box for and this needs one
 * for.
 *
 * FQ's form is a per-session instrument carrying a per-course decision, so the
 * 1-5 rating that actually decides post-course support is nowhere on it — the
 * structure note calls that out as the point of a per-course document. It goes
 * in the template's own plain-table language rather than a band of its own, and
 * below the narrative, so the page still reads as their form with one more row.
 */
function judgementBlock(coach: RegisterCoach, width: number) {
  const band = bandFor(coach.rating);
  const quarter = Math.floor(width / 4);
  const field = (label: string, value: string) =>
    tc(
      [
        para(label, { bold: true, size: SMALL }),
        para(value, { size: BODY }),
      ],
      { width: quarter },
    );
  return new Table({
    width: FULL_WIDTH,
    columnWidths: [quarter, quarter, quarter, quarter],
    rows: [
      new TableRow({
        children: [
          field(
            "Course rating (1-5)",
            coach.rating === null
              ? "Not rated"
              : `${coach.rating}${band ? ` — ${band.faRating}` : ""}`,
          ),
          field("Readiness for next licence", coach.readiness || ""),
          field("Register outcome", coach.outcome || ""),
          field(
            "Attendance / journal",
            [coach.attendanceMet, coach.journal]
              .map((v) => (v === null ? "—" : v ? "Yes" : "No"))
              .join(" / "),
          ),
        ],
      }),
    ],
  });
}

/**
 * The CET signature rows, off the register's own staff block.
 *
 * Narrowed to the CETs who actually assessed *this* coach. FQ's template has
 * two signature lines because a coach is watched by two assessors; a B Diploma
 * course has five CETs on it, and five lines on a document three of them never
 * saw is a form that invites the wrong signature.
 *
 * Matched on first name, because the Assessment sheet names an assessor by
 * first name alone ("Priscilla", "Martin") and the staff block has them in
 * full. Ambiguous where a course has two Martins — then both lines print, which
 * is the right failure: the assessors know which of them it was and the
 * document does not have to guess.
 */
function signOff(coach: RegisterCoach, register: ParsedRegister) {
  // CET1..CET5 only. The staff block also carries CX Support and whoever else
  // was on the course, and they do not sign an assessment.
  const cets = register.staff.filter((s) => /^cet/i.test(s.role));
  const assessors = new Set(
    coach.deliveries
      .map((d) => d.assessor?.trim().split(/\s+/)[0]?.toLowerCase())
      .filter(Boolean),
  );
  const theirs = cets.filter((s) => assessors.has(s.name.split(/\s+/)[0].toLowerCase()));
  const signing = theirs.length
    ? theirs
    : cets.length
      ? cets
      : [
          { role: "CET 1", name: "" },
          { role: "CET 2", name: "" },
        ];

  const COLS = [2505, 5292, 2693, 4081];
  return new Table({
    width: FULL_WIDTH,
    columnWidths: COLS,
    rows: signing.map(
      (staff, i) =>
        new TableRow({
          children: [
            // "CET 1", "CET 2" — renumbered for the document rather than
            // carried over as CET3/CET4, which are positions on the course.
            tc([para(`CET ${i + 1}`, { size: BODY })], { fill: SHADE, width: COLS[0] }),
            tc([para(staff.name, { size: BODY })], { width: COLS[1] }),
            tc([para("Signature", { size: BODY })], { fill: SHADE, width: COLS[2] }),
            tc([para("", { size: BODY })], { width: COLS[3] }),
          ],
        }),
    ),
  });
}

/** FA's descriptor grid, which is the reference the ticks are made against. */
function appendix() {
  const COLS = [2245, 3603, 3461, 3461, 3602];
  const rows = [
    new TableRow({
      tableHeader: true,
      children: [
        tc([para("Assessment Area", { bold: true, size: BODY })], { width: COLS[0] }),
        ...APPENDIX_LEVELS.map((level, i) =>
          tc(
            [
              para(level, {
                bold: true,
                size: BODY,
                color: "FFFFFF",
                align: AlignmentType.CENTER,
              }),
            ],
            { fill: LEVEL_FILLS[i], width: COLS[i + 1] },
          ),
        ),
      ],
    }),
    ...FA_RUBRIC_APPENDIX.map(
      (area) =>
        new TableRow({
          cantSplit: true,
          children: [
            tc(
              [
                para(area.heading[0], {
                  bold: true,
                  size: BODY,
                  align: AlignmentType.CENTER,
                }),
                ...area.heading.slice(1).map((sub) => bullet(sub)),
              ],
              { width: COLS[0], middle: true },
            ),
            ...area.levels.map((descriptor, i) =>
              tc(
                descriptor
                  .split("\n")
                  .map((line) => para(line, { size: SMALL, align: AlignmentType.CENTER })),
                { width: COLS[i + 1], middle: true },
              ),
            ),
          ],
        }),
    ),
  ];

  return [
    new Paragraph({ children: [new PageBreak()] }),
    para("Football Australia Coach Education Assessment Rubric", {
      size: BODY,
      align: AlignmentType.CENTER,
      after: 6,
    }),
    new Table({ width: FULL_WIDTH, columnWidths: COLS, rows }),
  ];
}

/* -------------------------------- Packing --------------------------------- */

/**
 * The text column, in twips.
 *
 * A4 landscape is 16840 wide and the template's margins are 1134 a side, which
 * leaves this. Every table on the page is built to it, because the template
 * fixes its columns and a table left to fit itself gets re-laid out by Word
 * around whatever happens to be in it — which, on a form whose cells are
 * deliberately empty, is nothing at all.
 */
const TEXT_WIDTH = 16840 - 1134 * 2;

function coachBlocks(coach: RegisterCoach, register: ParsedRegister, first: boolean) {
  const thresholds = thresholdsFor({
    qualification: register.qualification,
    title: register.courseTitle,
  });
  return [
    ...(first ? [] : [new Paragraph({ children: [new PageBreak()] })]),
    candidateBlock(coach, register),
    para("", { size: 5 }),
    practicalComments(coach, TEXT_WIDTH),
    para("", { size: 5 }),
    ...rubricTable(thresholds),
    narrativeBlock(coach, register, TEXT_WIDTH),
    para("", { size: 5 }),
    judgementBlock(coach, TEXT_WIDTH),
    para("", { size: 5 }),
    signOff(coach, register),
    ...appendix(),
  ];
}

/** What the letterhead and the footer say, which is the template's own line. */
function documentTitle(register: ParsedRegister) {
  return `${quotedDiploma(register.qualification)} Practical Coaching Assessment`;
}

/**
 * One coach's document.
 *
 * Landscape at the template's own page and margins, which is the only way the
 * practical write-ups fit side by side and the rubric's descriptors stay
 * readable.
 */
export async function assessmentPlanDocx(coaches: RegisterCoach[], register: ParsedRegister) {
  const title = documentTitle(register);

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: pt(BODY), color: INK } } } },
    sections: [
      {
        properties: {
          page: {
            size: { orientation: "landscape" },
            margin: {
              top: 1134,
              bottom: 1134,
              left: 1134,
              right: 1134,
              header: 578,
              footer: 641,
            },
          },
        },
        headers: { default: await assessmentHeader(title) },
        footers: { default: assessmentFooter(title) },
        children: coaches.flatMap((coach, i) => coachBlocks(coach, register, i === 0)),
      },
    ],
  });

  return Packer.toBuffer(doc);
}

/** What a coach's file is called inside the bundle. */
export function planFilename(coach: RegisterCoach, kind: "action plan" | "feedback") {
  return docxFilename(coach.name, kind);
}

export { docxFilename };
