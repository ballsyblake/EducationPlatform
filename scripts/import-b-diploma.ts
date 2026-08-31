/**
 * Loads Football Queensland's B Diploma attendance registers as courses.
 *
 *   npm run courses:import -- --dry-run    say what would change, write nothing
 *   npm run courses:import -- --yes        do it
 *
 * The data comes from `prisma/data/b-diploma-2026.json`, extracted from the
 * registers by `scripts/extract-b-diploma-2026.py`. Two steps rather than one
 * because the registers are the coach education team's working documents and
 * will change shape next intake, while the JSON is a flat record of one intake
 * that can be reviewed, diffed and re-imported without Excel in the loop.
 *
 * Idempotent throughout: every write is an upsert keyed on something stable, so
 * a second run corrects the first rather than duplicating it.
 *
 * Addresses in that file are anonymised — see the extractor's header. Names are
 * real, so this is real people's assessment history: it is a deliberate command
 * and is never run at boot or on deploy.
 *
 * What it deliberately does NOT do:
 *
 *   - Open support cases. The register rates coaches, and plenty of them sit
 *     below the pass mark; every one of those is a conversation an educator has
 *     before a case exists. They land on /admin/support as candidates instead.
 *   - Send anybody anything. Accounts are created with no password and no
 *     token; a sign-in link is something an admin hands over on purpose.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "../generated/prisma/client.ts";
import { createAdapter } from "../src/lib/adapter.ts";
import { dayMinutes } from "../src/lib/attendance.ts";

const DATA = path.join(process.cwd(), "prisma", "data", "b-diploma-2026.json");

/**
 * The row in Meta that says this has already been loaded.
 *
 * Only read by the boot-time path — see `scripts/import-courses.ts`. Running
 * the command by hand ignores it, because somebody typing `--yes` has said what
 * they want.
 */
export const B_DIPLOMA_IMPORT_MARKER = "b-diploma-2026-imported";

/* --------------------------- Hours in the margins -------------------------- */

/**
 * The hours the registers record in prose rather than in the grid.
 *
 * A tick can only say "the whole day", so anything smaller ends up in the
 * Comments column: "Missed Day 2 PM", "3 hours missed on Day 2", "catch up full
 * day of Day 3". Those sentences are the register's real record of attendance,
 * and leaving them as text means nothing can total them.
 *
 * Read narrowly on purpose. Only these three shapes are understood, each one
 * naming both a quantity and a day; everything vaguer — "needs to catch up a
 * few hours on another B" — is left for a person to raise on the make-ups desk,
 * and reported at the end of the run rather than guessed at. An importer that
 * invents hours is worse than one that admits it can't read the sentence.
 */
type Shortfall = { dayNo: number; minutes: number | null; half: boolean };

function shortfallsFromComment(comment: string | null): Shortfall[] {
  if (!comment) return [];
  const out: Shortfall[] = [];

  // "Missed Day 2 PM" — half a day, whichever half.
  for (const m of comment.matchAll(/missed\s+day\s*(\d+)\s*(am|pm)/gi)) {
    out.push({ dayNo: Number(m[1]), minutes: null, half: true });
  }
  // "3 hours missed on Day 2"
  for (const m of comment.matchAll(/(\d+(?:\.\d+)?)\s*hours?\s+missed\s+on\s+day\s*(\d+)/gi)) {
    out.push({ dayNo: Number(m[2]), minutes: Math.round(Number(m[1]) * 60), half: false });
  }
  // "catch up full day of Day 3 on Sunny Coast B" — the day missed here; where
  // it is being made up is the rest of the sentence, kept as the note.
  for (const m of comment.matchAll(/full\s+day\s+of\s+day\s*(\d+)/gi)) {
    out.push({ dayNo: Number(m[1]), minutes: null, half: false });
  }

  return out;
}

