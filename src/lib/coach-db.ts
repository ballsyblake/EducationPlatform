import "server-only";

import { normalizeEmail } from "@/lib/auth";
import type { ClubMatch, ParsedCoach, ParsedCoachDb } from "@/lib/coach-db-file";
import { prisma } from "@/lib/db";

/**
 * Importing FQ's coach database workbook into the coach register.
 *
 * Shaped like `participants.ts` on purpose, and for the same reasons: a plan is
 * computed from reads alone, shown to whoever is importing, and applied
 * unchanged, with preview and commit running the same function so a preview is
 * never a preview of something else. The difference is what is being loaded —
 * that import enrols a cohort, this one loads the standing register behind
 * every cohort — so the matching is the same and the writing is not.
 *
 * What it will not do:
 *
 *   - Blank anything. A field the file is empty on is left as it stands. The
 *     file is a hand-kept spreadsheet with 625 missing regions and 621 missing
 *     clubs, and an import that pushed those holes into the database would
 *     delete work every time somebody re-ran it. Filling in is safe; emptying
 *     out is a person's decision, taken on the record.
 *   - Replace a rating with the absence of one. Specifically and separately,
 *     because this is the fault being fixed: the spreadsheet's own "join" let
 *     a "No rating" cell sit on top of a real judgement, and 336 ratings were
 *     behind one.
 *   - Create an account for a rating, or for anything else, without an
 *     address. An account is a thing somebody can be sent a sign-in link at.
 *   - Touch a role, an address, or whether an account is active. An export
 *     cannot promote, rename or deactivate anybody — the same stance the
 *     participant importer takes.
 *   - Decide that somebody has stopped coaching. A cell note saying "doesn't
 *     coach anymore" is recorded as a note, and the status it implies is set
 *     by a person on the register page.
 *   - Unaffiliate a club. A club absent from a later affiliate list has not
 *     necessarily folded.
 */

/** What the import would do with one coach. */
export type CoachPlanKind =
  /** No account with this address or FA number: one would be created. */
  | "create"
  /** An account exists with no register record: one would be added. */
  | "attach"
  /** A register record exists and some of its fields would change. */
  | "update"
  /** Matched, and nothing in the file differs from the record. */
  | "unchanged"
  /** Cannot be imported. `problems` says why, and nothing is written. */
  | "skip";

/** One field this row would change, in words an admin can check. */
export type FieldChange = { field: string; from: string; to: string };

export type CoachPlan = {
  line: number;
  name: string | null;
  email: string | null;
  faNumber: string | null;
  kind: CoachPlanKind;
  matchedBy: "email" | "faNumber" | null;
  userId: string | null;
  /** The address on the matched account, when the file disagrees with it. */
  accountEmail: string | null;
  club: string | null;
  clubMatch: ClubMatch;
  rating: number | null;
  qualifications: number;
  changes: FieldChange[];
  problems: string[];
  notes: string[];
};

export type ImportPlan = {
  sourceFile: string;
  rows: CoachPlan[];
  affiliates: { total: number; create: number; update: number; unchanged: number };
  counts: Record<CoachPlanKind, number>;
  /** How many of the rows that would be written carry a rating. */
  ratings: { total: number; new: number; changed: number };
  /** On the register, absent from the file. Reported, never removed. */
  absent: { name: string | null; email: string; rating: number | null }[];
  skippedSheets: ParsedCoachDb["skippedSheets"];
  warnings: string[];
  error?: string;
};

export type ImportResult = {
  created: number;
  attached: number;
  updated: number;
  unchanged: number;
  skipped: number;
  affiliates: number;
  qualifications: number;
};

/* --------------------------------- Planning ------------------------------- */

