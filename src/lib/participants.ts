import "server-only";

import { normalizeEmail } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ensureDiplomaCoursework } from "@/lib/diploma-coursework";
import {
  ageOn,
  parseDob,
  parseParticipantCsv,
  participantName,
  type ParticipantRow,
} from "@/lib/participant-csv";

/**
 * Enrolling an FA participant export onto a cohort.
 *
 * FQ's enrolments are taken in the FA learning system and keyed there; this
 * platform's accounts are keyed on an address. So an import is first a matching
 * problem and only then a writing one, and this file keeps the two apart: a
 * plan is computed from reads alone, shown to whoever is importing, and applied
 * unchanged. Preview and commit run the same function — `planImport` — because
 * a preview that is a separate code path is a preview of something else.
 *
 * What it will not do, each for the reason the register importer gives:
 *
 *   - Remove an enrolment the file has stopped mentioning. A coach dropped from
 *     an export is somebody's registration being cancelled upstream, and this
 *     import must never be the thing that takes a register row and its
 *     attendance off a person. They are listed as unmatched and left alone.
 *   - Change a role, an address, or whether an account is active. An export
 *     cannot promote, rename-to-a-new-login, or deactivate anybody.
 *   - Renumber a register. `position` is set when a row is created and never
 *     touched again: the order the register is kept in belongs to the register.
 *   - Overwrite a club, a rating or an outcome. The export carries none of
 *     those, and the register's own record of them is the better one.
 */

/** What this import would do to one row of the file. */
export type RowPlanKind =
  /** No account with this address or FA number: one would be created. */
  | "create"
  /** Matched an account that is not on this course: it would be enrolled. */
  | "enroll"
  /** Already enrolled here; the FA number and status would be filled in. */
  | "update"
  /** Already enrolled and nothing in the file differs from the record. */
  | "unchanged"
  /** Cannot be imported. `problems` says why, and nothing is written. */
  | "skip";

export type RowPlan = {
  line: number;
  name: string | null;
  email: string | null;
  externalId: string | null;
  kind: RowPlanKind;
  /** How the account was found, for a row that matched one. */
  matchedBy: "email" | "externalId" | null;
  /** The account this row resolves to, where one already exists. */
  userId: string | null;
  /** The address on the matched account, when the file disagrees with it. */
  accountEmail: string | null;
  /** Age on the cohort's first day, where both the date and the day are known. */
  ageAtCourse: number | null;
  /** FA's own enrolment state — "Enrolled", "Initiated Enrolment". */
  status: string | null;
  /** Reasons a row is skipped. */
  problems: string[];
  /** Things worth a person's eye that do not stop the row. */
  notes: string[];
};

export type ImportPlan = {
  course: { id: string; title: string; qualification: string | null; firstDay: Date | null };
  rows: RowPlan[];
  /** Headings nothing is stored from — the prerequisite questions, and these. */
  unknownColumns: string[];
  /** Recognised columns this schema has nowhere to put. */
  droppedColumns: string[];
  /** Already on the register, absent from the file. Reported, never removed. */
  unmatchedEnrolments: { name: string | null; email: string }[];
  counts: Record<RowPlanKind, number>;
  /** Why no plan could be made at all. */
  error?: string;
};

/**
 * Columns the parser recognises and this schema cannot hold.
 *
 * Listed rather than ignored. A phone number and a dietary answer are real
 * facts an admin can see in the file and will reasonably expect to find in the
 * app afterwards, and the honest thing is to say on the page that they are not
 * stored instead of letting somebody discover it later. `Suborganisation` is
 * the member federation's region — "FQ - SEQ" — and is deliberately *not*
 * written to `Enrollment.clubName`: a region is not a club, and a wrong club on
 * a register is worse than an empty one.
 */
const DROPPED: Partial<Record<string, string>> = {
  phone: "Phone Number",
  department: "Department",
  suborganisation: "Suborganisation",
  username: "Username",
};