/**
 * A catch-up's note says what they came to sit: "1.5 hours Day 3".
 *
 * That is attendance, not a debt — the coach is on this register precisely
 * because they owe the hours somewhere else — so it corrects the tick rather
 * than raising anything.
 */
function partialFromCatchUpNote(note: string | null): { dayNo: number; minutes: number } | null {
  if (!note) return null;
  const m = /(\d+(?:\.\d+)?)\s*hours?\s+day\s*(\d+)/i.exec(note);
  if (!m) return null;
  return { dayNo: Number(m[2]), minutes: Math.round(Number(m[1]) * 60) };
}

/** Hours talked about but never quantified — for a human to pick up. */
function mentionsHours(text: string | null): boolean {
  if (!text) return false;
  return /(catch\s*up|make\s*up|missed)/i.test(text);
}

type Delivery = {
  deliveryNo: number;
  assessor: string | null;
  block: string | null;
  component: string | null;
  topic: string | null;
  comment: string | null;
  actionPlan: string | null;
  rating: number | null;
  raw: string | null;
};

type Coach = {
  position: number;
  firstName: string;
  lastName: string;
  email: string;
  track: "MAIN" | "CATCH_UP";
  catchUpNote: string | null;
  age: number | null;
  gender: string | null;
  club: string | null;
  coachingAgeGroup: string | null;
  status: string | null;
  falcUsername: string | null;
  attendance: Record<string, boolean>;
  attendanceMet: boolean | null;
  journal: boolean | null;
  rating: number | null;
  outcome: string | null;
  readiness: string | null;
  comments: string | null;
  deliveries: Delivery[];
};

type CourseData = {
  slug: string;
  title: string;
  qualification: string | null;
  stream: string | null;
  location: string | null;
  address: string | null;
  season: string;
  days: {
    dayNo: number;
    weekday: string | null;
    date: string;
    startTime: string | null;
    endTime: string | null;
  }[];
  staff: { role: string; name: string; position: number; attendance: Record<string, boolean> }[];
  coaches: Coach[];
};

type Data = { intake: string; rubric: { passMark: number }; courses: CourseData[] };

/**
 * The register's Outcome column, mapped onto the enum.
 *
 * "In Progress" is what every row says while a course is still running, and it
 * is not a verdict — the rating decides, and an unrated coach is simply not
 * there yet. Anything the register says outright is taken at its word.
 */
function outcomeFor(coach: Coach, threshold: number) {
  const said = (coach.outcome ?? "").trim().toLowerCase();
  if (said.startsWith("pass")) return "PASSED" as const;
  if (said.startsWith("post")) return "POST_COURSE_SUPPORT" as const;
  if (said.startsWith("withdraw")) return "WITHDRAWN" as const;
  if (coach.rating === null) return "IN_PROGRESS" as const;
  return coach.rating >= threshold ? ("PASSED" as const) : ("POST_COURSE_SUPPORT" as const);
}

function displayName(coach: Coach) {
  return `${coach.firstName} ${coach.lastName}`.trim();
}

/** A course educator's address, derived the way the CDA importer derives them. */
function staffEmail(name: string) {
  const [first, ...rest] = name.trim().split(/\s+/);
  const initial = rest.length ? rest[rest.length - 1][0] : "";
  const stem = `${first}${initial}`.toLowerCase().replace(/[^a-z]/g, "");
  return `${stem}@${process.env.FQ_ASSESSOR_DOMAIN ?? "footballqueensland.com.au"}`;
}

/**
 * Loads the registers. Exported so it can also run on a host with no shell —
 * see `scripts/import-courses.ts` and B_DIPLOMA_IMPORT_2026 there.
 *
 * Takes the client rather than owning one, so the boot-time path can share a
 * connection and control when it is closed.
 */