function show(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

/**
 * Work out what the file would do, reading only.
 *
 * Matching order is address first, FA number second — the same order and the
 * same reasoning as the participant importer. The address is what an account
 * *is* here; the FA number is what survives somebody changing it. Where the
 * two disagree about which person a row is, the row is skipped rather than
 * resolved by a rule, because two accounts and one coach is a merge and a
 * merge is a decision.
 */
export async function planCoachDbImport(parsed: ParsedCoachDb): Promise<ImportPlan> {
  const base: ImportPlan = {
    sourceFile: parsed.sourceFile,
    rows: [],
    affiliates: { total: parsed.affiliates.length, create: 0, update: 0, unchanged: 0 },
    counts: { create: 0, attach: 0, update: 0, unchanged: 0, skip: 0 },
    ratings: { total: 0, new: 0, changed: 0 },
    absent: [],
    skippedSheets: parsed.skippedSheets,
    warnings: parsed.warnings,
  };

  // Four queries for the whole file rather than four per row: 1,676 coaches
  // against a hosted database is where round trips stop being free.
  const emails = [...new Set(parsed.coaches.map((c) => c.email).filter((e): e is string => !!e))];
  const numbers = [...new Set(parsed.coaches.map((c) => c.faNumber).filter((f): f is string => !!f))];

  const [byEmail, byNumber, existingAffiliates] = await Promise.all([
    prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true, email: true, faNumber: true, name: true, coachRecord: true },
    }),
    numbers.length
      ? prisma.user.findMany({
          where: { faNumber: { in: numbers } },
          select: { id: true, email: true, faNumber: true, name: true, coachRecord: true },
        })
      : Promise.resolve([]),
    prisma.affiliate.findMany({ select: { slug: true, name: true, region: true } }),
  ]);

  type Account = (typeof byEmail)[number];
  const emailMap = new Map<string, Account>(byEmail.map((u) => [u.email, u]));
  const numberMap = new Map<string, Account>(
    byNumber.filter((u) => u.faNumber).map((u) => [u.faNumber!, u]),
  );

  const affiliateMap = new Map(existingAffiliates.map((a) => [a.slug, a]));
  for (const incoming of parsed.affiliates) {
    const had = affiliateMap.get(incoming.slug);
    if (!had) base.affiliates.create++;
    else if (had.name !== incoming.name || (had.region ?? null) !== incoming.region) {
      base.affiliates.update++;
    } else base.affiliates.unchanged++;
  }
  // The regions a club would carry after the import, so a plan can show the
  // region a coach ends up with rather than the one their record holds now.
  const regionAfter = new Map<string, string | null>(
    parsed.affiliates.map((a) => [a.slug, a.region]),
  );
  for (const a of existingAffiliates) {
    if (!regionAfter.has(a.slug)) regionAfter.set(a.slug, a.region);
  }

  const touched = new Set<string>();

  for (const coach of parsed.coaches) {
    const row = planRow(coach, emailMap, numberMap, regionAfter);
    if (row.userId) touched.add(row.userId);
    base.rows.push(row);
    base.counts[row.kind]++;
    if (row.kind !== "skip" && row.rating !== null) {
      base.ratings.total++;
      const change = row.changes.find((c) => c.field === "Internal rating");
      if (change) {
        if (change.from === "—") base.ratings.new++;
        else base.ratings.changed++;
      }
    }
  }

  // Coaches on the register and not in this file. Reported for the same reason
  // the participant importer reports them: a coach dropped from a hand-kept
  // sheet is somebody deleting a row, and this import must never be the thing
  // that takes a rating and a history off a person.
  const onRegister = await prisma.coachRecord.findMany({
    select: { internalRating: true, user: { select: { id: true, name: true, email: true } } },
  });
  base.absent = onRegister
    .filter((r) => !touched.has(r.user.id))
    .map((r) => ({ name: r.user.name, email: r.user.email, rating: r.internalRating }))
    .sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email));

  return base;
}

type AccountShape = {
  id: string;
  email: string;
  faNumber: string | null;
  name: string | null;
  coachRecord: {
    affiliateId: string | null;
    clubName: string | null;
    region: string | null;
    internalRating: number | null;
    bDiplomaInterest: string;
    statusNote: string | null;
  } | null;
};

