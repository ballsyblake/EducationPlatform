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
} from "@/lib/delivery-rubric";
import { APPENDIX_LEVELS, FA_RUBRIC_APPENDIX } from "@/lib/fa-rubric-appendix";
import {
  bActionPlanBlocks,
  bDocumentTitle,
  bFeedbackBlocks,
  type BFilled,
} from "@/lib/b-diploma-docx";
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

/** The C form appendix's four level headings, which are a traffic light. */
const LEVEL_FILLS = ["A6A6A6", "EE0000", "FFC000", "00B050"];

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
  // The same opening sentence without the three that follow it. Those three
  // point at the strengths and gaps lists, and the feedback letter no longer
  // has them: a coach who passed is told so, not handed a form to fill in.
  framingCompetent:
    "Your formative assessment represents a valuable opportunity to build on what you have learned throughout the course.",
  notYetCompetent: (qualification: string) =>
    `At this stage, the CETs for the ${qualification} have determined that your practical performance is not yet at the level required to be deemed competent in the course. We are sharing this information now to ensure you have ample time to focus on the areas identified and to work closely with your mentor to address the performance gaps outlined above. It is recommended that you reach out to a mentor/'critical friend' in your environment to continually seek feedback and self-evaluate. Next steps in working towards being competent will involve completing a video assessment in the next 3 to 6 months, with appropriate elevation and audio.`,
  competent: (qualification: string) =>
    `The CETs for the ${qualification} have determined that your practical performance meets the level required to be deemed competent in the course. The areas identified above are the ones to keep working on: competent is a standard reached, not a ceiling. It is recommended that you reach out to a mentor/'critical friend' in your environment to continually seek feedback and self-evaluate as you apply this in your own coaching.`,
  practicalComments:
    "The CETs observed and provided feedback after each practical component you delivered throughout the course. This includes general comments on each session, as well as key areas to continue working on to develop to the next level. This feedback is intended to support your ongoing development and should be read alongside the assessment and action plan below.",
};

/* ------------------------------ Page blocks ------------------------------- */

/**
 * The practical comments box: the heading and FQ's standing paragraph.
 *
 * The write-ups themselves follow as their own table — see `deliveryTable` in
 * `assessment-plan-parts.ts` for why they are not inside this box.
 */
function practicalComments(coach: RegisterCoach, width: number): (Paragraph | Table)[] {
  const box = new Table({
    width: FULL_WIDTH,
    columnWidths: [width],
    rows: [
      new TableRow({
        children: [
          tc(
            [
              para("PRACTICAL COMMENTS", { bold: true, size: BODY, after: 5 }),
              para(NARRATIVE.practicalComments, { size: BODY, after: 0 }),
            ],
            { width },
          ),
        ],
      }),
    ],
  });
  if (!coach.deliveries.length) return [box, para("", { size: 3 }), ...deliveryTable(coach, width)];
  // Shaded by the level the CET gave that session and with the 1-5 number off
  // the write-up, both the same way round as the B's action plan. The template
  // heads all three columns in its salmon, but the salmon now means Not Yet
  // Competent on the same page, so an unshaded delivery falls back to the
  // neutral grey rather than to a colour that says something.
  return [
    box,
    para("", { size: 3 }),
    ...deliveryTable(coach, width, { headerFill: SHADE, byLevel: "fill", rating: false }),
  ];
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
function scoreBox(score: number, width: number, checked = false) {
  return tc(
    [
      para(String(score), { size: BODY, align: AlignmentType.CENTER }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0 },
        children: [new CheckBox({ checked })],
      }),
    ],
    { width, middle: true },
  );
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

/** Everything a CET may already have settled on one coach's form. */
export type CoachFilled = BFilled & { scores?: AreaScores };

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
function rubricTable(thresholds: ReturnType<typeof thresholdsFor>, scores?: AreaScores) {
  const COLS = [3686, 1028, 1028, 1028, 1027, 6804];

  const given = DELIVERY_AREAS.map((area) => scores?.[area.code]).filter(
    (value): value is number => typeof value === "number",
  );
  // Only once every area has an answer. A sheet half filled in is not a coach
  // who scored nothing in the rest, so a partial set leaves the total blank.
  const total = given.length === DELIVERY_AREAS.length
    ? given.reduce((sum, value) => sum + value, 0)
    : null;
  const outcome = total === null ? null : outcomeFor(total, thresholds);

  const rows = DELIVERY_AREAS.map((area) => {
    const appendix = FA_RUBRIC_APPENDIX.find((r) => r.code === area.code);
    const sub = appendix?.heading.slice(1) ?? [];
    const score = scores?.[area.code];
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
        scoreBox(0, COLS[1], score === 0),
        scoreBox(1, COLS[2], score === 1),
        scoreBox(2, COLS[3], score === 2),
        scoreBox(3, COLS[4], score === 3),
        // The evidence column: the CET's reasoning for the score beside it,
        // which is where the template carries its longest writing, and blank
        // for them to fill in.
        //
        // The awarded score goes here in words as well as in a tick, because
        // FQ score in half points — 1.5 for an area that drew constructive
        // feedback — and FA's grid has four boxes, 0 to 3, with nothing
        // between them. Rounding to the nearest box would change a coach's
        // mark, so a half score ticks nothing and is written out instead.
        tc(
          [
            para(
              score === undefined
                ? ""
                : `Awarded ${score}${Number.isInteger(score) ? "" : " — between the boxes above"}`,
              { size: SMALL },
            ),
          ],
          { width: COLS[5] },
        ),
      ],
    });
  });

  const outcomeBox = (label: string, fill: string, width: number, band: string) =>
    tc(
      [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 0 },
          children: [
            text(`${label}    `, { size: BODY }),
            // Ticked from the total rather than chosen again. FA's guide says
            // what nine points means, so a complete sheet already carries its
            // outcome and asking for it twice only invites the two
            // disagreeing. Nothing is ticked without a complete sheet.
            new CheckBox({ checked: outcome?.label === band }),
          ],
        }),
      ],
      { fill, width, middle: true },
    );

  // The total row sits under the grid but on the *grading band's* columns, not
  // the grid's, which is what the template does and the only way the three
  // outcomes line up with the three bands that define them. Spanning the grid
  // instead squeezes "NYC – Not Yet Competent" into the width of two
  // checkboxes, so it is a table of its own.
  const totalTable = new Table({
    width: FULL_WIDTH,
    columnWidths: BAND_COLS,
    rows: [
      new TableRow({
        children: [
          tc(
            [
              para(`Total Score ${total ?? "____"} / ${MAX_DELIVERY_POINTS}`, {
                size: BODY,
                align: AlignmentType.CENTER,
              }),
            ],
            { fill: SHADE, width: BAND_COLS[0], middle: true },
          ),
          outcomeBox("NYC – Not Yet Competent", NYC_FILL, BAND_COLS[1], "Not Yet Competent"),
          outcomeBox("C – Competent", COMPETENT_FILL, BAND_COLS[2], "Competent"),
          outcomeBox("HC – Highly Competent", HIGHLY_FILL, BAND_COLS[3], "Highly Competent"),
        ],
      }),
    ],
  });

  return [
    gradingBand(thresholds),
    para("", { size: 4 }),
    new Table({ width: FULL_WIDTH, columnWidths: COLS, rows }),
    totalTable,
    // No note under the table explaining that it comes out blank. The band
    // across the top already names the three outcomes and their point ranges,
    // and FQ's own form carries no such paragraph — it was the app explaining
    // itself on a document a coach signs, which is not the place for it. Why
    // the table is empty is in `CLAUDE.md` and in the page the export comes
    // from, for the people who need to know.
    para("", { size: 4 }),
  ];
}