export async function importBDiploma(prisma: PrismaClient, { dry = false } = {}) {
  const dryRun = dry;

  const data: Data = JSON.parse(readFileSync(DATA, "utf8"));
  const threshold = data.rubric.passMark;

  const counts = {
    courses: 0,
    days: 0,
    coaches: 0,
    newAccounts: 0,
    enrolments: 0,
    attendance: 0,
    staff: 0,
    staffAttendance: 0,
    deliveries: 0,
    belowThreshold: 0,
    makeUps: 0,
    partDays: 0,
  };
  /** Register comments about hours that name no quantity. Printed at the end. */
  const unreadable: string[] = [];

  for (const course of data.courses) {
    console.log(`\n${course.title}`);

    if (dryRun) {
      const existing = await prisma.course.findFirst({ where: { title: course.title } });
      console.log(`  ${existing ? "update" : "create"} course · ${course.days.length} days`);
      console.log(`  ${course.coaches.length} coaches · ${course.staff.length} staff`);
      const known = await prisma.user.count({
        where: { email: { in: course.coaches.map((c) => c.email) } },
      });
      console.log(`  ${course.coaches.length - known} accounts to create, ${known} already here`);
      counts.courses += 1;
      counts.coaches += course.coaches.length;
      counts.belowThreshold += course.coaches.filter(
        (c) => c.rating !== null && c.rating < threshold,
      ).length;
      continue;
    }

    // The title carries qualification, stream and location, and no two intakes
    // share one — which makes it the stable key an upsert needs, since Course
    // has no natural unique column of its own.
    const existing = await prisma.course.findFirst({ where: { title: course.title } });
    const record = {
      title: course.title,
      season: course.season,
      qualification: course.qualification,
      stream: course.stream,
      location: course.location,
      venue: course.address,
      ratingThreshold: threshold,
      published: true,
      description:
        `Football Australia ${course.qualification ?? "diploma"}, delivered at ` +
        `${course.address ?? course.location} across ${course.days.length} days in three blocks.`,
    };

    const saved = existing
      ? await prisma.course.update({ where: { id: existing.id }, data: record })
      : await prisma.course.create({ data: record });
    counts.courses += 1;

    // ---- Days -------------------------------------------------------------
    const dayIds = new Map<number, string>();
    /// Day number -> scheduled length, so a tick in the register becomes the
    /// hours that day was actually run for.
    const dayLengths = new Map<number, number>();
    for (const day of course.days) {
      const row = await prisma.courseDay.upsert({
        where: { courseId_dayNo: { courseId: saved.id, dayNo: day.dayNo } },
        create: {
          courseId: saved.id,
          dayNo: day.dayNo,
          weekday: day.weekday,
          date: new Date(`${day.date}T00:00:00Z`),
          startTime: day.startTime,
          endTime: day.endTime,
        },
        update: {
          weekday: day.weekday,
          date: new Date(`${day.date}T00:00:00Z`),
          startTime: day.startTime,
          endTime: day.endTime,
        },
      });
      dayIds.set(day.dayNo, row.id);
      dayLengths.set(day.dayNo, dayMinutes(day));
      counts.days += 1;
    }

    // ---- Course staff -----------------------------------------------------
    for (const member of course.staff) {
      const email = staffEmail(member.name);
      // An educator is an admin: they run courses in this product, and the CDA
      // importer creates them the same way. Existing accounts are left alone —
      // an import must never quietly change somebody's role.
      const user = await prisma.user.upsert({
        where: { email },
        create: { email, name: member.name, role: "ADMIN", title: "Coach Education" },
        update: { name: member.name },
      });

      const staff = await prisma.courseStaff.upsert({
        where: { courseId_role: { courseId: saved.id, role: member.role } },
        create: {
          courseId: saved.id,
          role: member.role,
          name: member.name,
          userId: user.id,
          position: member.position,
        },
        update: { name: member.name, userId: user.id, position: member.position },
      });
      counts.staff += 1;

      for (const [dayNo, present] of Object.entries(member.attendance)) {
        const courseDayId = dayIds.get(Number(dayNo));
        if (!courseDayId) continue;
        await prisma.staffAttendance.upsert({
          where: { courseDayId_staffId: { courseDayId, staffId: staff.id } },
          create: { courseDayId, staffId: staff.id, present },
          update: { present },
        });
        counts.staffAttendance += 1;
      }
    }

    // ---- Coaches ----------------------------------------------------------
    for (const coach of course.coaches) {
      const before = await prisma.user.findUnique({ where: { email: coach.email } });
      if (!before) counts.newAccounts += 1;

      const user = await prisma.user.upsert({
        where: { email: coach.email },
        create: { email: coach.email, name: displayName(coach), role: "COACH" },
        update: { name: displayName(coach) },
      });
      counts.coaches += 1;

      const outcome = outcomeFor(coach, threshold);
      if (outcome === "POST_COURSE_SUPPORT") counts.belowThreshold += 1;

      const enrolment = {
        position: coach.position,
        track: coach.track,
        catchUpNote: coach.catchUpNote,
        ageAtCourse: coach.age,
        gender: coach.gender,
        clubName: coach.club,
        coachingAgeGroup: coach.coachingAgeGroup,
        enrolmentStatus: coach.status,
        externalRef: coach.falcUsername,
        attendanceMet: coach.attendanceMet,
        journalComplete: coach.journal,
        rating: coach.rating,
        outcome,
        readiness: coach.readiness,
        registerComments: coach.comments,
      };

      const row = await prisma.enrollment.upsert({
        where: { userId_courseId: { userId: user.id, courseId: saved.id } },
        create: { userId: user.id, courseId: saved.id, ...enrolment },
        update: enrolment,
      });
      counts.enrolments += 1;

      // The registers mark attendance with a tick, so an import can only say
      // "the whole day" or "none of it". The part days these spreadsheets
      // record in their Comments column — "Missed Day 2 PM" — are read by a
      // person and raised on the make-up ledger, not guessed at here.
      for (const [dayNo, present] of Object.entries(coach.attendance)) {
        const courseDayId = dayIds.get(Number(dayNo));
        if (!courseDayId) continue;
        const minutes = present ? (dayLengths.get(Number(dayNo)) ?? 0) : 0;
        await prisma.attendance.upsert({
          where: { courseDayId_enrollmentId: { courseDayId, enrollmentId: row.id } },
          create: { courseDayId, enrollmentId: row.id, minutes },
          update: { minutes },
        });
        counts.attendance += 1;
      }

      // ---- Hours from the Comments column --------------------------------
      //
      // Applied after the grid, because it corrects it: a coach ticked present
      // on a day the comments say they missed the afternoon of was there for
      // half of it, and the tick is the register's shorthand rather than a
      // contradiction.
      const shortfalls =
        coach.track === "MAIN" ? shortfallsFromComment(coach.comments) : [];

      for (const shortfall of shortfalls) {
        const courseDayId = dayIds.get(shortfall.dayNo);
        const length = dayLengths.get(shortfall.dayNo) ?? 0;
        if (!courseDayId || !length) continue;

        const owed = shortfall.minutes ?? (shortfall.half ? Math.round(length / 2) : length);
        const sat = Math.max(0, length - owed);

        await prisma.attendance.upsert({
          where: { courseDayId_enrollmentId: { courseDayId, enrollmentId: row.id } },
          create: { courseDayId, enrollmentId: row.id, minutes: sat },
          update: { minutes: sat },
        });
        counts.partDays += 1;

        // A stable id, so re-importing corrects the debt rather than raising a
        // second one. The status is OWED, never settled: whether the hours were
        // ever made up is not something the register says.
        const id = `import-${row.id}-day${shortfall.dayNo}`;
        const makeUp = {
          enrollmentId: row.id,
          courseDayId,
          minutesOwed: owed,
          arrangedNote: coach.comments,
        };
        await prisma.attendanceMakeUp.upsert({
          where: { id },
          create: { id, ...makeUp },
          update: makeUp,
        });
        counts.makeUps += 1;
      }

      // A catch-up's note is attendance, not a debt.
      const partial =
        coach.track === "CATCH_UP" ? partialFromCatchUpNote(coach.catchUpNote) : null;
      if (partial) {
        const courseDayId = dayIds.get(partial.dayNo);
        if (courseDayId) {
          await prisma.attendance.upsert({
            where: { courseDayId_enrollmentId: { courseDayId, enrollmentId: row.id } },
            create: { courseDayId, enrollmentId: row.id, minutes: partial.minutes },
            update: { minutes: partial.minutes },
          });
          counts.partDays += 1;
        }
      }

      if (
        shortfalls.length === 0 &&
        !partial &&
        coach.track === "MAIN" &&
        mentionsHours(coach.comments)
      ) {
        unreadable.push(`${coach.firstName} ${coach.lastName} — ${coach.comments}`);
      }

      for (const delivery of coach.deliveries) {
        // The register names an assessor; they are an account here only if they
        // were also rostered onto a course we have imported.
        const assessorUser = delivery.assessor
          ? await prisma.user.findUnique({ where: { email: staffEmail(delivery.assessor) } })
          : null;

        const fields = {
          assessor: delivery.assessor,
          assessorId: assessorUser?.id ?? null,
          block: delivery.block,
          component: delivery.component,
          topic: delivery.topic,
          comment: delivery.comment,
          actionPlan: delivery.actionPlan,
          rating: delivery.rating,
          raw: delivery.raw,
        };

        await prisma.practicalDelivery.upsert({
          where: {
            enrollmentId_deliveryNo: { enrollmentId: row.id, deliveryNo: delivery.deliveryNo },
          },
          create: { enrollmentId: row.id, deliveryNo: delivery.deliveryNo, ...fields },
          update: fields,
        });
        counts.deliveries += 1;
      }
    }

    console.log(
      `  ${course.days.length} days · ${course.coaches.length} coaches · ${course.staff.length} staff`,
    );
  }

  console.log(dryRun ? "\nDry run — nothing was written.\n" : "\nImported.\n");
  console.log(`  Courses            ${counts.courses}`);
  if (!dryRun) {
    console.log(`  Course days        ${counts.days}`);
    console.log(`  Coaches            ${counts.coaches} (${counts.newAccounts} new accounts)`);
    console.log(`  Enrolments         ${counts.enrolments}`);
    console.log(`  Attendance marks   ${counts.attendance} (${counts.partDays} part days)`);
    console.log(`  Make-ups raised    ${counts.makeUps}`);
    console.log(`  Course staff       ${counts.staff} (${counts.staffAttendance} marks)`);
    console.log(`  Deliveries         ${counts.deliveries}`);
  }
  console.log(`  Below the pass mark ${counts.belowThreshold}`);
  if (unreadable.length > 0) {
    console.log(
      `\n  ${unreadable.length} comment${unreadable.length === 1 ? "" : "s"} talk about hours ` +
        "without saying how many.\n  Raise these on /admin/make-ups if they still stand:\n",
    );
    for (const line of unreadable) console.log(`    ${line}`);
  }
  console.log(
    "\nNobody has been referred: they show on /admin/support as candidates, and opening a\n" +
      "case is a decision an educator makes after the conversation.\n",
  );
}

// Only when run directly; the boot-time path owns its own client.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dry = process.argv.includes("--dry-run");
  if (!dry && !process.argv.includes("--yes")) {
    console.log(
      "Refusing to write without --yes.\n\n" +
        "  npm run courses:import -- --dry-run   what would change\n" +
        "  npm run courses:import -- --yes       do it\n",
    );
  } else {
    const prisma = new PrismaClient({ adapter: createAdapter() });
    importBDiploma(prisma, { dry })
      .catch((error) => {
        console.error(error);
        process.exit(1);
      })
      .finally(() => prisma.$disconnect());
  }
}
