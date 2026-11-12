import "server-only";

import {
  AlignmentType,
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
  bullet,
  candidateBlock,
  deliveryTable,
  isBDiploma,
  labelled,
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
} from "@/lib/fq-docx";
import type { ParsedRegister, RegisterCoach } from "@/lib/register-file";

/** The C form appendix's four level headings, which are a traffic light. */
const LEVEL_FILLS = ["A6A6A6", "EE0000", "FFC000", "00B050"];

/**
 * FQ's `‘C’ Diploma Practical Coaching Assessment` document, filled in from a
 * register.
 *
 * Laid out off `NAME - C Diploma Live or Video Assessment / Self-reflection`
 * of 9 November 2026, which replaced the October form this file was first
 * built from. Three things changed with it and all three are structural:
 *
 * 1. **The coach scores themselves first.** A `COACH SELF-REFLECTION` table
 *    sits above the assessors' half, six areas out of three in the coach's own
 *    words, and `FOR CET USE ONLY` divides the two.
 * 2. **The rubric is written in, not ticked.** The old form's four checkboxes
 *    per area are one `/3` cell. That is also what makes FQ's half points
 *    expressible: they score 1.5 for an area, FA's grid has no box between 1
 *    and 2, and a cell takes `1.5 / 3` without rounding anybody's mark.
 * 3. **The covering letter is shorter, and FQ now write both halves of it.**
 *    The competent paragraph used to be ours — written to their shape because
 *    their template only had the not-yet-competent wording — and theirs is on
 *    this form, so ours is gone. The strengths and gaps bullet lists went with
 *    the rewrite: the evidence column beside each area is where the CET writes
 *    now, and FQ took the duplicate off their own form.
 *
 * **Two documents out of one layout, and they differ by more than wording.**
 * The form as FQ hand it out is the *action plan*: the coach reflects, submits
 * a video, the assessors score it, and the page is forward-looking — hence the
 * video link, the blank assessment date and `Good luck with your next
 * attempt`. The *feedback* version is the end of a course, so the
 * video-assessment furniture comes off and the register's own practical
 * write-ups go on in its place. Blake asked for exactly that split on
 * 2026-11-12.
 *
 * **What this fills in, and what it leaves blank.** The feedback version
 * fills everything the register holds: the course facts, every practical
 * delivery's assessor, block, component, topic and write-up, the action steps
 * the assessors wrote, the per-delivery NYC/C/HC level as the heading's
 * colour, and the CETs' names. The six-area rubric is left blank on both,
 * because no 2026 register carries a rubric score — see the note at the head
 * of `register-file.ts`. Deriving eighteen points from a 1-5 rating would be
 * inventing a conversion nobody has published. The self-reflection is blank
 * because it is the coach's to write.
 */

/* ------------------------------- Geometry --------------------------------- */

/**
 * The C template's page margin, which is narrower than the B's 1134.
 *
 * Both diplomas are A4 landscape and the two forms are otherwise built the
 * same way, but FQ set this one at 720 a side and the tables are drawn to the
 * width that leaves. The margin is picked per document in `assessmentPlanDocx`
 * rather than shared, because a document is all one diploma either way.
 */
export const C_MARGIN = 720;

/** The C's text column, in twips. */
const C_WIDTH = 16840 - C_MARGIN * 2;

/**
 * A transcribed grid, scaled to the text column.
 *
 * The template's own grids sum to a little more than its text width — Word
 * lets a table overhang the right margin and FQ's file does — so every grid
 * here is the template's column *proportions* normalised to the column that is
 * actually there. Fixing the columns at all is the point: the templates fix
 * theirs, and a table left to fit itself gets re-laid out by Word around
 * whatever happens to be in it, which on a form full of deliberately empty
 * cells is nothing at all.
 */
function fit(cols: number[]) {
  const total = cols.reduce((sum, col) => sum + col, 0);
  return cols.map((col) => Math.round((col / total) * C_WIDTH));
}

const CANDIDATE_COLS = fit([3969, 3826, 3404, 4395]);
const REFLECTION_COLS = fit([3105, 2687, 9788]);
/** The grading band, and the total row under the score table that answers it. */
const BAND_COLS = fit([3119, 4415, 3616, 4370]);
/**
 * The score table's grid, which carries two rows of different shapes.
 *
 * Six scoring rows are `area | /3 | evidence`, where the evidence cell spans
 * the last three columns; the total row is `Total Score | NYC | C | HC`, where
 * the NYC cell spans the second and third. One grid serves both, which is how
 * the template does it and the only way the two line up down the page.
 */