/**
 * Does the file's own course name look like the cohort being imported into?
 *
 * A warning, never a block: the export says "C Diploma" and the cohort is
 * called "C Diploma — Regional Gold Coast 2026", so containment is as much as
 * can be checked. It exists because the import is driven from a course page and
 * the one mistake it cannot otherwise catch is the right file on the wrong
 * cohort.
 */
function courseLooksRight(
  fileCourse: string | null,
  course: { title: string; qualification: string | null },
) {
  if (!fileCourse) return true;
  const haystack = `${course.title} ${course.qualification ?? ""}`.toLowerCase();
  const needle = fileCourse.toLowerCase().trim();
  return haystack.includes(needle) || needle.includes(course.title.toLowerCase());
}

/**
 * Work out what the file would do, reading only.
 *
 * Matching order is address first, FA number second. The address is what an
 * account *is* here — it is the unique key, and the thing a sign-in link goes
 * to — while the FA number is what survives somebody changing their address,
 * which is exactly the case the plain upsert used to get wrong by creating a
 * second account for the same coach. Where the two disagree about which person
 * this is, the row is skipped rather than resolved by a rule: two accounts and
 * one participant is a merge, and a merge is a decision.
 */
export async function planImport(courseId: string, text: string): Promise<ImportPlan> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      title: true,
      qualification: true,
      days: { orderBy: { date: "asc" }, take: 1, select: { date: true } },
    },
  });
  if (!course) throw new Error("No such course.");

  const shell = {
    id: course.id,
    title: course.title,
    qualification: course.qualification,
    firstDay: course.days[0]?.date ?? null,
  };

  const parsed = parseParticipantCsv(text);
  const empty: ImportPlan = {
    course: shell,
    rows: [],
    unknownColumns: parsed.unknownColumns,
    droppedColumns: [],
    unmatchedEnrolments: [],
    counts: { create: 0, enroll: 0, update: 0, unchanged: 0, skip: 0 },
  };

  if (parsed.error) return { ...empty, error: parsed.error };
  if (!parsed.rows.length) return { ...empty, error: "The file has a header and no rows." };

  const droppedColumns = parsed.columns.map((c) => DROPPED[c]).filter((c): c is string => !!c);

  // Three queries for the whole file rather than two per row: a 200-row export
  // against a hosted database is where round trips add up.
  const emails = [...new Set(parsed.rows.map((r) => r.email && normalizeEmail(r.email)))].filter(
    (e): e is string => !!e,
  );
  const refs = [...new Set(parsed.rows.map((r) => r.externalId))].filter(
    (r): r is string => !!r,
  );

  const [byEmail, byRef, roster] = await Promise.all([
    emails.length
      ? prisma.user.findMany({
          where: { email: { in: emails } },
          select: { id: true, email: true, name: true },
        })
      : [],
    // The FA number lives on the enrolment, not the account — it is as-at-a-
    // course like everything else off the register — so an account is reached
    // through any enrolment that carries the number, on any cohort.
    refs.length
      ? prisma.enrollment.findMany({
          where: { externalRef: { in: refs } },
          select: {
            externalRef: true,
            user: { select: { id: true, email: true, name: true } },
          },
        })
      : [],
    prisma.enrollment.findMany({
      where: { courseId },
      select: {
        userId: true,
        position: true,
        externalRef: true,
        enrolmentStatus: true,
        ageAtCourse: true,
        user: { select: { email: true, name: true } },
      },
    }),
  ]);

  const emailMap = new Map(byEmail.map((u) => [u.email, u]));
  const refMap = new Map<string, { id: string; email: string; name: string | null }>();
  for (const row of byRef) {
    if (row.externalRef && !refMap.has(row.externalRef)) refMap.set(row.externalRef, row.user);
  }
  const enrolled = new Map(roster.map((r) => [r.userId, r]));

  const rows: RowPlan[] = [];
  const seenEmails = new Set<string>();
  const seenRefs = new Set<string>();
  const matchedUsers = new Set<string>();

  for (const row of parsed.rows) {
    const plan = planRow(row, {
      course: shell,
      emailMap,
      refMap,
      enrolled,
      seenEmails,
      seenRefs,
    });
    if (plan.userId && plan.kind !== "skip") matchedUsers.add(plan.userId);
    rows.push(plan);
  }

  const counts: Record<RowPlanKind, number> = {
    create: 0,
    enroll: 0,
    update: 0,
    unchanged: 0,
    skip: 0,
  };
  for (const row of rows) counts[row.kind] += 1;

  return {
    course: shell,
    rows,
    unknownColumns: parsed.unknownColumns,
    droppedColumns,
    unmatchedEnrolments: roster
      .filter((r) => !matchedUsers.has(r.userId))
      .map((r) => ({ name: r.user.name, email: r.user.email })),
    counts,
  };
}

