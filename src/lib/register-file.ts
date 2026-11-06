/**
 * Reading a course attendance register, as FQ's coach education team keep it.
 *
 * The same three sheets `scripts/extract-b-diploma-2026.py` reads — Course
 * Info, Attendance, Assessment — and the same tolerances, because they are the
 * same documents. What is different is the purpose: the script extracts a
 * register for *import*, which loads real coaches' records into the database
 * and is a decision somebody takes on purpose (see the data notes in
 * `CLAUDE.md`). This reads a register for *export*, so a cohort's action plans
 * and feedback letters can be written without anybody retyping thirty-five
 * assessments. Nothing here writes anything.
 *
 * Pure, and no database access, so both the upload action and the download
 * route can read the same register the same way.
 *
 * **What the register does not carry.** Not one of FQ's 2026 registers holds a
 * score on Football Australia's six-area rubric. Every delivery has an
 * assessor, a block, a component, a topic, a write-up and often three action
 * steps, and the only number is a free-text `Session Rating: n` on the 1-5
 * scale. So the documents this feeds have their rubric table and their total
 * out of eighteen left for the CETs to tick, and the pass/fail split comes off
 * the register's own Outcome and Rating columns. Deriving eighteen points from
 * a 1-5 rating would be inventing a conversion nobody has published — see
 * `delivery-rubric.ts`, which refuses the same thing.
 */

import { DEFAULT_RATING_THRESHOLD } from "@/lib/support-rubric";
import { readWorkbook, type SheetFills, type SheetRows, XlsxError } from "@/lib/xlsx";

export { XlsxError };

export class RegisterError extends Error {}

/* ------------------------------- The shape -------------------------------- */

/** One practical delivery, as one cell of the Assessment sheet reads. */
export type RegisterDelivery = {
  deliveryNo: number;
  assessor: string | null;
  /** The register's "When" — a block, sometimes a block and a day. */
  block: string | null;
  component: string | null;
  topic: string | null;
  comment: string | null;
  /** The numbered steps, with the numbering taken off. */
  actions: string[];
  /** The session's own 1-5 mark, where the assessor wrote one. */
  rating: number | null;
  /**
   * What the CET made of the session, read off the cell's own colour.
   *
   * The Assessment sheet is colour-coded: the write-up cell is shaded with
   * Excel's Bad, Neutral or Good cell style, which is the per-delivery
   * judgement FQ's own documents print in red, amber and green. It is the only
   * place on the register that judgement exists — there is no column for it —
   * and it is what the generated documents colour their delivery columns from.
   * Null where the assessor left the cell unshaded.
   */
  level: DeliveryLevel | null;
};

/** Not Yet Competent, Competent, Highly Competent — the three-level scale. */
export type DeliveryLevel = "NYC" | "C" | "HC";

/** A coach's headshot off the Assessment sheet, re-encoded small enough to
 * travel. Filled in by `attachCoachPhotos`, not by the parser — see the note
 * at the head of `register-photos.ts`. */
export type CoachPhoto = { base64: string; width: number; height: number };

/** What the register decided about a coach, and what this makes of it. */
export type RegisterVerdict =
  /** Outcome says Passed. Gets a feedback document. */
  | "passed"
  /** Below the pass mark, or the register already records an action plan. */
  | "action_plan"
  /** At the pass mark but not signed off — attendance or journal outstanding. */
  | "incomplete"
  /** No rating and no outcome. Nothing to classify on. */
  | "unrated";

export type RegisterCoach = {
  position: number;
  firstName: string;
  lastName: string;
  name: string;
  track: "MAIN" | "CATCH_UP";
  club: string | null;
  /** The course rating, 1-5 in half steps. */
  rating: number | null;
  /** The register's own Outcome column, verbatim: "Passed", "In Progress". */
  outcome: string | null;
  readiness: string | null;
  /** The register's Comments column, which is where action plans get noted. */
  comments: string | null;
  attendanceMet: boolean | null;
  journal: boolean | null;
  deliveries: RegisterDelivery[];
  assessmentComment: string | null;
  verdict: RegisterVerdict;
  /** Why, in the words the summary table shows. */
  reason: string;
  /**
   * The coach's photograph, where the register has one. Null until
   * `attachCoachPhotos` has run, and null for a coach with no column or no
   * picture — the documents simply leave the box empty.
   */
  photo: CoachPhoto | null;
};