const SCORE_COLS = fit([3105, 2707, 1134, 3827, 4830]);
const SIGN_COLS = fit([2410, 5126, 2387, 5670]);
const APPENDIX_COLS = fit([2310, 2820, 3405, 3165, 4140]);

/* ------------------------------- Narrative -------------------------------- */

/**
 * The covering paragraphs, in FQ's own words.
 *
 * All of it is now transcribed from their form, including the competent
 * finding. The previous version of this file carried a competent paragraph
 * written here, flagged in the code as the one piece of wording FQ had not
 * signed off, because their October template was pre-written for a coach who
 * had failed and offered no alternative. The 9 November form has both, so
 * theirs replaced ours.
 *
 * `opening` names the video or live assessment, which is true of the document
 * FQ hand out and not of a course feedback letter, so the feedback version
 * drops that clause. The closing line is one sentence on their form with a
 * slash in it — `your next attempt / coaching career` — because one template
 * serves both; here the two documents each take their own half.
 */
const NARRATIVE = {
  opening: (qualification: string, assessed: boolean) =>
    `Congratulations on attending the Football Australia/AFC ${qualification}${
      assessed ? " and in undertaking the video / live assessment" : ""
    } — this marks an important milestone in your coaching journey.`,
  competent: "Your practical performance is at the level required to be deemed competent – congratulations!",
  notYetCompetent:
    "At this stage your practical performance is not yet at the level required to be deemed competent. We are sharing this information now to ensure you have ample time to focus on the areas identified and to work closely with your mentor to address the performance gaps outlined above.",
  closing: (assessed: boolean) =>
    assessed ? "Good luck with your next attempt." : "Good luck with your coaching career.",
  practicalComments:
    "The CETs observed and provided feedback after each practical component you delivered throughout the course. This includes general comments on each session, as well as key areas to continue working on to develop to the next level.",
};

/* ------------------------------ Page blocks ------------------------------- */

/**
 * The candidate block, which is a different block on each of the two forms.
 *
 * The action plan's is the template's: the assessment date, whether it is to
 * be live or on video, and a line for the YouTube link, all blank, because
 * they describe an assessment that has not happened yet. The feedback version
 * is the end of a course, so those three come off and the course's own date
 * and location go back in their place.
 */
function cCandidateBlock(coach: RegisterCoach, register: ParsedRegister, assessed: boolean) {
  const left: [number, number] = [CANDIDATE_COLS[0], CANDIDATE_COLS[1]];
  const right: [number, number] = [CANDIDATE_COLS[2], CANDIDATE_COLS[3]];
  const rows = [
    new TableRow({
      children: [
        ...labelled("Candidate Name", coach.name, left),
        ...labelled("Accreditation Level", quotedDiploma(register.qualification), right),
      ],
    }),
  ];

  if (assessed) {
    rows.push(
      new TableRow({
        children: [
          // Blank. The register's course dates are not this date: the form is
          // handed over before the video assessment it heads.
          ...labelled("Assessment Date (MM/YY)", null, left),
          ...labelled("Video or Live Assessment", null, right),
        ],
      }),
      new TableRow({
        children: [
          tc([para("Video Link (upload to Youtube)", { bold: true, size: BODY })], {
            fill: SHADE,
            width: CANDIDATE_COLS[0],
          }),
          tc([para("", { size: BODY })], {
            span: 3,
            width: CANDIDATE_COLS[1] + CANDIDATE_COLS[2] + CANDIDATE_COLS[3],
          }),
        ],
      }),
    );
  } else {
    rows.push(
      new TableRow({
        children: [
          ...labelled("Course Date (MM/YY)", register.courseDates, left),
          ...labelled("Course Location", register.location, right),
        ],
      }),
    );
  }

  return new Table({ width: FULL_WIDTH, columnWidths: CANDIDATE_COLS, rows });
}

/**
 * The coach's own six-area reflection, blank.
 *
 * On the action plan only, and on FQ's form it is the first thing the coach
 * meets: they score themselves out of three and write why before the assessors
 * see the video. Nothing in the app or the register holds it — it is written
 * on the document after it is handed over, the same way the CETs' own evidence
 * is — so what the export can do is put the table there with the headings and
 * the guidance line right. `filled` takes it back on a rebuild.
 */