function planRow(
  coach: ParsedCoach,
  emailMap: Map<string, AccountShape>,
  numberMap: Map<string, AccountShape>,
  regionAfter: Map<string, string | null>,
): CoachPlan {
  const problems: string[] = [];
  const region = coach.affiliateSlug
    ? (regionAfter.get(coach.affiliateSlug) ?? coach.region)
    : coach.region;

  const row: CoachPlan = {
    line: coach.line,
    name: coach.name,
    email: coach.email,
    faNumber: coach.faNumber,
    kind: "skip",
    matchedBy: null,
    userId: null,
    accountEmail: null,
    club: coach.clubName,
    clubMatch: coach.clubMatch,
    rating: coach.internalRating,
    qualifications: coach.qualifications.length,
    changes: [],
    problems,
    notes: coach.notes,
  };

  if (!coach.name) problems.push("No name on the row.");

  const matchedByEmail = coach.email ? emailMap.get(coach.email) : undefined;
  const matchedByNumber = coach.faNumber ? numberMap.get(coach.faNumber) : undefined;

  // Two accounts, one row. Left alone deliberately: whichever is picked, the
  // other coach's record is the one that silently stops being updated, and
  // nobody would know which.
  if (matchedByEmail && matchedByNumber && matchedByEmail.id !== matchedByNumber.id) {
    problems.push(
      `This address is ${matchedByEmail.email} and FA number ${coach.faNumber} is ${matchedByNumber.email}. Two accounts, one row — merge them first.`,
    );
    return row;
  }

  const account = matchedByEmail ?? matchedByNumber;
  if (account) {
    row.matchedBy = matchedByEmail ? "email" : "faNumber";
    row.userId = account.id;
    if (coach.email && account.email !== coach.email) row.accountEmail = account.email;
  }

  if (!account && !coach.email) {
    problems.push("No account to match, and no address to make one with.");
    return row;
  }
  if (problems.length) return row;

  // A field the file is empty on is not a change. `fill` is the whole
  // import-safety rule in one function: a value arrives or it does not, and a
  // value that does not arrive leaves what is there alone.
  const changes: FieldChange[] = [];
  const fill = (field: string, from: unknown, to: unknown) => {
    if (to === null || to === undefined || to === "") return;
    if (show(from) === show(to)) return;
    changes.push({ field, from: show(from), to: show(to) });
  };

  const record = account?.coachRecord ?? null;

  if (account && !account.faNumber && coach.faNumber) {
    changes.push({ field: "FA number", from: "—", to: coach.faNumber });
  }

  fill("Club", record?.clubName, coach.clubName);
  fill("Region", record?.region, region);
  fill("Internal rating", record?.internalRating, coach.internalRating);
  if (coach.bDiplomaInterest && record?.bDiplomaInterest !== "YES") {
    changes.push({
      field: "B Diploma interest",
      from: record ? record.bDiplomaInterest.toLowerCase().replace("_", " ") : "—",
      to: "yes",
    });
  }
  fill("Status note", record?.statusNote, coach.statusNote);

  // Qualifications are a cache of FALC, replaced outright rather than
  // reconciled field by field, so the plan counts them instead of diffing
  // them. Shown as a change only when the record has none, which is the case
  // that tells somebody the import is doing something.
  if (coach.qualifications.length && !record) {
    changes.push({
      field: "Qualifications",
      from: "—",
      to: coach.qualifications.map((q) => q.name).join(", "),
    });
  }

  row.changes = changes;
  row.kind = !account ? "create" : !record ? "attach" : changes.length ? "update" : "unchanged";
  return row;
}

/* --------------------------------- Applying ------------------------------- */

/**
 * Write the plan.
 *
 * The plan is recomputed here rather than taken from the client, so what is
 * written is always a plan made against the database as it is now.
 *
 * Written in chunks, not row by row, because of where this runs. Row by row is
 * four round trips per coach, and 1,676 coaches against a hosted database is
 * close to seven thousand of them — several minutes, inside a server action,
 * on the one import somebody does by hand and watches. The same work as
 * `createMany` over chunks of two hundred is a few dozen queries. Updates stay
 * individual, because only the rows that actually differ get one and on a
 * re-run that is almost none.
 */