export type ParsedRegister = {
  /** "B Diploma", from the Course Info sheet. */
  qualification: string | null;
  stream: string | null;
  location: string | null;
  /** The title the documents' letterhead carries. */
  courseTitle: string;
  /** "Oct 2026", or "May – Oct 2026" for a course that ran over blocks. */
  courseDates: string | null;
  /** CET1..CET5 and whoever else the staff block names. */
  staff: { role: string; name: string }[];
  coaches: RegisterCoach[];
  /** The 1-5 mark at or above which the register treats a coach as competent. */
  passMark: number;
  sourceFile: string;
  /**
   * Anything the register said that this could not use.
   *
   * Shown on the review page rather than swallowed: a missing Assessment sheet
   * produces thirty-five documents with no write-ups in them, and the person
   * about to send those to coaches should see why before they do.
   */
  warnings: string[];
};

/* ------------------------------ Cell reading ------------------------------ */

const BLANK = new Set(["", "-", "none", "n/a", "na", "tbc", "tbd", "?"]);

function blank(value: string | undefined | null) {
  return BLANK.has(String(value ?? "").trim().toLowerCase());
}

function cell(rows: SheetRows, row: number, col: number) {
  return rows[row]?.[col]?.trim() ?? "";
}

function squash(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * A number, or null for anything that is not one.
 *
 * The blank check is not redundant: `Number("")` is 0, and `Number(" ")` is 0
 * too. Without it an empty Rating column reads as a coach rated nought, and —
 * worse — the empty `#` column that ends the catch-up block reads as row zero,
 * so the roster reader runs straight on into the staff block and enrols CET1
 * Matt Poole as a coach needing an action plan.
 */
function num(value: string) {
  const trimmed = String(value).replace(",", ".").trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** The registers mark a day Yes/No. Anything else means nobody recorded it. */
function yesno(value: string) {
  const s = value.trim().toLowerCase();
  if (["yes", "y", "true", "1"].includes(s)) return true;
  if (["no", "n", "false", "0"].includes(s)) return false;
  return null;
}

/** Index of the first row whose `col` reads as `text`. */
function findRow(rows: SheetRows, col: number, text: string, start = 0) {
  const want = squash(text);
  for (let i = start; i < rows.length; i++) {
    if (squash(cell(rows, i, col)) === want) return i;
  }
  return -1;
}

/** Column index for every non-empty header in a row, keyed on squashed text. */
function headerColumns(row: string[] | undefined) {
  const out = new Map<string, number>();
  (row ?? []).forEach((value, i) => {
    const key = squash(value);
    if (key && !out.has(key)) out.set(key, i);
  });
  return out;
}

/**
 * Excel's day zero, for the dates on the Course Info sheet.
 *
 * 1899-12-30 rather than the 31st: the format still carries the phantom 1900
 * leap day it inherited from Lotus, and starting two days early absorbs it.
 */
const EPOCH = Date.UTC(1899, 11, 30);

function serialToDate(value: string) {
  const n = num(value);
  if (n === null || n < 1 || n > 100_000) return null;
  return new Date(EPOCH + Math.floor(n) * 86_400_000);
}

/* --------------------------- Assessment write-ups ------------------------- */

const FIELDS = [
  "assessor",
  "when",
  "component",
  "topic",
  "comment",
  "action plan",
  // Both spellings. The B register's write-ups say "Session Rating:" and the
  // C register's say plain "Rating:", and until that was noticed every one of
  // the C's seventy-nine deliveries came out unrated with the label swept
  // into the action plan above it as a fourth step — "Rating: N/A" printed on
  // the form under three real recommendations. Longest first, so that
  // "Session Rating" is not matched as a "Rating" with a word in front.
  "session rating",
  "rating",
] as const;

// One assessment cell holds a small form typed as free text, and the labels
// drift between assessors — "Action plan" and "Action Plan", "Comment:" and a
// bare "Comment" with no colon, which one CET's third delivery has. Both the
// case and the colon are optional here for that reason.
const FIELD_RE = new RegExp(
  `^\\s*(${FIELDS.join("|")})\\s*:?\\s*(.*)$`,
  "i",
);

/** A bare "1." or "2)" is the template's own numbering, not an answer. */
const BARE_NUMBER = /^\s*\d+[.)]?\s*$/;

/** The template's unfilled dropdown text, which is not a value. */
const PLACEHOLDERS = new Set(["block ?", "block", "play/practice", "n/a", "na", "-"]);

/**
 * A shaded assessment cell, read as a level.
 *
 * Both 2026 registers shade the write-ups with Excel's own Bad / Neutral /
 * Good styles — `FFC7CE` pink, `FFEB9C` amber, `C6EFCE` green — but not only
 * those: assessors have reached for the colour picker too, and the sheets also
 * carry `FFE699`, `FFC000` and `FFFF00`. Matching the three by hex would read
 * most of a register and silently drop the rest, so this goes by hue instead,
 * which is what somebody looking at the sheet is going by.
 *
 * Green before pink, because `C6EFCE` is pale enough that its blue is high
 * too. Then pink, which is the one family whose blue runs at or above its
 * green. What is left with more green than blue is the yellows and ambers.
 *
 * A cell whose three channels are within a few points of each other is grey,
 * not a judgement: the sheets shade their own headers and label columns, and
 * reading those as Competent would put a level on every coach.
 */
const GREY = 12;

function levelFromFill(fill: string | null): DeliveryLevel | null {
  if (!fill || !/^[0-9A-F]{6}$/.test(fill)) return null;
  const r = parseInt(fill.slice(0, 2), 16);
  const g = parseInt(fill.slice(2, 4), 16);
  const b = parseInt(fill.slice(4, 6), 16);
  if (Math.max(r, g, b) - Math.min(r, g, b) <= GREY) return null;
  if (g > r) return "HC";
  if (b >= g) return "NYC";
  return "C";
}

function parseDelivery(
  raw: string,
  deliveryNo: number,
  fill: string | null,
): RegisterDelivery | null {
  if (!raw.trim()) return null;

  const found = new Map<string, string[]>();
  let current: string | null = null;
  for (const line of raw.split(/\r?\n/)) {
    const m = FIELD_RE.exec(line);
    if (m) {
      // One key for both spellings, so the rest of the parser asks for the
      // field rather than for whichever label this assessor typed.
      current = m[1].toLowerCase() === "rating" ? "session rating" : m[1].toLowerCase();
      found.set(current, [m[2].trim()]);
    } else if (current) {
      found.get(current)?.push(line.trimEnd());
    }
  }

  const value = (key: string) => {
    const lines = (found.get(key) ?? []).filter((l) => !BARE_NUMBER.test(l));
    const joined = lines.join("\n").trim();
    if (blank(joined) || PLACEHOLDERS.has(joined.toLowerCase())) return null;
    return joined;
  };

  const plan = value("action plan");

  // A topic is one line. Some assessors type the write-up straight under it
  // without a "Comment:" label, and those lines were coming out as part of the
  // topic — a bold "Topic:" with three paragraphs of assessment after it, on
  // two deliveries across the two registers. The rest belongs to the comment,
  // ahead of anything labelled.
  const topicLines = (value("topic") ?? "").split(/\r?\n/);
  const topic = topicLines[0]?.trim() || null;
  const strays = topicLines.slice(1).join("\n").trim();
  const labelled = value("comment");
  const comment = [strays, labelled].filter(Boolean).join("\n") || null;

  const delivery: RegisterDelivery = {
    deliveryNo,
    assessor: value("assessor"),
    block: value("when"),
    component: value("component"),
    topic,
    comment,
    actions: plan
      ? plan
          .split(/\r?\n/)
          .map((line) => line.replace(/^\s*\d+[.)]\s*/, "").trim())
          .filter(Boolean)
      : [],
    rating: value("session rating") === null ? null : num(value("session rating") as string),
    level: levelFromFill(fill),
  };

  // An untouched template has nothing in it but the labels. Thirty of those
  // per course would bury the handful that are real.
  const filled =
    delivery.assessor ||
    delivery.block ||
    delivery.component ||
    delivery.topic ||
    delivery.comment ||
    delivery.actions.length ||
    delivery.rating !== null;
  return filled ? delivery : null;
}

