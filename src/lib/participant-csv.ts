/**
 * Football Australia's learning-system participant export, read as a roster.
 *
 * FQ's enrolments arrive from the FA learning system as a per-event CSV: one
 * row per registered participant, the columns named the way that system names
 * them, and a trailing column per prerequisite question whose *heading is the
 * question* ("ONE MORE STEP UNTIL YOU'RE ENROLLED… please specify any dietary
 * requirements"). So the column set is not fixed and never will be: a different
 * event asks different questions. Anything this file does not recognise is
 * carried through as an extra rather than treated as an error, which is what
 * makes one parser do for every export instead of one per event.
 *
 * Pure — no database, no `server-only`. The preview and the commit have to
 * agree about what the file says, and the only way to guarantee that is for
 * both to read it with this.
 */

/** A column this parser understands, whatever the export chose to call it. */
type Field =
  | "status"
  | "username"
  | "firstName"
  | "lastName"
  | "externalId"
  | "courses"
  | "email"
  | "phone"
  | "dob"
  | "department"
  | "suborganisation";

/**
 * Header spellings seen in the wild, plus the obvious neighbours.
 *
 * Compared against a header squashed to lowercase with its punctuation and
 * runs of whitespace removed, because these exports have shipped both "FFA
 * Number" and "External System Id" for the same number, and a stray
 * double space in a heading is not a different column.
 */
const HEADERS: Record<string, Field> = {
  status: "status",
  enrolmentstatus: "status",
  enrollmentstatus: "status",
  username: "username",
  firstname: "firstName",
  givenname: "firstName",
  lastname: "lastName",
  surname: "lastName",
  familyname: "lastName",
  externalsystemid: "externalId",
  externalid: "externalId",
  ffanumber: "externalId",
  fanumber: "externalId",
  courses: "courses",
  course: "courses",
  email: "email",
  emailaddress: "email",
  phonenumber: "phone",
  phone: "phone",
  mobile: "phone",
  dateofbirth: "dob",
  dob: "dob",
  department: "department",
  suborganisation: "suborganisation",
  suborganization: "suborganisation",
};