export async function applyCoachDbImport(parsed: ParsedCoachDb): Promise<ImportResult> {
  const plan = await planCoachDbImport(parsed);
  if (plan.error) throw new Error(plan.error);

  const result: ImportResult = {
    created: 0,
    attached: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    affiliates: 0,
    qualifications: 0,
  };

  // The affiliate list first: a coach's club resolves to a row here, so the
  // rows have to exist before the coaches referencing them are written.
  const existing = await prisma.affiliate.findMany({
    select: { id: true, slug: true, name: true, region: true },
  });
  const affiliateIds = new Map(existing.map((a) => [a.slug, a.id]));
  const fresh = parsed.affiliates.filter((a) => !affiliateIds.has(a.slug));
  for (const chunk of chunks(fresh)) {
    await prisma.affiliate.createMany({
      data: chunk.map((a) => ({ slug: a.slug, name: a.name, region: a.region })),
    });
  }
  // Never `active: true` on an update: a club taken off the list is
  // unaffiliated by a person, and a later import must not undo that.
  const bySlug = new Map(existing.map((a) => [a.slug, a]));
  for (const a of parsed.affiliates) {
    const had = bySlug.get(a.slug);
    if (!had || (had.name === a.name && (had.region ?? null) === a.region)) continue;
    await prisma.affiliate.update({
      where: { slug: a.slug },
      data: { name: a.name, region: a.region },
    });
  }
  result.affiliates = parsed.affiliates.length;
  if (fresh.length) {
    const added = await prisma.affiliate.findMany({
      where: { slug: { in: fresh.map((a) => a.slug) } },
      select: { id: true, slug: true },
    });
    for (const a of added) affiliateIds.set(a.slug, a.id);
  }

  const byLine = new Map(plan.rows.map((r) => [r.line, r]));
  const writable = parsed.coaches.filter((c) => byLine.get(c.line)?.kind !== "skip");
  result.skipped = parsed.coaches.length - writable.length;

  // New accounts. `COACH`, because the coach portal is parked and none of
  // these can sign in — the right default for a register of people FQ has
  // qualified rather than invited. `canSignIn()` is the one place that decides
  // it and this import does not go near it.
  const creating = writable.filter((c) => byLine.get(c.line)!.kind === "create");
  for (const chunk of chunks(creating)) {
    await prisma.user.createMany({
      data: chunk.map((c) => ({
        email: normalizeEmail(c.email!),
        name: c.name,
        role: "COACH" as const,
        faNumber: c.faNumber,
      })),
    });
  }
  result.created = creating.length;

  // Every account this import touches, re-read now the new ones exist, so a
  // record can be written against an id rather than an upsert's `where`.
  const accounts = new Map<string, string>();
  for (const chunk of chunks(writable.map((c) => normalizeEmail(c.email ?? "")).filter(Boolean))) {
    const found = await prisma.user.findMany({
      where: { email: { in: chunk } },
      select: { id: true, email: true, faNumber: true },
    });
    for (const u of found) accounts.set(u.email, u.id);
  }
  // A row that matched by FA number alone has no address this can look up.
  for (const c of writable) {
    const row = byLine.get(c.line)!;
    if (row.userId && c.email) accounts.set(c.email, row.userId);
    else if (row.userId && !c.email) accounts.set(`fa:${c.faNumber}`, row.userId);
  }

  const idFor = (coach: ParsedCoach) =>
    (coach.email ? accounts.get(coach.email) : undefined) ??
    accounts.get(`fa:${coach.faNumber}`) ??
    byLine.get(coach.line)!.userId;

  // FA numbers, filled in and never changed: a different number on an account
  // that matched by address is upstream renumbering somebody, and overwriting
  // it here would hide that. One query per chunk, since `updateMany` can carry
  // only one value — grouped by the number so a chunk of coaches is a chunk of
  // queries rather than one per coach either way.
  const needNumber = writable.filter((c) => {
    const row = byLine.get(c.line)!;
    return c.faNumber && (row.kind === "create" || row.changes.some((x) => x.field === "FA number"));
  });
  for (const coach of needNumber) {
    if (byLine.get(coach.line)!.kind === "create") continue; // set by createMany
    const id = idFor(coach);
    if (!id) continue;
    await prisma.user.updateMany({
      where: { id, faNumber: null },
      data: { faNumber: coach.faNumber },
    });
  }

  // The records themselves. New ones in chunks; existing ones one at a time,
  // and only where a field actually differs.
  const records = await prisma.coachRecord.findMany({ select: { id: true, userId: true } });
  const recordIds = new Map(records.map((r) => [r.userId, r.id]));

  const newRecords = writable.filter((c) => {
    const id = idFor(c);
    return id && !recordIds.has(id);
  });
  for (const chunk of chunks(newRecords)) {
    await prisma.coachRecord.createMany({
      data: chunk.map((c) => ({
        userId: idFor(c)!,
        ...recordFields(c, affiliateIds, parsed.sourceFile, byLine),
      })),
    });
  }
  result.attached = newRecords.filter((c) => byLine.get(c.line)!.kind === "attach").length;

  for (const coach of writable) {
    const row = byLine.get(coach.line)!;
    if (row.kind === "unchanged") {
      result.unchanged++;
      continue;
    }
    if (row.kind !== "update") continue;
    const id = idFor(coach);
    if (!id) continue;
    await prisma.coachRecord.update({
      where: { userId: id },
      data: recordFields(coach, affiliateIds, parsed.sourceFile, byLine),
    });
    result.updated++;
  }

  if (newRecords.length) {
    const added = await prisma.coachRecord.findMany({
      where: { userId: { in: newRecords.map((c) => idFor(c)!).filter(Boolean) } },
      select: { id: true, userId: true },
    });
    for (const r of added) recordIds.set(r.userId, r.id);
  }

  result.qualifications = await writeQualifications(writable, recordIds, idFor);
  return result;
}