type AssessmentColumn = {
  deliveries: RegisterDelivery[];
  currentRating: number | null;
  comment: string | null;
};

/**
 * The Assessment sheet, which runs one column per coach.
 *
 * Transposed, as the structure note at
 * `/mnt/project-files/register-assessment-tab/assessment-tab-structure.md`
 * sets out at length. One register indents the whole grid by a column, so the
 * column holding the row labels is found rather than assumed.
 */
function readAssessments(rows: SheetRows, fills: SheetFills) {
  const out = new Map<string, AssessmentColumn>();
  let labelCol = -1;
  let nameRow = -1;
  for (let col = 0; col < 4; col++) {
    const found = findRow(rows, col, "Coach Student");
    if (found >= 0) {
      labelCol = col;
      nameRow = found;
      break;
    }
  }
  if (nameRow < 0) return out;

  const deliveryRows = new Map<number, number>();
  rows.forEach((_, i) => {
    const m = /^practical delivery\s*(\d+)$/i.exec(cell(rows, i, labelCol));
    if (m) deliveryRows.set(Number(m[1]), i);
  });
  const ratingRow = findRow(rows, labelCol, "Current rating");
  const commentRow = findRow(rows, labelCol, "Comment");

  const numbers = [...deliveryRows.keys()].sort((a, b) => a - b);
  (rows[nameRow] ?? []).forEach((rawName, col) => {
    const name = rawName.trim();
    if (col <= labelCol || blank(name)) return;
    const deliveries: RegisterDelivery[] = [];
    for (const deliveryNo of numbers) {
      const row = deliveryRows.get(deliveryNo) as number;
      const parsed = parseDelivery(
        cell(rows, row, col),
        deliveryNo,
        fills[row]?.[col] ?? null,
      );
      if (parsed) deliveries.push(parsed);
    }
    out.set(name.toLowerCase(), {
      deliveries,
      currentRating: ratingRow >= 0 ? num(cell(rows, ratingRow, col)) : null,
      comment: commentRow >= 0 ? cell(rows, commentRow, col) || null : null,
    });
  });

  return out;
}