type Lookups = {
  course: ImportPlan["course"];
  emailMap: Map<string, { id: string; email: string; name: string | null }>;
  refMap: Map<string, { id: string; email: string; name: string | null }>;
  enrolled: Map<
    string,
    {
      externalRef: string | null;
      enrolmentStatus: string | null;
      ageAtCourse: number | null;
    }
  >;
  seenEmails: Set<string>;
  seenRefs: Set<string>;
};

function planRow(row: ParticipantRow, lookups: Lookups): RowPlan {
  const { course, emailMap, refMap, enrolled, seenEmails, seenRefs } = lookups;
  const email = row.email ? normalizeEmail(row.email) : null;
  const name = participantName(row);
  const problems: string[] = [];
  const notes: string[] = [];

  const base = {
    line: row.line,
    name,
    email,
    externalId: row.externalId,
    matchedBy: null as RowPlan["matchedBy"],
    userId: null as string | null,
    accountEmail: null as string | null,
    ageAtCourse: null as number | null,
    status: row.status,
  };

  if (!courseLooksRight(row.courses, course)) {
    notes.push(`The file says "${row.courses}", this cohort is "${course.title}".`);
  }

  if (row.dob && !parseDob(row.dob)) {
    notes.push(`Date of birth "${row.dob}" isn't a date I can read; age left blank.`);
  }

  // Deliberately not a problem. FA's export marks a registration that was
  // started and not finished as "Initiated Enrolment", and FQ does put those
  // people on a register — the status is kept on the row so the register shows
  // it, and whether to chase it is a person's call.
  const emailAccount = email ? emailMap.get(email) : undefined;
  const refAccount = row.externalId ? refMap.get(row.externalId) : undefined;

  if (email && seenEmails.has(email)) {
    problems.push("The same address appears earlier in the file.");
  }
  if (row.externalId && seenRefs.has(row.externalId)) {
    problems.push("The same FA number appears earlier in the file.");
  }
  if (email) seenEmails.add(email);
  if (row.externalId) seenRefs.add(row.externalId);

  if (!name) problems.push("No name.");
  if (!email && !emailAccount && !refAccount) {
    problems.push("No email address, and no existing account with this FA number.");
  }

  if (emailAccount && refAccount && emailAccount.id !== refAccount.id) {
    problems.push(
      `This address belongs to one account and FA number ${row.externalId} to another (${refAccount.email}). Sort that out by hand before importing.`,
    );
  }

  if (problems.length) return { ...base, kind: "skip", problems, notes };

  const account = emailAccount ?? refAccount ?? null;
  const matchedBy = emailAccount ? "email" : refAccount ? "externalId" : null;

  if (account && matchedBy === "externalId" && email && account.email !== email) {
    // Not applied. Changing an address changes where a sign-in link goes and
    // who can use it, and an import is the wrong place for that.
    notes.push(
      `Matched on FA number. The file has ${email}; the account stays on ${account.email}.`,
    );
  }

  const dob = parseDob(row.dob);
  const ageAtCourse = dob && course.firstDay ? ageOn(dob, course.firstDay) : null;
  if (dob && !course.firstDay) {
    notes.push("No course days yet, so there is no day to work an age out on.");
  }

  const existing = account ? enrolled.get(account.id) : undefined;

  let kind: RowPlanKind;
  if (!account) kind = "create";
  else if (!existing) kind = "enroll";
  else {
    const changes =
      (row.externalId && existing.externalRef !== row.externalId) ||
      (row.status && existing.enrolmentStatus !== row.status) ||
      (ageAtCourse !== null && existing.ageAtCourse === null);
    kind = changes ? "update" : "unchanged";
  }

  return {
    ...base,
    kind,
    matchedBy,
    userId: account?.id ?? null,
    accountEmail: account?.email ?? null,
    ageAtCourse,
    problems,
    notes,
  };
}