function selfReflection(filled?: CoachFilled) {
  const header = new TableRow({
    children: [
      tc(
        [
          para("COACH SELF-REFLECTION", { bold: true, size: BODY, after: 3 }),
          para(
            "For guidance in completing your self-reflection, please refer to the Assessment Rubric Criteria at the end of this document",
            { size: BODY },
          ),
        ],
        { fill: SHADE, span: 3, width: C_WIDTH },
      ),
    ],
  });

  const rows = DELIVERY_AREAS.map((area) => {
    const own = filled?.reflection?.[area.code];
    return new TableRow({
      cantSplit: true,
      children: [
        tc([para(areaHeading(area.code, area.title), { size: BODY, align: AlignmentType.CENTER })], {
          width: REFLECTION_COLS[0],
          middle: true,
        }),
        tc([para(scoreOutOfThree(own?.score), { size: BODY, align: AlignmentType.CENTER })], {
          width: REFLECTION_COLS[1],
          middle: true,
        }),
        tc(
          (own?.comment?.length ? own.comment : [""]).map((line) =>
            para(line, { size: SMALL }),
          ),
          { width: REFLECTION_COLS[2] },
        ),
      ],
    });
  });

  return new Table({ width: FULL_WIDTH, columnWidths: REFLECTION_COLS, rows: [header, ...rows] });
}

/**
 * The practical write-ups off the register, with their heading paragraph.
 *
 * The feedback version only, and the one thing on it that the register
 * actually fills. The old form carried these under a `PRACTICAL COMMENTS` box
 * on both documents; the new one has no such section at all, so they go on the
 * feedback letter under a plain heading and come off the action plan, which is
 * about the assessment still to come rather than the course just finished.
 */
function practicalComments(coach: RegisterCoach): (Paragraph | Table)[] {
  return [
    para("PRACTICAL COMMENTS", { bold: true, size: BODY, after: 3 }),
    para(NARRATIVE.practicalComments, { size: BODY, after: 4 }),
    // Shaded by the level the CET gave that session and with no 1-5 number on
    // it. The colour and the rating say the same thing about a session, the
    // colour is the one the CET set, and an unshaded delivery falls back to
    // the neutral grey rather than to the template's salmon, which means Not
    // Yet Competent on the same page.
    ...deliveryTable(coach, C_WIDTH, { headerFill: SHADE, byLevel: "fill", rating: false }),
  ];
}

/**
 * The six areas as the template heads them in its two scoring tables.
 *
 * Transcribed rather than built out of `FA_RUBRIC_APPENDIX`, which heads the
 * same six areas at much greater length: composing them from the appendix put
 * three lines in a cell the template fills with one and pushed the form onto a
 * third page.
 *
 * The sixth is the one divergence. FQ's form says `MOTIVATIONAL CLIMATE` in
 * these tables and `Environment` in the appendix on the following page, which
 * is a contradiction on one document rather than two names for two things, so
 * it is headed with both.
 */
const AREA_HEADINGS: Record<string, string> = {
  OBJECTIVE: "OBJECTIVE",
  CONTENT: "CONTENTS – 5Rs",
  ORGANISATION: "ORGANISATION",
  PRESENTING: "PRESENTING / Engage – Explain - Exit",
  COACHING: "COACHING / Enter – Educate / Enhance - Ensure",
  ENVIRONMENT: "ENVIRONMENT / Motivational climate",
};

function areaHeading(code: string, title: string) {
  return AREA_HEADINGS[code] ?? title.toUpperCase();
}

/**
 * A score in the template's `/3` cell.
 *
 * `/3` on its own where there is no answer, which is the template's own
 * placeholder, and `1.5 / 3` where there is. Half points are the reason this
 * is a cell rather than the four checkboxes the October form had: FQ settle
 * the six areas by email after a course closes and score 1.5 for an area that
 * drew constructive feedback, FA's grid has no box between 1 and 2, and
 * rounding to the nearest box would change a coach's mark.
 */
function scoreOutOfThree(score?: number) {
  return score === undefined ? "/3" : `${score} / 3`;
}

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
          // The template's own inequalities rather than the ranges the October
          // form printed: `(<9)`, `(9 ≤ x < 12)`, `(≥12)`. They say the same
          // thing about an integer total and the right thing about a total that
          // ends in a half, which this form's cells can now carry.
          band(`NYC – Not Yet Competent (<${thresholds.competent})`, NYC_FILL, BAND_COLS[1]),
          band(
            `C – Competent (${thresholds.competent} ≤ x < ${thresholds.highlyCompetent})`,
            COMPETENT_FILL,
            BAND_COLS[2],
          ),
          band(
            `HC – Highly Competent (≥${thresholds.highlyCompetent})`,
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
   * The coach's own self-reflection, keyed by `DeliveryArea.code`.
   *
   * Same reasoning as `BFilled.evidence`: it is typed into the exported Word
   * file, so a form rebuilt from the register destroys it unless it is handed
   * back in. Nothing in the app passes this.
   */
  reflection?: Partial<Record<string, { score?: number; comment?: string[] }>>;
};