/* ------------------------------- Attendance ------------------------------- */

const RESULT_KEYS = [
  "attendance",
  "journal",
  "rating",
  "outcome",
  "readiness",
  "comments",
] as const;

type RosterRow = Omit<
  RegisterCoach,
  "deliveries" | "assessmentComment" | "verdict" | "reason" | "photo"
>;

function readRosterBlock(
  rows: SheetRows,
  headerRow: number,
  resultCols: Map<string, number>,
  track: "MAIN" | "CATCH_UP",
): RosterRow[] {
  const people: RosterRow[] = [];
  let started = false;

  for (let i = headerRow + 1; i < rows.length; i++) {
    const n = num(cell(rows, i, 1));
    const firstName = cell(rows, i, 2);
    const lastName = cell(rows, i, 3);

    // Between the "Coaches Details" banner and the first coach sit the column
    // headers and a row of dates. Neither carries a number in the # column, so
    // the block starts at the first row that does...
    if (n === null) {
      if (started) break; // ...and ends at the first row that stops.
      continue;
    }
    started = true;
    // A numbered row with no name is a spare line left on the form.
    if (blank(firstName) && blank(lastName)) continue;

    const result = (key: string) => {
      const col = resultCols.get(key);
      return col === undefined ? "" : cell(rows, i, col);
    };

    // A zero in the Rating column means nobody has rated them yet; the scale
    // itself starts at 1.
    const rating = num(result("rating"));

    // On the main roster column G is the coach's club. On the catch-up block
    // the same column carries the note about what they are catching up
    // ("Day 6 & Block 3"), which is not a club and must not print as one.
    const note = cell(rows, i, 6) || null;

    people.push({
      position: Math.round(n),
      firstName,
      lastName,
      name: `${firstName} ${lastName}`.trim(),
      track,
      club: track === "CATCH_UP" ? null : note,
      rating: rating && rating > 0 ? rating : null,
      outcome: result("outcome") || null,
      readiness: result("readiness") || null,
      comments: result("comments") || null,
      attendanceMet: yesno(result("attendance")),
      journal: yesno(result("journal")),
    });
  }
  return people;
}