export type ImportResult = {
  created: number;
  enrolled: number;
  updated: number;
  unchanged: number;
  skipped: number;
};

/**
 * Apply a plan.
 *
 * Takes the file rather than the plan the page was shown, and re-plans: the
 * roster can have moved between the preview and the button, and the plan is
 * cheap. Every write is an upsert keyed on something stable — an account on its
 * address, a row on (account, course) — so running the same export twice
 * corrects the first run rather than doubling the register.
 */
export async function applyImport(courseId: string, text: string): Promise<ImportResult> {
  const plan = await planImport(courseId, text);
  if (plan.error) throw new Error(plan.error);

  const result: ImportResult = { created: 0, enrolled: 0, updated: 0, unchanged: 0, skipped: 0 };

  // New rows go on the end of the register in file order. An existing row keeps
  // the number it has.
  const last = await prisma.enrollment.aggregate({
    where: { courseId },
    _max: { position: true },
  });
  let position = (last._max.position ?? 0) + 1;

  for (const row of plan.rows) {
    if (row.kind === "skip") {
      result.skipped += 1;
      continue;
    }
    if (row.kind === "unchanged") {
      result.unchanged += 1;
      continue;
    }

    let userId = row.userId;
    if (!userId) {
      // `email` is non-null on any row that reached here without a match: a row
      // with neither an address nor a match is a skip.
      const created = await prisma.user.create({
        data: { email: row.email!, name: row.name, role: "COACH" },
      });
      userId = created.id;
      result.created += 1;
    } else if (row.name) {
      // The name and nothing else. The export is the system the coach typed it
      // into, so it is the better spelling; the role, the address and whether
      // the account is active are not an import's business.
      await prisma.user.update({ where: { id: userId }, data: { name: row.name } });
    }

    // Only a row that is actually being created takes a number. Evaluating
    // `position++` inside the upsert's `create` spent one on every update too,
    // which left gaps in the register's numbering for rows it never added.
    const takesPosition = row.kind === "create" || row.kind === "enroll";

    await prisma.enrollment.upsert({
      where: { userId_courseId: { userId, courseId } },
      create: {
        userId,
        courseId,
        position: takesPosition ? position++ : position,
        externalRef: row.externalId,
        enrolmentStatus: row.status,
        ageAtCourse: row.ageAtCourse,
      },
      update: {
        // Only what the export is authoritative about. `undefined` where the
        // file is silent, so a blank column cannot wipe a field somebody filled
        // in; `ageAtCourse` only when nobody has one, because a register that
        // already carries an age had a person put it there.
        externalRef: row.externalId ?? undefined,
        enrolmentStatus: row.status ?? undefined,
        ...(row.ageAtCourse !== null ? { ageAtCourse: row.ageAtCourse } : {}),
      },
    });

    if (row.kind === "enroll") result.enrolled += 1;
    if (row.kind === "update") result.updated += 1;
  }

  // Nobody joins a diploma without its coursework — the same call enrolling one
  // coach by hand makes, for the same reason.
  if (result.created || result.enrolled) await ensureDiplomaCoursework(prisma, [courseId]);

  return result;
}
