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
  thresholdsFor,
} from "@/lib/delivery-rubric";
import { APPENDIX_LEVELS, FA_RUBRIC_APPENDIX } from "@/lib/fa-rubric-appendix";
import {
  cell,
  docxFilename,
  FONT,
  footer,
  FULL_WIDTH,
  heading,
  INK,
  letterhead,
  MUTED,
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
 * One page per coach, laid out off the copy returned for Leesa Faunt's October
 * 2026 C Diploma assessment: the candidate block, the practical write-ups
 * side by side, the grading scale, the six-area rubric, the narrative with its
 * strengths and performance gaps, the CET signatures, and FA's rubric as an
 * appendix.
 *
 * **Two documents out of one layout.** The template's covering paragraph is
 * pre-written for a coach who has not been deemed competent, while the form
 * above it still offers a Competent box — one document cannot carry both, and
 * the structure note at
 * `/mnt/project-files/action-plan-doc/c-diploma-action-plan-structure.md`
 * flagged it. So the narrative is conditional: a coach the register has signed
 * off as passed gets the feedback wording, and a coach who needs an action plan
 * gets the referral wording. Everything else on the page is identical, because
 * it is the same assessment either way.
 *
 * **What this fills in, and what it leaves blank.** Everything the register
 * holds is filled: the course facts, every practical delivery's assessor,
 * block, component, topic and write-up, the action steps the assessors wrote,
 * the 1-5 session and course ratings, and the CETs' names. The six-area rubric
 * is left for the CETs to tick, and the total out of eighteen left blank,
 * because no 2026 register carries a rubric score — see the note at the head of
 * `register-file.ts`. Deriving eighteen points from a 1-5 rating would be
 * inventing a conversion nobody has published. Areas of strength are left blank
 * for the same reason: the register records gaps, in the action steps, and
 * nothing in it is marked as a strength.
 *
 * Layout lives here and nowhere else, but the brand does not — see
 * `fq-docx.ts`, which this shares with the outcome sheet.
 */

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

/* ------------------------------ Page blocks ------------------------------- */

/** FQ's four-field candidate block, which is what somebody files the page by. */
function candidateBlock(coach: RegisterCoach, register: ParsedRegister) {
  const field = (label: string, value: string | null) =>
    cell(
      [
        para(label, { bold: true, size: 8, color: MUTED, caps: true }),
        para(value || "", { size: 10 }),
      ],
      { width: 25 },
    );
  return new Table({
    width: FULL_WIDTH,
    rows: [
      new TableRow({
        children: [
          field("Candidate name", coach.name),
          field("Accreditation level", register.qualification),
        ],
      }),
      new TableRow({
        children: [
          field("Course date", register.courseDates),
          field("Course location", register.location),
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
            text(`${label}: `, { bold: true, size: 8, color: MUTED }),
            text(value, { size: 8 }),
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
    blocks.push(para("Comment", { bold: true, size: 8, color: MUTED, before: 4 }));
    // The write-ups are paragraphed by the assessor and reflow badly as one
    // run, so the line breaks they typed are kept.
    for (const line of delivery.comment.split(/\r?\n/).filter(Boolean)) {
      blocks.push(para(line, { size: 8 }));
    }
  }

  if (delivery.actions.length) {
    blocks.push(para("Action plan", { bold: true, size: 8, color: MUTED, before: 4 }));
    delivery.actions.forEach((step, i) => {
      blocks.push(para(`${i + 1}. ${step}`, { size: 8 }));
    });
  }

  if (delivery.rating !== null) {
    blocks.push(
      para(
        [
          text("Session rating (1-5): ", { bold: true, size: 8, color: MUTED }),
          text(String(delivery.rating), { size: 8 }),
        ],
        { before: 4 },
      ),
    );
  }

  return cell(blocks.length ? blocks : [para("—", { size: 8, color: MUTED })], { width });
}

/**
 * The practical write-ups, one column each, as the template sets them out.
 *
 * Side by side rather than stacked because that is how a CET reads them: the
 * point of the block is the arc across the three deliveries, and a coach whose
 * first session was prompted throughout and whose third was not has a story
 * that a vertical list hides.
 */
function practicalComments(coach: RegisterCoach) {
  if (!coach.deliveries.length) {
    return [
      heading("Practical comments"),
      para(
        "No practical delivery write-ups for this coach on the register's Assessment sheet.",
        { size: 9, color: MUTED, after: 6 },
      ),
    ];
  }

  const width = Math.floor(100 / coach.deliveries.length);
  return [
    heading("Practical comments"),
    para(NARRATIVE.practicalComments, { size: 8, color: MUTED, after: 4 }),
    new Table({
      width: FULL_WIDTH,
      rows: [
        new TableRow({
          tableHeader: true,
          children: coach.deliveries.map((d) =>
            cell([para(`Practical Delivery ${d.deliveryNo}`, { bold: true, size: 9 })], {
              width,
              shaded: true,
            }),
          ),
        }),
        new TableRow({
          children: coach.deliveries.map((d) => deliveryCell(d, width)),
        }),
      ],
    }),
  ];
}

/** The grading scale as one ruled row, which is how the template states it. */
function gradingBand(thresholds: ReturnType<typeof thresholdsFor>) {
  const band = (label: string, range: string) =>
    cell(
      [para(label, { bold: true, size: 8 }), para(range, { size: 8, color: MUTED })],
      { width: 30 },
    );
  return new Table({
    width: FULL_WIDTH,
    rows: [
      new TableRow({
        children: [
          cell([para("Grading", { bold: true, size: 8, caps: true })], {
            width: 10,
            shaded: true,
          }),
          band("NYC — Not Yet Competent", `0–${thresholds.competent - 1}`),
          band("C — Competent", `${thresholds.competent}–${thresholds.highlyCompetent - 1}`),
          band("HC — Highly Competent", `${thresholds.highlyCompetent}–${MAX_DELIVERY_POINTS}`),
        ],
      }),
    ],
  });
}

/** A digit over a tickable box, which is one cell of the rubric's tick table. */
function scoreBox(score: number) {
  return cell(
    [
      para(String(score), { size: 9, align: AlignmentType.CENTER }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0 },
        children: [new CheckBox({})],
      }),
    ],
  );
}

/**
 * The six-area tick table, blank.
 *
 * Real Word checkboxes rather than drawn ones: this document is sent out to be
 * completed and signed, and a box somebody can click is the difference between
 * filling the form in Word and printing it to tick by hand.
 *
 * Left blank, with a line saying why. A register carries no rubric score, so
 * there is nothing to tick from — and a table pre-filled from the 1-5 rating
 * would be the platform quietly asserting a conversion between two instruments
 * that FA have never published one for.
 */
function rubricTable(thresholds: ReturnType<typeof thresholdsFor>) {
  const rows = DELIVERY_AREAS.map((area) => {
    const appendix = FA_RUBRIC_APPENDIX.find((r) => r.code === area.code);
    return new TableRow({
      cantSplit: true,
      children: [
        cell(
          [
            para(area.title, { bold: true, size: 9, caps: true }),
            ...(appendix?.heading.slice(1).length
              ? [para(appendix.heading.slice(1).join(" · "), { size: 7, color: MUTED })]
              : []),
          ],
        ),
        scoreBox(0),
        scoreBox(1),
        scoreBox(2),
        scoreBox(3),
        cell([para("", { size: 9 })],
          // The evidence column. Wide on purpose: it is the only part of this
          // table anybody writes in.
          {}),
      ],
    });
  });

  const outcomeBox = (label: string) =>
    cell(
      [
        new Paragraph({
          spacing: { before: 0, after: 0 },
          children: [new CheckBox({}), text(`  ${label}`, { size: 8 })],
        }),
      ],
    );

  // The total and the outcome in a table of their own, rather than as a last
  // row of the grid above. The grid is six narrow score columns and a wide
  // comment column; three outcome boxes laid across those columns come out in
  // the wrong places however the spans are arranged.
  const totals = new Table({
    width: FULL_WIDTH,
    // Fixed widths, in twips across the landscape text column. Percentages
    // alone let Word re-fit a table around its contents, and a ticked row of
    // empty boxes has no contents to fit around.
    columnWidths: [3600, 3946, 3946, 3946],
    rows: [
      new TableRow({
        children: [
          cell(
            [
              para([
                text("Total score ", { bold: true, size: 9, caps: true }),
                text(`____ / ${MAX_DELIVERY_POINTS}`, { size: 9 }),
              ]),
            ],
            { shaded: true },
          ),
          outcomeBox("NYC — Not Yet Competent"),
          outcomeBox("C — Competent"),
          outcomeBox("HC — Highly Competent"),
        ],
      }),
    ],
  });

  return [
    heading("Assessment"),
    gradingBand(thresholds),
    para(
      `The register carries no score on Football Australia's six-area rubric, so this table is blank for the CETs to complete. The outcome follows from the total: ${thresholds.competent} points is the minimum for competency on this diploma and ${thresholds.highlyCompetent} is Highly Competent.` +
        (thresholds.inferred
          ? " The Highly Competent line at this level is inferred from the C Diploma's three-point step, not quoted from FA."
          : ""),
      { size: 7, color: MUTED, before: 2, after: 2 },
    ),
    new Table({ width: FULL_WIDTH, columnWidths: [3000, 760, 760, 760, 760, 9398], rows }),
    totals,
    para("Comment column: the CET's evidence for the score in that row.", {
      size: 7,
      color: MUTED,
      after: 6,
    }),
  ];
}

/**
 * The narrative block: the covering letter, the gaps, and the course judgement.
 *
 * The performance gaps are the action steps the assessors already wrote on the
 * register, collated and labelled with the delivery each came from. That is the
 * one part of this document the register can genuinely fill, and it is the part
 * the coach acts on.
 */
function narrativeBlock(coach: RegisterCoach, register: ParsedRegister) {
  const competent = coach.verdict === "passed";
  const qualification = register.qualification
    ? `'${register.qualification.replace(/\s*diploma\s*$/i, "")}' Diploma`
    : "course";

  const blocks: (Paragraph | Table)[] = [
    heading(competent ? "Feedback / further comments" : "Action plan / further comments"),
    para(NARRATIVE.opening(qualification), { size: 9, after: 3 }),
    para(NARRATIVE.framing, { size: 9, after: 5 }),
    para("Areas of strength", { bold: true, size: 9, caps: true, after: 2 }),
    // Not filled in: nothing on a register is marked as a strength, and three
    // bullets of invented praise on a coach's own paperwork is worse than a
    // blank the CET fills.
    para("1.", { size: 9 }),
    para("2.", { size: 9 }),
    para("3.", { size: 9, after: 5 }),
    para(competent ? "Areas to continue working on" : "Performance gaps", {
      bold: true,
      size: 9,
      caps: true,
      after: 2,
    }),
  ];

  const steps = coach.deliveries.flatMap((d) =>
    d.actions.map((step) => ({ deliveryNo: d.deliveryNo, step })),
  );
  if (steps.length) {
    steps.forEach(({ deliveryNo, step }, i) => {
      blocks.push(
        para([
          text(`${i + 1}. `, { size: 9, bold: true }),
          text(step, { size: 9 }),
          text(`  (Practical Delivery ${deliveryNo})`, { size: 7, color: MUTED }),
        ]),
      );
    });
  } else {
    blocks.push(
      para("No action steps were recorded against this coach's deliveries.", {
        size: 9,
        color: MUTED,
      }),
    );
  }

  if (coach.assessmentComment) {
    blocks.push(
      para("Course comment", { bold: true, size: 9, caps: true, before: 5, after: 2 }),
      para(coach.assessmentComment, { size: 9 }),
    );
  }

  blocks.push(
    para(
      competent
        ? NARRATIVE.competent(qualification)
        : NARRATIVE.notYetCompetent(qualification),
      { size: 9, before: 5, after: 5 },
    ),
  );

  // The 1-5 course rating, which is a person's judgement across everything the
  // coach delivered and not an average of anything. Printed because it is the
  // figure that decides post-course support, and leaving it off the coach's own
  // paperwork would hide it from them.
  const band = bandFor(coach.rating);
  blocks.push(
    new Table({
      width: FULL_WIDTH,
      rows: [
        new TableRow({
          children: [
            cell(
              [
                para("Course rating (1-5)", { bold: true, size: 8, color: MUTED, caps: true }),
                para(
                  coach.rating === null
                    ? "Not rated"
                    : `${coach.rating}${band ? ` — ${band.faRating}` : ""}`,
                  { size: 9 },
                ),
              ],
              { width: 25 },
            ),
            cell(
              [
                para("Readiness for next licence", {
                  bold: true,
                  size: 8,
                  color: MUTED,
                  caps: true,
                }),
                para(coach.readiness || "", { size: 9 }),
              ],
              { width: 25 },
            ),
            cell(
              [
                para("Register outcome", { bold: true, size: 8, color: MUTED, caps: true }),
                para(coach.outcome || "", { size: 9 }),
              ],
              { width: 25 },
            ),
            cell(
              [
                para("Attendance / journal", {
                  bold: true,
                  size: 8,
                  color: MUTED,
                  caps: true,
                }),
                para(
                  [coach.attendanceMet, coach.journal]
                    .map((v) => (v === null ? "—" : v ? "Yes" : "No"))
                    .join(" / "),
                  { size: 9 },
                ),
              ],
              { width: 25 },
            ),
          ],
        }),
      ],
    }),
  );

  return blocks;
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

  const rows = (
    theirs.length
      ? theirs
      : cets.length
        ? cets
        : [
            { role: "CET 1", name: "" },
            { role: "CET 2", name: "" },
          ]
  ).map(
    (staff) =>
      new TableRow({
        children: [
          cell([para(staff.role.toUpperCase(), { bold: true, size: 8, color: MUTED })], {
            width: 15,
          }),
          cell([para(staff.name, { size: 9 })], { width: 35 }),
          cell([para("Signature", { bold: true, size: 8, color: MUTED })], { width: 15 }),
          cell([para("", { size: 9 })], { width: 35 }),
        ],
      }),
  );
  return [heading("Sign-off"), new Table({ width: FULL_WIDTH, rows })];
}

/** FA's descriptor grid, which is the reference the ticks are made against. */
function appendix() {
  const rows = [
    new TableRow({
      tableHeader: true,
      children: [
        cell([para("Assessment area", { bold: true, size: 8 })], { width: 16, shaded: true }),
        ...APPENDIX_LEVELS.map((level) =>
          cell([para(level, { bold: true, size: 8 })], { width: 21, shaded: true }),
        ),
      ],
    }),
    ...FA_RUBRIC_APPENDIX.map(
      (area) =>
        new TableRow({
          cantSplit: true,
          children: [
            cell(
              [
                para(area.heading[0], { bold: true, size: 8 }),
                ...area.heading.slice(1).map((sub) => para(sub, { size: 7, color: MUTED })),
              ],
              { width: 16 },
            ),
            ...area.levels.map((descriptor) =>
              cell(
                descriptor.split("\n").map((line) => para(line, { size: 7 })),
                { width: 21 },
              ),
            ),
          ],
        }),
    ),
  ];

  return [
    new Paragraph({ children: [new PageBreak()] }),
    heading("Football Australia coach education assessment rubric"),
    // One narrow column for the area and four equal ones for the descriptors,
    // which are long: left to fit itself, Word gives the area name a third of
    // the page and squeezes the text nobody can read without it.
    new Table({ width: FULL_WIDTH, columnWidths: [2400, 3260, 3260, 3260, 3258], rows }),
  ];
}

/* -------------------------------- Packing --------------------------------- */

function coachBlocks(coach: RegisterCoach, register: ParsedRegister, first: boolean) {
  const thresholds = thresholdsFor({
    qualification: register.qualification,
    title: register.courseTitle,
  });
  return [
    ...(first ? [] : [new Paragraph({ children: [new PageBreak()] })]),
    candidateBlock(coach, register),
    ...practicalComments(coach),
    ...rubricTable(thresholds),
    ...narrativeBlock(coach, register),
    ...signOff(coach, register),
    ...appendix(),
  ];
}

/** What the letterhead and the footer say, which is also what the file is. */
function documentTitle(register: ParsedRegister, kind: "action plan" | "feedback") {
  const level = register.qualification ?? "Coach education";
  return `${level} assessment — ${kind}`;
}

/**
 * One coach's document.
 *
 * Landscape, which is the template's own orientation and the only way three
 * practical write-ups fit side by side.
 */
export async function assessmentPlanDocx(coaches: RegisterCoach[], register: ParsedRegister) {
  const kind = coaches.every((c) => c.verdict === "passed") ? "feedback" : "action plan";
  const title = documentTitle(register, kind);

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: pt(9), color: INK } } } },
    sections: [
      {
        properties: {
          page: {
            size: { orientation: "landscape" },
            margin: {
              top: 1400,
              bottom: 900,
              left: 700,
              right: 700,
              header: 480,
              footer: 480,
            },
          },
        },
        headers: { default: await letterhead(title) },
        footers: { default: footer(title) },
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