function resultColumns(rows: SheetRows, headerRow: number) {
  const cols = headerColumns(rows[headerRow + 1]);
  const out = new Map<string, number>();
  for (const key of RESULT_KEYS) {
    const at = cols.get(key);
    if (at !== undefined) out.set(key, at);
  }
  return out;
}

function readAttendance(rows: SheetRows) {
  const mainHeader = findRow(rows, 1, "Coaches Details");
  if (mainHeader < 0) {
    throw new RegisterError(
      "No “Coaches Details” heading on the Attendance sheet. Is this a course register?",
    );
  }

  const roster = readRosterBlock(rows, mainHeader, resultColumns(rows, mainHeader), "MAIN");

  let catchUps: RosterRow[] = [];
  const catchTitle = findRow(rows, 1, "Catch Ups and Deferrals");
  if (catchTitle >= 0) {
    const catchHeader = findRow(rows, 1, "Coaches Details", catchTitle);
    if (catchHeader >= 0) {
      catchUps = readRosterBlock(
        rows,
        catchHeader,
        resultColumns(rows, catchHeader),
        "CATCH_UP",
      );
    }
  }

  const staff: { role: string; name: string }[] = [];
  const staffHeader = findRow(rows, 2, "Staff Attendance");
  if (staffHeader >= 0) {
    for (let i = staffHeader + 3; i < rows.length; i++) {
      const role = cell(rows, i, 2);
      const name = cell(rows, i, 3);
      if (blank(role) || role.toLowerCase() === "attendees") break;
      // A register with nobody named against CET1..CET5 has simply not had its
      // staff filled in, and five blank signature lines are worse than none.
      if (blank(name)) continue;
      staff.push({ role, name });
    }
  }

  return { roster, catchUps, staff };
}

/* ------------------------------ Course Info ------------------------------- */

const MONTH = new Intl.DateTimeFormat("en-AU", { month: "short", year: "numeric" });

function readCourseInfo(rows: SheetRows) {
  const labels: Record<string, "qualification" | "stream" | "location" | "address"> = {
    "afc / football australia": "qualification",
    "course name": "stream",
    location: "location",
    address: "address",
  };
  const info: Record<string, string | null> = {
    qualification: null,
    stream: null,
    location: null,
    address: null,
  };
  const days: Date[] = [];

  rows.forEach((_, i) => {
    const key = squash(cell(rows, i, 1));
    const field = labels[key];
    if (field) info[field] = cell(rows, i, 2) || null;
    if (/^day\s*\d+$/i.test(cell(rows, i, 1))) {
      const date = serialToDate(cell(rows, i, 3));
      if (date) days.push(date);
    }
  });

  days.sort((a, b) => a.getTime() - b.getTime());
  const first = days[0] ?? null;
  const last = days[days.length - 1] ?? null;
  // FQ's own template asks for "Course Date (MM/YY)", and a B Diploma runs over
  // three blocks across six months, so one month would be a false statement.
  const courseDates =
    first && last
      ? MONTH.format(first) === MONTH.format(last)
        ? MONTH.format(first)
        : `${MONTH.format(first)} – ${MONTH.format(last)}`
      : null;

  return { ...info, courseDates } as {
    qualification: string | null;
    stream: string | null;
    location: string | null;
    address: string | null;
    courseDates: string | null;
  };
}

