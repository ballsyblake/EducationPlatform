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

const prisma = new PrismaClient({ adapter: createAdapter() });

const DATA = path.join(process.cwd(), "prisma", "data", "b-diploma-2026.json");

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

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const confirmed = args.includes("--yes");

  if (!dryRun && !confirmed) {
    console.log(
      "Refusing to write without --yes.\n\n" +
        "  npm run courses:import -- --dry-run   what would change\n" +
        "  npm run courses:import -- --yes       do it\n",
    );
    return;
  }

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
  };

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

      for (const [dayNo, present] of Object.entries(coach.attendance)) {
        const courseDayId = dayIds.get(Number(dayNo));
        if (!courseDayId) continue;
        await prisma.attendance.upsert({
          where: { courseDayId_enrollmentId: { courseDayId, enrollmentId: row.id } },
          create: { courseDayId, enrollmentId: row.id, present },
          update: { present },
        });
        counts.attendance += 1;
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
    console.log(`  Attendance marks   ${counts.attendance}`);
    console.log(`  Course staff       ${counts.staff} (${counts.staffAttendance} marks)`);
    console.log(`  Deliveries         ${counts.deliveries}`);
  }
  console.log(`  Below the pass mark ${counts.belowThreshold}`);
  console.log(
    "\nNobody has been referred: they show on /admin/support as candidates, and opening a\n" +
      "case is a decision an educator makes after the conversation.\n",
  );
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