/**
 * The covering letter, inside the template's single ruled box.
 *
 * Two documents come out of here and they are not the same letter. The action
 * plan is working paperwork: it carries the blank strengths and gaps lists the
 * CET fills in with the coach. The feedback letter is the end of the matter, so
 * it is the congratulation, the framing and the competency finding, and nothing
 * to fill in.
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
    para(competent ? NARRATIVE.framingCompetent : NARRATIVE.framing, { size: BODY, after: 5 }),
  ];

  // The two bullet lists are on the action plan only. They are blank for the
  // CET to fill in — nothing on a register is marked as a strength, and the
  // gaps are already written out against the delivery each came from on the
  // first page — so on a coach who passed they were an empty form stapled to a
  // letter saying the assessment is finished. The action plan is the document
  // that is still being worked on, and it keeps them.
  if (!competent) {
    inner.push(
      para("Area of Strength:", { size: BODY, after: 3 }),
      bullet(""),
      bullet(""),
      bullet(""),
      para("Performance Gaps:", { size: BODY, before: 4, after: 3 }),
      bullet(""),
      bullet(""),
      bullet(""),
    );
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

function coachBlocks(coach: RegisterCoach, register: ParsedRegister, scores?: AreaScores) {
  const thresholds = thresholdsFor({
    qualification: register.qualification,
    title: register.courseTitle,
  });
  return [
    candidateBlock(coach, register),
    para("", { size: 5 }),
    ...practicalComments(coach, TEXT_WIDTH),
    para("", { size: 5 }),
    ...rubricTable(thresholds, scores),
    narrativeBlock(coach, register, TEXT_WIDTH),
    para("", { size: 5 }),
    // No course-judgement table between the narrative and the sign-off. It was
    // ours, not FQ's — a row restating the register's rating, readiness,
    // outcome and attendance — and on a document whose whole point is that the
    // CETs make the judgement, printing the register's answer underneath their
    // blank rubric read as the decision already being taken.
    signOff(coach, register),
    ...appendix(),
  ];
}

/** What the letterhead and the footer say, which is the C template's own line. */
function documentTitle(register: ParsedRegister) {
  return `${quotedDiploma(register.qualification)} Practical Coaching Assessment`;
}

/**
 * One coach's document.
 *
 * Landscape at the templates' own page and margins, which is the only way the
 * practical write-ups fit side by side and the rubric's descriptors stay
 * readable. Both diplomas use the same page, so the section setup is shared
 * even though the blocks inside it are not.
 *
 * `kind` decides which document this is, not the coach's verdict, because the
 * export route already knows: it asks for a feedback letter when the register
 * signed the coach off and an action plan otherwise, and for the not-yet-judged
 * bundle it asks for action plans on coaches with no verdict at all. Deriving
 * it from the verdict here would send that bundle out as feedback letters the
 * moment somebody passed a single coach on the sheet.
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
   * and totals nothing. The rest is the B's and the C ignores it.
   */
  filled?: Record<string, CoachFilled>,
) {
  const b = isBDiploma(register);
  const competent = kind === "feedback";
  const title = b ? bDocumentTitle(register, competent) : documentTitle(register);

  const blocksFor = (coach: RegisterCoach) =>
    b
      ? competent
        ? bFeedbackBlocks(coach, register, filled?.[coach.name])
        : bActionPlanBlocks(coach, register, filled?.[coach.name])
      : coachBlocks(coach, register, filled?.[coach.name]?.scores);

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
  const what = kind === "feedback" ? "Feedback" : "Action Plan";
  return docxFilename(
    coach.name,
    `${register.qualification ?? "Diploma"} Assessment`,
    what,
  );
}

export { docxFilename };