/* ----------------------------- Classification ----------------------------- */

/**
 * A register comment that records an action plan.
 *
 * FQ note them in the Comments column by hand — "Action Plan - MD",
 * "Action Plan - DB - completed", "Post course Action Plan - PT" — and that
 * note is the coach education team's own record of who needs one, which beats
 * anything inferred from a number. "Completed" is read because a plan already
 * worked through is history, not an outstanding requirement.
 */
function actionPlanNote(comments: string | null) {
  if (!comments || !/action\s*plan/i.test(comments)) return null;
  return /complet/i.test(comments) ? "completed" : "outstanding";
}

/**
 * Which document a coach gets, and the sentence that says why.
 *
 * Read off the register's own columns in the order FQ fill them. The Outcome
 * column is a person's sign-off and wins; the rating decides where there is no
 * sign-off yet; and a coach at the pass mark whose attendance or journal is
 * outstanding is neither a pass nor a competency gap, so they get neither
 * document and are listed with what is missing. Nothing is decided here that a
 * person should decide — the register has already decided all of it, and this
 * only reads which.
 */
export function classify(
  coach: Pick<
    RegisterCoach,
    "rating" | "outcome" | "comments" | "attendanceMet" | "journal"
  >,
  passMark: number,
): { verdict: RegisterVerdict; reason: string } {
  const outcome = (coach.outcome ?? "").trim();
  const note = actionPlanNote(coach.comments);

  if (/^passed$/i.test(outcome)) {
    // Both columns are filled and they disagree. The open plan wins and the
    // reason says both, because a coach signed off as passed who still has an
    // action plan outstanding is the one case somebody has to look at.
    if (note === "outstanding") {
      return {
        verdict: "action_plan",
        reason: `Register outcome is “Passed”, but the comments record an action plan that is not marked completed: “${coach.comments}”.`,
      };
    }
    return { verdict: "passed", reason: "Register outcome is “Passed”." };
  }

  if (/^(not yet competent|nyc|failed|fail)$/i.test(outcome)) {
    return { verdict: "action_plan", reason: `Register outcome is “${outcome}”.` };
  }

  if (note === "outstanding") {
    return {
      verdict: "action_plan",
      reason: `The register's comments record an action plan: “${coach.comments}”.`,
    };
  }

  if (coach.rating === null) {
    return {
      verdict: "unrated",
      reason: outcome
        ? `No rating yet, and the outcome reads “${outcome}”.`
        : "No rating and no outcome in the register.",
    };
  }

  if (coach.rating < passMark) {
    return {
      verdict: "action_plan",
      reason: `Rated ${coach.rating}, below the ${passMark} pass mark.`,
    };
  }

  const missing = [
    coach.attendanceMet === false ? "attendance" : null,
    coach.journal === false ? "journal" : null,
  ].filter(Boolean);
  return {
    verdict: "incomplete",
    reason: missing.length
      ? `Rated ${coach.rating}, at or above the pass mark, but ${missing.join(" and ")} outstanding and not signed off.`
      : `Rated ${coach.rating}, at or above the pass mark, but the outcome is not signed off${
          outcome ? ` (“${outcome}”)` : ""
        }.`,
  };
}

/* -------------------------------- The read -------------------------------- */

const REQUIRED_SHEETS = ["Course Info", "Attendance"];

/**
 * One register, read.
 *
 * `passMark` is the 1-5 figure at or above which the register's own rating
 * counts as competent. It defaults to the platform's own pass mark rather than
 * a course's, because the file is read before anybody has said which cohort in
 * the database it belongs to — and on every 2026 register the Outcome column is
 * filled in anyway, which decides most coaches before the rating is reached.
 */