/** Two hundred rows a query. Chunked so one statement never grows unbounded. */
function chunks<T>(items: T[], size = 200): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * The fields an import writes, for a create and for an update alike.
 *
 * `undefined` leaves a column as it stands and `null` would clear it, so every
 * optional field here is coalesced to undefined. This is the one place the
 * no-blanking rule is actually enforced, and the `?? undefined` on each line
 * is the enforcement: a hand-kept sheet with 625 missing regions must not
 * delete 625 regions somebody has since filled in.
 */
function recordFields(
  coach: ParsedCoach,
  affiliateIds: Map<string, string>,
  sourceFile: string,
  byLine: Map<number, CoachPlan>,
) {
  const row = byLine.get(coach.line);
  const region = row?.changes.find((c) => c.field === "Region")?.to ?? coach.region;
  const interest = coach.bDiplomaInterest ? ("YES" as const) : undefined;
  const affiliateId = coach.affiliateSlug ? affiliateIds.get(coach.affiliateSlug) : null;
  return {
    affiliateId: affiliateId ?? undefined,
    clubName: coach.clubName ?? undefined,
    region: region ?? undefined,
    internalRating: coach.internalRating ?? undefined,
    ratingSource: coach.internalRating !== null ? ratingSource(coach, sourceFile) : undefined,
    ratingAt: coach.internalRating !== null ? new Date() : undefined,
    statusNote: coach.statusNote ?? undefined,
    bDiplomaInterest: interest,
    bDiplomaInterestAt: interest ? new Date() : undefined,
    bDiplomaInterestNote: coach.bDiplomaInterestNote ?? undefined,
    source: sourceFile,
  };
}

function ratingSource(coach: ParsedCoach, file: string) {
  return coach.ratingFrom ? `${file} · ${coach.ratingFrom}` : file;
}

/**
 * Every coach's qualification rows, replaced.
 *
 * Deleted and rewritten rather than reconciled, because this table is a cache
 * of FALC and holds nothing of FQ's own: the worst a replacement can do is
 * write the same rows again. A qualification the export has stopped carrying
 * is one FALC no longer says they hold, and keeping it would mean the register
 * slowly filling with licences nobody can account for.
 *
 * Done for every coach on every import, including the ones whose other fields
 * are unchanged — a record that happens to match on club and rating is not a
 * record whose licences have not been renewed, and an expiry is exactly what
 * moves between two exports.
 *
 * A coach the file carries no qualifications for is left alone entirely. An
 * empty list there means the sheet was blank, not that they hold none.
 */
async function writeQualifications(
  coaches: ParsedCoach[],
  recordIds: Map<string, string>,
  idFor: (coach: ParsedCoach) => string | null,
) {
  const rows: { recordId: string; name: string; completedAt: Date | null; expiresAt: Date | null; status: string | null; cpd: string | null }[] = [];
  const touched: string[] = [];

  for (const coach of coaches) {
    if (!coach.qualifications.length) continue;
    const userId = idFor(coach);
    const recordId = userId ? recordIds.get(userId) : undefined;
    if (!recordId) continue;
    touched.push(recordId);
    for (const q of coach.qualifications) {
      rows.push({
        recordId,
        name: q.name,
        // Midnight UTC, so a date read back is the day the export meant
        // wherever the server happens to be.
        completedAt: q.completedAt ? new Date(`${q.completedAt}T00:00:00Z`) : null,
        expiresAt: q.expiresAt ? new Date(`${q.expiresAt}T00:00:00Z`) : null,
        status: q.status,
        cpd: q.cpd,
      });
    }
  }

  for (const chunk of chunks(touched, 500)) {
    await prisma.coachQualification.deleteMany({ where: { recordId: { in: chunk } } });
  }
  for (const chunk of chunks(rows)) {
    await prisma.coachQualification.createMany({ data: chunk });
  }
  return rows.length;
}