export function normalizeHeader(header: string) {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** One participant, as the file has them. */
export type ParticipantRow = {
  /** The line in the file, counting the header as 1, so a problem is findable. */
  line: number;
  status: string | null;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  /** The FA number. The one identifier in the export that outlives an address. */
  externalId: string | null;
  courses: string | null;
  email: string | null;
  phone: string | null;
  /** `yyyy-mm-dd`, or null when the export wrote something else. */
  dob: string | null;
  department: string | null;
  suborganisation: string | null;
  /** Columns this parser has no field for, heading to answer. */
  extras: Record<string, string>;
};

export type ParsedCsv = {
  rows: ParticipantRow[];
  /** Recognised headings, in the order the file had them. */
  columns: Field[];
  /** Headings nothing is done with — the prerequisite questions, mostly. */
  unknownColumns: string[];
  /** Why the file could not be read at all. */
  error?: string;
};

/**
 * RFC 4180 by hand, because the alternative is a dependency.
 *
 * Quoted fields, doubled quotes inside them, commas and newlines inside them,
 * and both line endings. The one liberty taken is a bare quote in an unquoted
 * field, which is kept as a character rather than rejected — somebody's name
 * is not worth failing a 200-row import over.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  // Excel and the FA export both open UTF-8 with a BOM; left in place it
  // becomes part of the first heading and "Status" stops being Status.
  const body = text.replace(/^﻿/, "");

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < body.length; i += 1) {
    const char = body[i];

    if (quoted) {
      if (char === '"') {
        if (body[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field === "") quoted = true;
    else if (char === ",") endField();
    else if (char === "\r") {
      // CRLF is one ending, not two: the \n is swallowed here.
      if (body[i + 1] === "\n") i += 1;
      endRow();
    } else if (char === "\n") endRow();
    else field += char;
  }

  // A file that does not end in a newline still has a last row; one that does
  // must not gain an empty one.
  if (field !== "" || row.length) endRow();

  return rows;
}

/** Trim, and treat whitespace-only as absent — these exports are full of it. */
function value(raw: string | undefined) {
  const trimmed = (raw ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * A date of birth, as `yyyy-mm-dd`.
 *
 * The export writes ISO. Australian day-first is accepted too, because that is
 * what comes back out of a spreadsheet somebody opened and saved, and a
 * day-first date read as month-first is a wrong age rather than an error.
 * Anything else is left null and reported, never guessed.
 */
export function parseDob(raw: string | null) {
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const [, y, m, d] = iso;
    return valid(Number(y), Number(m), Number(d));
  }

  const local = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (local) {
    const [, d, m, y] = local;
    return valid(Number(y), Number(m), Number(d));
  }

  return null;
}

function valid(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Age on a given day, which is the only kind of age a register wants. */
export function ageOn(dob: string, when: Date) {
  const [year, month, day] = dob.split("-").map(Number);
  let age = when.getUTCFullYear() - year;
  const beforeBirthday =
    when.getUTCMonth() + 1 < month ||
    (when.getUTCMonth() + 1 === month && when.getUTCDate() < day);
  if (beforeBirthday) age -= 1;
  return age >= 0 && age < 120 ? age : null;
}

/**
 * Read an export.
 *
 * Blank lines are dropped — a spreadsheet round trip leaves a trailing one —
 * and a row with no recognisable content at all goes with them. Everything
 * else comes back as a row, including rows that cannot be imported: deciding
 * that is the caller's job, and a row silently missing from a preview is worse
 * than a row listed as a problem.
 */
export function parseParticipantCsv(text: string): ParsedCsv {
  const grid = parseCsv(text);
  const header = grid.find((row) => row.some((cell) => cell.trim() !== ""));

  if (!header) return { rows: [], columns: [], unknownColumns: [], error: "The file is empty." };

  const fields: (Field | null)[] = [];
  const columns: Field[] = [];
  const unknownColumns: string[] = [];
  const seen = new Set<Field>();

  for (const raw of header) {
    const field = HEADERS[normalizeHeader(raw)] ?? null;
    // A duplicated heading maps once: the first wins, the rest become extras,
    // so two "Email" columns cannot have the second quietly overwrite the first.
    if (field && !seen.has(field)) {
      fields.push(field);
      columns.push(field);
      seen.add(field);
    } else {
      fields.push(null);
      if (raw.trim() !== "") unknownColumns.push(raw.trim());
    }
  }

  if (!seen.has("email") && !seen.has("externalId")) {
    return {
      rows: [],
      columns,
      unknownColumns,
      error:
        "This does not look like a participant export: it has neither an Email nor an External System Id column.",
    };
  }

  const headerIndex = grid.indexOf(header);
  const rows: ParticipantRow[] = [];

  for (let i = headerIndex + 1; i < grid.length; i += 1) {
    const cells = grid[i];
    if (!cells.some((cell) => cell.trim() !== "")) continue;

    const get = (field: Field) => {
      const at = fields.indexOf(field);
      return at === -1 ? null : value(cells[at]);
    };

    const extras: Record<string, string> = {};
    fields.forEach((field, at) => {
      if (field) return;
      const heading = header[at]?.trim();
      const answer = value(cells[at]);
      if (heading && answer) extras[heading] = answer;
    });

    rows.push({
      line: i + 1,
      status: get("status"),
      username: get("username"),
      firstName: get("firstName"),
      lastName: get("lastName"),
      externalId: get("externalId"),
      courses: get("courses"),
      email: get("email"),
      phone: get("phone"),
      dob: get("dob"),
      department: get("department"),
      suborganisation: get("suborganisation"),
      extras,
    });
  }

  return { rows, columns, unknownColumns };
}

/** "Brandon Shaw", or whichever half the export has. */
export function participantName(row: ParticipantRow) {
  return [row.firstName, row.lastName].filter(Boolean).join(" ") || null;
}
