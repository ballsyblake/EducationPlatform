/**
 * Reading FQ's hand-kept coach database workbook.
 *
 * `Coach_DB.xlsx` is how FQ hold the coaches they have qualified: the FA
 * learning system's qualification export, with the clubs, the regions and the
 * internal ratings FQ add to it and nothing upstream knows about. This reads
 * it into records the importer can plan against, and does no writing of any
 * kind.
 *
 * Which sheets, and why only these:
 *
 *   main          One row per coach. The spine: name, FALC username, address,
 *                 club, region, internal rating, B Diploma interest.
 *   FALC          One row per *qualification* — the same export unaggregated,
 *                 with a completion date `main` has collapsed away. Preferred
 *                 for qualifications wherever a coach appears on it.
 *   FQ Data       A second, older sheet of internal ratings, joined to `main`
 *                 by a VLOOKUP on email. The reason this importer exists: 336
 *                 of its 548 ratings never reached `main`.
 *   Affiliates    The affiliate list, name and region. Becomes `Affiliate`.
 *   B Dip EOI     The expression-of-interest form's responses.
 *
 * **The Squadi sheet is never read, and that is the point of saying so here.**
 * It is a Squadi member export — 7,476 people with home addresses, mobile
 * numbers, 6,021 Working With Children Check numbers, emergency contacts,
 * parent and guardian details, and 165 of them under eighteen. It is in the
 * workbook because 47 club names were filled in from it by VLOOKUP. Reading it
 * would pull a child-safeguarding dataset into this database to save 47 cells
 * of typing, so those 47 clubs arrive as whatever `main` cached and the sheet
 * is reported as skipped. The same goes for `qualification-report-data`, which
 * is 4,774 MiniRoos and Foundation of Football coaches: a different population
 * with a different purpose, 97% of whom are not coaches this register is about.
 *
 * Formula cells come back as their cached value — see `xlsx.ts`. That matters
 * more here than in a register: `main`'s Region column is 604 cells of
 * `VLOOKUP(…, Temp!H:Q, …)` against a sheet with five columns, so the formula
 * is dead and the cached value is an empty string. Nothing can be done about
 * that from the file, and it is reported rather than guessed at.
 */

import { readWorkbook, XlsxError, type SheetRows, type Workbook } from "@/lib/xlsx";

/* ------------------------------- The records ------------------------------ */

/** One qualification, as a source sheet gives it. */
export type ParsedQualification = {
  name: string;
  /** ISO day, or null where the sheet carries no completion date. */
  completedAt: string | null;
  expiresAt: string | null;
  status: string | null;
  cpd: string | null;
};

/** How a club name resolved against the affiliate list. */
export type ClubMatch = "exact" | "fuzzy" | "none" | "blank";

export type ParsedCoach = {
  /** The row number in `main`, for an error message somebody can act on. */
  line: number;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  email: string | null;
  /** Digits only. The "fa." prefix belongs to the username, not the number. */
  faNumber: string | null;

  /** The club as the sheet spells it. */
  clubName: string | null;
  /** Slug of the affiliate it resolved to, where it resolved to one. */
  affiliateSlug: string | null;
  clubMatch: ClubMatch;
  /** The sheet's own region, before the affiliate's is preferred over it. */
  region: string | null;

  internalRating: number | null;
  /** Which sheet the rating came from, for the record's `ratingSource`. */
  ratingFrom: "main" | "FQ Data" | null;
  /** Both numbers, where the two sheets disagree about the same coach. */
  ratingConflict: { main: number | null; fqData: number | null } | null;

  /** From a cell note on the name — the only place a status is recorded. */
  statusNote: string | null;

  bDiplomaInterest: boolean;
  bDiplomaInterestNote: string | null;

  qualifications: ParsedQualification[];
  /** Which sheet the qualifications were taken from. */
  qualificationsFrom: "FALC" | "main" | null;

  /** Things worth a person's eye that do not stop the row. */
  notes: string[];
};