/**
 * The assessors' six-area table, and the total under it.
 *
 * Left blank. A register carries no rubric score, so there is nothing to score
 * from — and a table filled in from the 1-5 session rating would be the
 * platform quietly asserting a conversion between two instruments that FA have
 * never published one for.
 *
 * The sixth area is headed `Environment` in the appendix and `MOTIVATIONAL
 * CLIMATE` in this table, and both are the template's own wording on the same
 * page. `DeliveryArea.title` is Environment, so the heading here follows the
 * appendix rather than copying a contradiction forward.
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

  const evidenceWidth = SCORE_COLS[2] + SCORE_COLS[3] + SCORE_COLS[4];
  const rows = DELIVERY_AREAS.map((area) => {
    // The CET's reasoning beside the score, which is where this form carries
    // its longest writing now that the strengths and gaps lists have gone, and
    // blank for them to fill in.
    const evidence = filled?.evidence?.[area.code] ?? [];
    return new TableRow({
      cantSplit: true,
      children: [
        tc([para(areaHeading(area.code, area.title), { size: BODY, align: AlignmentType.CENTER })], {
          width: SCORE_COLS[0],
          middle: true,
        }),
        tc(
          [para(scoreOutOfThree(scores?.[area.code]), { size: BODY, align: AlignmentType.CENTER })],
          { width: SCORE_COLS[1], middle: true },
        ),
        tc(
          (evidence.length ? evidence : [""]).map((line) => para(line, { size: SMALL })),
          { span: 3, width: evidenceWidth },
        ),
      ],
    });
  });

  // Three coloured cells with nothing to tick, which is the template's own
  // total row. The October form had none either and this file put a Word
  // checkbox in each; they are gone because the sdt renders as a crossed box
  // in anything but Word, and a letter converted to PDF with two outcomes
  // apparently ticked is worse than one a CET marks by hand.
  //
  // Where a complete set of scores does settle it, that outcome's label is
  // bold. It follows from the total rather than being asked for, because FA's
  // guide says what nine points means and asking twice only invites the two
  // disagreeing.
  const outcomeBox = (label: string, fill: string, width: number, band: string, span?: number) =>
    tc(
      [
        para(label, {
          size: BODY,
          bold: outcome?.label === band,
          align: AlignmentType.CENTER,
        }),
      ],
      { fill, width, middle: true, span },
    );

  rows.push(
    new TableRow({
      children: [
        tc(
          [
            para(`Total Score: ${total ?? "x"} / ${MAX_DELIVERY_POINTS}`, {
              size: BODY,
              align: AlignmentType.CENTER,
            }),
          ],
          { fill: SHADE, width: SCORE_COLS[0], middle: true },
        ),
        outcomeBox(
          "NYC – Not Yet Competent",
          NYC_FILL,
          SCORE_COLS[1] + SCORE_COLS[2],
          "Not Yet Competent",
          2,
        ),
        outcomeBox("C – Competent", COMPETENT_FILL, SCORE_COLS[3], "Competent"),
        outcomeBox("HC – Highly Competent", HIGHLY_FILL, SCORE_COLS[4], "Highly Competent"),
      ],
    }),
  );

  return [
    gradingBand(thresholds),
    para("", { size: 2 }),
    new Table({ width: FULL_WIDTH, columnWidths: SCORE_COLS, rows }),
    para("", { size: 2 }),
  ];
}

/**
 * The covering letter, inside the template's single ruled box.
 *
 * Shorter than the October form's, because FQ's rewrite is: the greeting, the
 * congratulation, the competency finding, and a line of good luck. The
 * framing paragraph and the blank `Area of Strength` / `Performance Gaps`
 * bullet lists are not on their new form and are not here either — the
 * evidence column beside each area is where the CET writes now, and the lists
 * were the same thing asked for twice.
 */