export function readRegister(
  buf: Buffer,
  sourceFile: string,
  passMark = DEFAULT_RATING_THRESHOLD,
): ParsedRegister {
  const book = readWorkbook(buf);

  const missing = REQUIRED_SHEETS.filter((name) => !book.has(name));
  if (missing.length) {
    throw new RegisterError(
      `That workbook has no ${missing.map((m) => `“${m}”`).join(" or ")} sheet. ` +
        `It has ${book.names.map((n) => `“${n}”`).join(", ")}. Is it a course register?`,
    );
  }

  const warnings: string[] = [];
  const info = readCourseInfo(book.sheet("Course Info"));
  const { roster, catchUps, staff } = readAttendance(book.sheet("Attendance"));

  if (!book.has("Assessment")) {
    warnings.push(
      "This register has no Assessment sheet, so no practical delivery write-ups or action steps could be read. Every document will carry the course facts and nothing else.",
    );
  }
  const assessments = book.has("Assessment")
    ? readAssessments(book.sheet("Assessment"), book.fills("Assessment"))
    : new Map<string, AssessmentColumn>();

  const coaches: RegisterCoach[] = [...roster, ...catchUps].map((person) => {
    const found = assessments.get(person.name.toLowerCase());
    // The Assessment sheet's "Current rating" and the Attendance sheet's
    // "Rating" are the same figure kept in two places. The register's own
    // Result block wins; the assessment sheet fills a gap.
    const rating = person.rating ?? found?.currentRating ?? null;
    const withRating = { ...person, rating };
    return {
      ...withRating,
      deliveries: found?.deliveries ?? [],
      assessmentComment: found?.comment ?? null,
      // Filled in afterwards by `attachCoachPhotos`, which is async and is the
      // one thing here that is.
      photo: null,
      ...classify(withRating, passMark),
    };
  });

  if (!coaches.length) {
    throw new RegisterError("No coaches on the Attendance sheet of that register.");
  }

  const unmatched = coaches.filter((c) => !assessments.has(c.name.toLowerCase()));
  if (assessments.size && unmatched.length) {
    // The Assessment sheet pulls its column headings off the Attendance sheet
    // by formula, so a mismatch means somebody typed over one of them.
    warnings.push(
      `${unmatched.length} coach${unmatched.length === 1 ? "" : "es"} on the roster had no column on the Assessment sheet, so their documents carry no write-ups: ${unmatched
        .map((c) => c.name)
        .join(", ")}.`,
    );
  }
  if (!staff.length) {
    warnings.push(
      "No course staff are named on the Attendance sheet, so the CET signature lines will be blank.",
    );
  }

  const qualification = info.qualification;
  const courseTitle = [
    qualification ? `AFC / Football Australia ${qualification}` : "Coach assessment",
    [info.stream, info.location].filter(Boolean).join(" @ "),
  ]
    .filter(Boolean)
    .join(" — ");

  return {
    qualification,
    stream: info.stream,
    location: info.location,
    courseTitle,
    courseDates: info.courseDates,
    staff,
    coaches,
    passMark,
    sourceFile,
    warnings,
  };
}

/* -------------------------------- Counting -------------------------------- */

export const VERDICT_LABEL: Record<RegisterVerdict, string> = {
  passed: "Passed",
  action_plan: "Needs an action plan",
  incomplete: "Not signed off",
  unrated: "Not rated",
};

/**
 * A coach the register has written up but not yet judged.
 *
 * The C Diploma registers mid-course are the case: every delivery is assessed
 * and action-planned, and the Rating and Outcome columns are still empty, so
 * nobody is passed and nobody is failed. The CETs still want the document —
 * it is what they make the judgement *on*. Here rather than beside either the
 * page that counts them or the route that builds them, because a button
 * offering a count the download does not deliver is the one bug worth ruling
 * out by construction.
 */
export function awaitingJudgement(coach: RegisterCoach) {
  return (
    (coach.verdict === "incomplete" || coach.verdict === "unrated") &&
    coach.deliveries.length > 0
  );
}

export function countVerdicts(coaches: RegisterCoach[]) {
  const counts: Record<RegisterVerdict, number> = {
    passed: 0,
    action_plan: 0,
    incomplete: 0,
    unrated: 0,
  };
  for (const coach of coaches) counts[coach.verdict] += 1;
  return counts;
}