export type ParsedAffiliate = { name: string; slug: string; region: string | null };

export type ParsedCoachDb = {
  sourceFile: string;
  coaches: ParsedCoach[];
  affiliates: ParsedAffiliate[];
  /** Sheets in the workbook this does not read, and why. */
  skippedSheets: { name: string; rows: number; reason: string }[];
  /** Problems with the file as a whole. */
  warnings: string[];
};

export class CoachDbError extends Error {}

/* ------------------------------ Cell reading ------------------------------ */

const BLANK = new Set(["", "-", "none", "n/a", "na", "no rating", "unrated", "tbc", "tbd", "?"]);

function clean(value: string | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function text(value: string | undefined) {
  const v = clean(value);
  return BLANK.has(v.toLowerCase()) ? null : v;
}

function num(value: string | undefined) {
  const v = clean(value).replace(",", ".");
  if (!v || BLANK.has(v.toLowerCase())) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Excel's day zero. 1899-12-30 rather than the 31st: the format still carries
 * the phantom 1900 leap day it inherited from Lotus, and starting two days
 * early absorbs it. Same constant as `register-file.ts`, deliberately not
 * shared — the two readers are of two different files and neither should be
 * able to break the other.
 */
const EPOCH = Date.UTC(1899, 11, 30);

/**
 * A date, from either of the two spellings one workbook uses.
 *
 * `main` and `FALC`'s expiry columns are real Excel dates, so they arrive as a
 * serial number. FALC's *started* column is a string the export wrote —
 * "2026-07-17T17:29:07.570Z" — because that column was pasted as text. Both
 * are in the same file, in columns beside each other.
 *
 * The time of day is dropped. Every expiry in the file is 23:59 or noon on its
 * day, which is FALC's way of saying "that day", and the day is the only part
 * anybody reads.
 */
function date(value: string | undefined): string | null {
  const v = clean(value);
  if (!v) return null;

  const serial = Number(v);
  if (Number.isFinite(serial)) {
    // A plausible Excel date: 1 is 1899-12-31, 100000 is well past 2100.
    if (serial < 1 || serial > 100_000) return null;
    return new Date(EPOCH + Math.floor(serial) * 86_400_000).toISOString().slice(0, 10);
  }

  const parsed = new Date(v);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

/** Column index for every non-empty heading in a row, keyed on squashed text. */
function headerColumns(row: string[] | undefined) {
  const out = new Map<string, number>();
  (row ?? []).forEach((value, i) => {
    const key = clean(value).toLowerCase();
    if (key && !out.has(key)) out.set(key, i);
  });
  return out;
}

/**
 * A reader for one sheet, by heading rather than by position.
 *
 * Every sheet here is somebody's export pasted into a tab, and the columns
 * move: `main` has First Name then Last Name, `Temp` has one Name column, the
 * qualification report gained a Full Name column between two exports of the
 * same report. Reading by heading means a column added upstream is ignored
 * instead of shifting everything after it.
 */
function sheetReader(rows: SheetRows, sheet: string, required: string[]) {
  const headers = headerColumns(rows[0]);
  const missing = required.filter((h) => !headers.has(h));
  if (missing.length) {
    throw new CoachDbError(
      `The "${sheet}" sheet has no ${missing.map((m) => `"${m}"`).join(", ")} column.`,
    );
  }
  return {
    headers,
    at(row: number, heading: string) {
      const col = headers.get(heading);
      return col === undefined ? "" : (rows[row]?.[col] ?? "");
    },
  };
}

/* ------------------------------- Club names ------------------------------- */

/**
 * The key a club name is matched on.
 *
 * Case, punctuation and the club-shaped tail all go: "Taringa Rovers" and
 * "Taringa Rovers Football Club" are one club typed two ways, and 71 of the
 * workbook's club cells matched nothing until the tail came off. What is left
 * is the distinguishing part of the name, which is the part people type.
 *
 * It is a slug and a match key at once, which is why it is stored on
 * `Affiliate`: the matching an import does has to be the matching the next
 * import does, and a key computed in two places eventually isn't one.
 */
export function clubSlug(name: string) {
  return clean(name)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(football|soccer|futsal)\s+club\b/g, "")
    .replace(/\b(fc|sc|sfc|afc|fq)\b/g, "")
    .replace(/\bclub\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Club cells that are not clubs.
 *
 * "No Club" is an answer and belongs on the record as one. The others are a
 * region or the federation typed into the club column — the workbook has
 * "South Coast Region" and "Football Queensland" as clubs — and matching those
 * to an affiliate would invent a club for a coach who has none.
 */
const NOT_A_CLUB = new Set(["no club", "none", "n a", "nil", "unknown", "football queensland"]);

function matchClub(
  raw: string | null,
  affiliates: Map<string, ParsedAffiliate>,
): { slug: string | null; match: ClubMatch } {
  if (!raw) return { slug: null, match: "blank" };
  const slug = clubSlug(raw);
  if (!slug || NOT_A_CLUB.has(slug) || /\bregion\b/.test(slug)) {
    return { slug: null, match: "none" };
  }
  if (affiliates.has(slug)) {
    // The affiliate list spells it in full; the coach's cell may not.
    return { slug, match: clean(raw).toLowerCase() === affiliates.get(slug)!.name.toLowerCase() ? "exact" : "fuzzy" };
  }
  return { slug: null, match: "none" };
}

/* ---------------------------- Qualification names ------------------------- */

/**
 * One qualification's name, spelled one way.
 *
 * The same export writes "GoalKeeping B Diploma" 24 times and "Goalkeeping B
 * Diploma" 9 times, which split 33 coaches across two qualifications that are
 * one qualification. Title case on each word settles it without a lookup
 * table, so a qualification FQ adds next year needs no code change.
 */
export function qualificationName(raw: string) {
  return clean(raw)
    .split(" ")
    .map((word) =>
      /^[A-Z0-9]+$/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join(" ");
}

/** "C Diploma;GoalKeeping B Diploma" -> two names. */
function splitQualifications(raw: string | null) {
  if (!raw) return [];
  return raw
    .split(/[;,]/)
    .map((part) => qualificationName(part))
    .filter(Boolean);
}

/* --------------------------------- Keys ----------------------------------- */

export function normaliseEmail(raw: string | null | undefined) {
  const v = clean(raw ?? "").toLowerCase();
  return v.includes("@") ? v : null;
}

/**
 * The FA number, from a FALC username or from a number typed by hand.
 *
 * `fa.45735362` on the export, `fa. 55038814` on the sheet somebody retyped,
 * and a bare `12187057` on the expression-of-interest form, where the question
 * asks for the number rather than the username. All three are the same number.
 */
export function faNumber(raw: string | null | undefined) {
  const digits = clean(raw ?? "").replace(/^fa\.?\s*/i, "").replace(/\D/g, "");
  return digits.length >= 4 ? digits : null;
}

/* -------------------------------- Parsing --------------------------------- */

const MAIN_SHEET = "main";
const FALC_SHEET = "FALC";
const RATINGS_SHEET = "FQ Data";
const AFFILIATES_SHEET = "Affiliates";
const EOI_SHEET = "B Dip EOI";

/**
 * Sheets this reads nothing from, and the reason, shown on the import page.
 *
 * Listed rather than ignored for the reason `participants.ts` lists its dropped
 * columns: somebody can see these tabs in the file and will reasonably expect
 * their contents in the app afterwards. Saying so on the page is the honest
 * thing; the alternative is them finding out later.
 */
const SKIP_REASON: { match: RegExp; reason: string }[] = [
  {
    match: /^squadi$/i,
    reason:
      "A Squadi member export — home addresses, mobile numbers, Working With Children Check numbers, emergency contacts, guardian details, and children. Never imported, and it should not be in this workbook at all.",
  },
  {
    match: /^qualification-report/i,
    reason:
      "A grassroots qualification report — MiniRoos and Foundation of Football. A different population from the coach register; 97% of it is nobody on the main sheet.",
  },
  {
    match: /^temp$/i,
    reason:
      "A scratch sheet. Two of the columns the main sheet's formulas look up live past its last column, so those lookups return nothing.",
  },
];

export function parseCoachDb(buf: Buffer, sourceFile: string): ParsedCoachDb {
  let wb: Workbook;
  try {
    wb = readWorkbook(buf);
  } catch (error) {
    throw new CoachDbError(
      error instanceof XlsxError ? error.message : "That file could not be read as a workbook.",
    );
  }

  if (!wb.has(MAIN_SHEET)) {
    throw new CoachDbError(
      `That workbook has no "${MAIN_SHEET}" sheet. Its tabs are: ${wb.names.join(", ")}.`,
    );
  }

  const warnings: string[] = [];
  const affiliates = readAffiliates(wb, warnings);
  const bySlug = new Map(affiliates.map((a) => [a.slug, a]));
  const falc = readFalc(wb, warnings);
  const ratings = readRatings(wb, warnings);
  const eoi = readEoi(wb, warnings);

  const rows = wb.sheet(MAIN_SHEET);
  const notes = wb.comments(MAIN_SHEET);
  const main = sheetReader(rows, MAIN_SHEET, ["first name", "last name", "username"]);
  const coaches: ParsedCoach[] = [];
  const seen = new Map<string, number>();

  for (let i = 1; i < rows.length; i++) {
    const first = text(main.at(i, "first name"));
    const last = text(main.at(i, "last name"));
    const username = clean(main.at(i, "username"));
    if (!first && !last && !username) continue;

    const rowNotes: string[] = [];
    const email = normaliseEmail(main.at(i, "email"));
    const fa = faNumber(username) ?? faNumber(main.at(i, "fa number"));
    const name = [first, last].filter(Boolean).join(" ") || null;

    if (!email) rowNotes.push("No address on the sheet.");
    if (!fa) rowNotes.push("No FA number — the username does not hold one.");

    // The same coach twice in one file is the file's problem, not the
    // database's: the second row is reported and dropped rather than racing
    // the first to write the same record.
    const key = email ?? (fa ? `fa:${fa}` : `row:${i}`);
    const already = seen.get(key);
    if (already !== undefined) {
      coaches[already].notes.push(`Also on row ${i + 1} of the sheet; that row was skipped.`);
      continue;
    }
    seen.set(key, coaches.length);

    const rawClub = text(main.at(i, "current club"));
    const { slug, match } = matchClub(rawClub, bySlug);
    if (match === "none" && rawClub) {
      rowNotes.push(`"${rawClub}" is not on the affiliate list; kept as typed.`);
    }

    const sheetRegion = text(main.at(i, "region"));
    const affiliateRegion = slug ? (bySlug.get(slug)?.region ?? null) : null;
    if (sheetRegion && affiliateRegion && sheetRegion !== affiliateRegion) {
      rowNotes.push(
        `Region on the sheet is "${sheetRegion}"; the affiliate list says "${affiliateRegion}". The affiliate list wins.`,
      );
    }

    // The two rating sheets, reconciled here rather than by a VLOOKUP that
    // can only ever see one of them. A number beats the absence of one in
    // either direction — "No rating" on one sheet is not a judgement that
    // overrides a 3 on the other, which is exactly how 336 ratings went
    // missing. Two different numbers is a disagreement, not an average: the
    // newer sheet is taken and the pair is reported.
    const mainRating = num(main.at(i, "internal rating"));
    const fqRating = (email ? ratings.get(email) : undefined) ?? (fa ? ratings.get(`fa:${fa}`) : undefined);
    const fqValue = fqRating?.rating ?? null;
    let rating = mainRating ?? fqValue;
    let ratingFrom: ParsedCoach["ratingFrom"] = mainRating !== null ? "main" : fqValue !== null ? "FQ Data" : null;
    let ratingConflict: ParsedCoach["ratingConflict"] = null;
    if (mainRating !== null && fqValue !== null && mainRating !== fqValue) {
      rating = mainRating;
      ratingFrom = "main";
      ratingConflict = { main: mainRating, fqData: fqValue };
      rowNotes.push(
        `Rated ${mainRating} on the main sheet and ${fqValue} on FQ Data. The main sheet's is used.`,
      );
    }

    // Qualifications: FALC's per-qualification rows wherever this coach is on
    // it, because they carry a completion date the main sheet has collapsed
    // away. Falling back to the main sheet's packed cell is not a worse answer
    // to the same question — 42 coaches are on the main sheet and not on FALC,
    // including every "International" diploma, which FALC does not carry.
    const falcRows = (email ? falc.get(email) : undefined) ?? (fa ? falc.get(`fa:${fa}`) : undefined);
    let qualifications: ParsedQualification[];
    let qualificationsFrom: ParsedCoach["qualificationsFrom"];
    if (falcRows?.length) {
      qualifications = falcRows;
      qualificationsFrom = "FALC";
      const packed = splitQualifications(text(main.at(i, "qualification name")));
      const held = new Set(qualifications.map((q) => q.name));
      for (const extra of packed) {
        if (held.has(extra)) continue;
        // On the main sheet and not on FALC. Kept with the expiry the main
        // sheet carries, since that is all it has.
        qualifications.push({
          name: extra,
          completedAt: null,
          expiresAt: date(main.at(i, "expiry")),
          status: null,
          cpd: null,
        });
        rowNotes.push(`"${extra}" is on the main sheet but not in the FALC export.`);
      }
    } else {
      const expiry = date(main.at(i, "expiry"));
      qualifications = splitQualifications(text(main.at(i, "qualification name"))).map((qn) => ({
        name: qn,
        completedAt: null,
        expiresAt: expiry,
        status: null,
        cpd: null,
      }));
      qualificationsFrom = qualifications.length ? "main" : null;
      if (qualifications.length > 1) {
        rowNotes.push(
          "Not in the FALC export, so these share the one expiry the main sheet carries.",
        );
      }
    }

    const interestFlag = /^(y|yes|true|1)$/i.test(clean(main.at(i, "expressed interest for b diploma")));
    const form = (email ? eoi.get(email) : undefined) ?? (fa ? eoi.get(`fa:${fa}`) : undefined);
    if (form && !interestFlag) {
      rowNotes.push("On the expression-of-interest form but not flagged on the main sheet.");
    }

    // The status column the sheet does not have. A note on the name cell is
    // the only record of it, and it is kept verbatim: "doesn't coach anymore"
    // is a fact, and deciding from those words that somebody has stopped is a
    // person's call, made on the page.
    const nameCol = main.headers.get("first name") ?? 0;
    const statusNote =
      notes.get(`${columnLetters(nameCol)}${i + 1}`) ??
      notes.get(`${columnLetters(main.headers.get("last name") ?? 1)}${i + 1}`) ??
      null;

    coaches.push({
      line: i + 1,
      firstName: first,
      lastName: last,
      name,
      email,
      faNumber: fa,
      clubName: rawClub,
      affiliateSlug: slug,
      clubMatch: rawClub ? match : "blank",
      region: affiliateRegion ?? sheetRegion,
      internalRating: rating,
      ratingFrom,
      ratingConflict,
      statusNote,
      bDiplomaInterest: interestFlag || !!form,
      bDiplomaInterestNote: form?.note ?? null,
      qualifications,
      qualificationsFrom,
      notes: rowNotes,
    });
  }

  if (!coaches.length) {
    throw new CoachDbError(`The "${MAIN_SHEET}" sheet has a heading and no rows under it.`);
  }

  // Ratings nobody on the main sheet claims. The sheet they are on is older
  // than the main sheet, so these are coaches dropped from it rather than
  // ratings for nobody, and losing them silently is the fault being fixed.
  const claimed = new Set<string>();
  for (const coach of coaches) {
    if (coach.email) claimed.add(coach.email);
    if (coach.faNumber) claimed.add(`fa:${coach.faNumber}`);
  }
  // Counted by the row they came from, not by the keys they are filed under:
  // every rating is indexed twice, once by address and once by FA number, and
  // counting keys would report twice as many orphans as there are people.
  const orphans = new Set(
    [...ratings.entries()].filter(([key]) => !claimed.has(key)).map(([, v]) => v.line),
  );
  if (orphans.size) {
    warnings.push(
      `${orphans.size} rating${orphans.size === 1 ? "" : "s"} on "${RATINGS_SHEET}" ${
        orphans.size === 1 ? "is for somebody" : "are for people"
      } not on the "${MAIN_SHEET}" sheet at all. They are not imported — a rating with no coach has nowhere to go, and inventing an account from a rating row is not this import's decision.`,
    );
  }

  const skippedSheets = wb.names
    .map((name) => {
      const hit = SKIP_REASON.find((s) => s.match.test(name));
      if (!hit) return null;
      return { name, rows: Math.max(0, wb.sheet(name).length - 1), reason: hit.reason };
    })
    .filter((s): s is NonNullable<typeof s> => !!s);

  return { sourceFile, coaches, affiliates, skippedSheets, warnings };
}

/** 0 -> "A", 27 -> "AB". The inverse of `xlsx.ts`'s column index. */
function columnLetters(index: number) {
  let out = "";
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/* ----------------------------- The other sheets --------------------------- */

function readAffiliates(wb: Workbook, warnings: string[]): ParsedAffiliate[] {
  if (!wb.has(AFFILIATES_SHEET)) {
    warnings.push(
      `No "${AFFILIATES_SHEET}" sheet, so no club name can be matched to an affiliate. Every club is kept as typed.`,
    );
    return [];
  }
  const rows = wb.sheet(AFFILIATES_SHEET);
  const sheet = sheetReader(rows, AFFILIATES_SHEET, ["name"]);
  const out = new Map<string, ParsedAffiliate>();
  for (let i = 1; i < rows.length; i++) {
    const name = text(sheet.at(i, "name"));
    if (!name) continue;
    const slug = clubSlug(name);
    if (!slug) continue;
    const region = text(sheet.at(i, "region"));
    const had = out.get(slug);
    if (had) {
      // Either the same club listed twice, or two whose names differ only in
      // the part the key strips off — "Ipswich FC" and "Ipswich Futsal Club".
      // Reported and the first kept, because merging them silently would mean
      // every Ipswich Futsal coach quietly filed under the outdoor club.
      warnings.push(
        had.name.toLowerCase() === name.toLowerCase()
          ? `"${name}" is on the affiliate list twice.`
          : `"${name}" and "${had.name}" match the same club key; "${had.name}" is used.`,
      );
      continue;
    }
    out.set(slug, { name, slug, region });
  }
  return [...out.values()];
}

/**
 * FALC's qualification rows, keyed on both address and FA number.
 *
 * Keyed on both because the match in `main` is address first, FA number
 * second, and this has to be answerable either way. The same object goes under
 * both keys, so a coach whose address changed upstream still finds their
 * qualifications.
 */
function readFalc(wb: Workbook, warnings: string[]) {
  const out = new Map<string, ParsedQualification[]>();
  if (!wb.has(FALC_SHEET)) {
    warnings.push(
      `No "${FALC_SHEET}" sheet. Qualifications come from the main sheet's packed cell instead, which carries an expiry and no completion date.`,
    );
    return out;
  }
  const rows = wb.sheet(FALC_SHEET);
  const sheet = sheetReader(rows, FALC_SHEET, ["username", "qualification name"]);

  for (let i = 1; i < rows.length; i++) {
    const name = qualificationName(sheet.at(i, "qualification name"));
    if (!name) continue;
    const email = normaliseEmail(sheet.at(i, "email"));
    const fa = faNumber(sheet.at(i, "username"));
    if (!email && !fa) continue;

    const qual: ParsedQualification = {
      name,
      completedAt: date(sheet.at(i, "qualification completion date")),
      expiresAt: date(sheet.at(i, "qualification expiry date")),
      status: text(sheet.at(i, "qualification status")),
      cpd: text(sheet.at(i, "qualification progress")),
    };

    const keys = [email, fa ? `fa:${fa}` : null].filter((k): k is string => !!k);
    // One list, under every key the coach can be found by, so a coach with
    // four qualifications has four entries and not four lists of one.
    const list = keys.map((k) => out.get(k)).find((l) => l) ?? [];
    const existing = list.find((q) => q.name === name);
    if (existing) {
      // The same qualification twice: keep the later completion. FALC reissues
      // a row when a licence is renewed and both rows stay in the export.
      if ((qual.completedAt ?? "") > (existing.completedAt ?? "")) {
        Object.assign(existing, qual);
      }
    } else {
      list.push(qual);
    }
    for (const k of keys) out.set(k, list);
  }
  return out;
}

/**
 * The internal ratings sheet, keyed on address and FA number.
 *
 * This sheet is the whole reason the importer exists, so a rating is read
 * whether or not the row carries anything else. Its own club and date of birth
 * columns are deliberately not read: the main sheet's club is the newer one,
 * and a date of birth is not something this register needs to hold.
 */
function readRatings(wb: Workbook, warnings: string[]) {
  const out = new Map<string, { rating: number; line: number }>();
  if (!wb.has(RATINGS_SHEET)) return out;
  const rows = wb.sheet(RATINGS_SHEET);
  const sheet = sheetReader(rows, RATINGS_SHEET, ["username"]);

  for (let i = 1; i < rows.length; i++) {
    const rating = num(sheet.at(i, "rating"));
    if (rating === null) continue;
    if (rating < 1 || rating > 5) {
      warnings.push(`Row ${i + 1} of "${RATINGS_SHEET}" is rated ${rating}, outside the 1-5 scale.`);
      continue;
    }
    const email = normaliseEmail(sheet.at(i, "email"));
    const fa = faNumber(sheet.at(i, "username"));
    for (const key of [email, fa ? `fa:${fa}` : null]) {
      if (!key) continue;
      const had = out.get(key);
      if (had && had.rating !== rating) {
        warnings.push(
          `"${RATINGS_SHEET}" rates the same coach ${had.rating} on row ${had.line} and ${rating} on row ${i + 1}; the later row is used.`,
        );
      }
      out.set(key, { rating, line: i + 1 });
    }
  }
  return out;
}

/**
 * The expression-of-interest form, keyed on address and FA number.
 *
 * The form's "years on C Diploma" answer is kept as the words it was given in
 * and read as nothing. It came back as "2", "2 years", "One", "18 months" and
 * "10 (Goalkeeping B completed 2024)", and a parser that turned those into
 * numbers would be guessing at four of them. The figure comes off the C
 * Diploma's completion date instead, which FALC already holds, so the free
 * text is a note and not data.
 */
function readEoi(wb: Workbook, warnings: string[]) {
  const out = new Map<string, { note: string | null }>();
  if (!wb.has(EOI_SHEET)) return out;
  const rows = wb.sheet(EOI_SHEET);
  let sheet;
  try {
    sheet = sheetReader(rows, EOI_SHEET, ["email address"]);
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : `The "${EOI_SHEET}" sheet is unreadable.`);
    return out;
  }

  for (let i = 1; i < rows.length; i++) {
    const email = normaliseEmail(sheet.at(i, "email address"));
    const fa = faNumber(sheet.at(i, "football australia (fa) number"));
    if (!email && !fa) continue;
    const years = text(sheet.at(i, "number of years on c diploma"));
    const note = years ? `Years on the C Diploma, as answered: "${years}".` : null;
    for (const key of [email, fa ? `fa:${fa}` : null]) {
      if (key) out.set(key, { note });
    }
  }
  return out;
}