function narrativeBlock(
  coach: RegisterCoach,
  register: ParsedRegister,
  assessed: boolean,
  filled?: CoachFilled,
) {
  // Which letter this is follows the document, not the register's verdict. The
  // two agree in the bundle — the route asks for a feedback letter when the
  // register signed the coach off and an action plan otherwise — but an action
  // plan is by definition the document a coach who is not yet competent gets,
  // and the not-yet-judged bundle is action plans on coaches with no verdict
  // at all. A CET who has settled it ahead of the register says so in `filled`.
  const competent = filled?.outcome ? filled.outcome === "competent" : !assessed;
  const qualification = quotedDiploma(register.qualification);
  const firstName = coach.name.trim().split(/\s+/)[0] || coach.name;

  const inner: Paragraph[] = [
    para(competent ? "FEEDBACK / FURTHER COMMENTS" : "ACTION PLAN / FURTHER COMMENTS", {
      bold: true,
      size: BODY,
      after: 6,
    }),
    para(`Dear ${firstName},`, { size: BODY, after: 5 }),
    para(NARRATIVE.opening(qualification, assessed), { size: BODY, after: 5 }),
    para(competent ? NARRATIVE.competent : NARRATIVE.notYetCompetent, {
      size: BODY,
      after: 5,
    }),
  ];

  // The bullets FQ took off their form, back only where a CET has actually
  // written some. Twelve of the Moreton action plans came back with them filled
  // in by hand, and a rebuild that dropped them would be destroying the CET's
  // work rather than following the template.
  if (filled?.strengths?.length) {
    inner.push(
      para("Area of Strength:", { size: BODY, after: 3 }),
      ...filled.strengths.map((line) => bullet(line)),
    );
  }
  if (filled?.gaps?.length) {
    inner.push(
      para("Performance Gaps:", { size: BODY, before: 4, after: 3 }),
      ...filled.gaps.map((line) => bullet(line)),
    );
  }

  if (coach.assessmentComment) {
    inner.push(
      para("Course comment:", { size: BODY, before: 4, after: 3 }),
      para(coach.assessmentComment, { size: BODY }),
    );
  }

  inner.push(para(NARRATIVE.closing(assessed), { size: BODY, before: 5, after: 2 }));

  return new Table({
    width: FULL_WIDTH,
    columnWidths: [C_WIDTH],
    rows: [new TableRow({ children: [tc(inner, { width: C_WIDTH })] })],
  });
}

/** FA's descriptor grid, which is the reference the scores are given against. */
function appendix() {
  const COLS = APPENDIX_COLS;
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
      bold: true,
      align: AlignmentType.CENTER,
      after: 6,
    }),
    new Table({ width: FULL_WIDTH, columnWidths: COLS, rows }),
  ];
}

/* -------------------------------- Packing --------------------------------- */

/**
 * One coach's C Diploma form.
 *
 * `assessed` is what separates the two documents: the action plan is the form
 * FQ hand out ahead of a video or live assessment, so it carries the coach's
 * self-reflection and the video link and nothing off the register; the
 * feedback version is the end of a course, so it carries the register's
 * practical write-ups instead.
 */
function coachBlocks(
  coach: RegisterCoach,
  register: ParsedRegister,
  kind: "action plan" | "feedback",
  filled?: CoachFilled,
) {
  const thresholds = thresholdsFor({
    qualification: register.qualification,
    title: register.courseTitle,
  });
  const assessed = kind === "action plan";

  return [
    cCandidateBlock(coach, register, assessed),
    para("", { size: 2 }),
    ...(assessed
      ? [
          selfReflection(filled),
          para("", { size: 2 }),
          para("FOR CET USE ONLY – To be completed by the Assessor", {
            size: BODY,
            align: AlignmentType.CENTER,
            after: 4,
          }),
        ]
      : practicalComments(coach)),
    para("", { size: 2 }),
    ...scoreTable(thresholds, filled),
    narrativeBlock(coach, register, assessed, filled),
    para("", { size: 2 }),
    signOff(coach, register, { columns: SIGN_COLS }),
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
 * readable. Both diplomas use the same page but not the same margins — FQ set
 * the C's 9 November form at 720 a side and the B's at 1134 — and a document
 * is all one diploma, so the margin is picked here.
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
   * `scores` and `reflection` are the C's and the B ignores them — the B ticks
   * a level per area and totals nothing. `levels` is the B's and the C ignores
   * it. `evidence`, `strengths`, `gaps` and `outcome` are read by both.
   */
  filled?: Record<string, CoachFilled>,
) {
  const b = isBDiploma(register);
  const margin = b ? 1134 : C_MARGIN;
  const competent = kind === "feedback";
  const title = b ? bDocumentTitle(register, competent) : documentTitle(register);

  const blocksFor = (coach: RegisterCoach) =>
    b
      ? competent
        ? bFeedbackBlocks(coach, register, filled?.[coach.name])
        : bActionPlanBlocks(coach, register, filled?.[coach.name])
      : coachBlocks(coach, register, kind, filled?.[coach.name]);

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: pt(BODY), color: INK } } } },
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
  const what = kind === "feedback" ? "Feedback" : "Action Plan";
  return docxFilename(
    coach.name,
    `${register.qualification ?? "Diploma"} Assessment`,
    what,
  );
}

export { docxFilename };
