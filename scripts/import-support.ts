/**
 * Loads Football Queensland's post-course support registers as cases.
 *
 *   npm run support:import -- --dry-run    say what would change, write nothing
 *   npm run support:import -- --yes        do it
 *
 * The data comes from `prisma/data/post-course-support.json`, extracted from
 * the workbooks by `scripts/extract-post-course-support.py`. Two steps rather
 * than one, for the reason the B Diploma importer gives at length.
 *
 * **Where the file lives.** Unlike the register and season imports, this one's
 * JSON carries real addresses — a case has to reach the coach it belongs to —
 * so it is not committed. Point `SUPPORT_DATA_FILE` at it: on Render that is a
 * Secret File, mounted at `/etc/secrets/post-course-support.json`. Without the
 * file this script says so and exits, which is what a deploy with the variable
 * set but the file missing should do.
 *
 * Idempotent throughout: every write is an upsert keyed on something stable —
 * a case on (course, coach), an activity on its text and its date — so a
 * second run corrects the first rather than duplicating it.
 *
 * What it deliberately does NOT do:
 *
 *   - Close or delete a case the register has stopped mentioning. A row that
 *     disappears from a spreadsheet is somebody tidying, not an outcome, and
 *     this import must never be the thing that silently ends a case.
 *   - Record attempts. A SupportAttempt is an assessed delivery with a rating
 *     against the rubric, and the register keeps neither — "PASS Live
 *     Assessment conducted by Alec" is the outcome, not the marks. Inventing
 *     an attempt would put a rated delivery in a coach's record that nobody
 *     ever rated. The case carries the outcome; the log carries the history.
 *   - Rewrite an enrolment the registers put there. Where a coach is already
 *     enrolled on the cohort, the register's roster is the better record.
 *   - Send anybody anything.
 */
import "dotenv/config";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "../generated/prisma/client.ts";
import { createAdapter } from "../src/lib/adapter.ts";

/**
 * Where the extract is, in the order the places are tried.
 *
 * The default is the repository path the other importers use, so a developer
 * who has the file locally needs no variable; the override is what a host with
 * no shell and no committed data needs.
 */
export function dataFile() {
  return (
    process.env.SUPPORT_DATA_FILE ||
    path.join(process.cwd(), "prisma", "data", "post-course-support.json")
  );
}

/** The row in Meta that says this has already been loaded. */
export const SUPPORT_IMPORT_MARKER = "post-course-support-imported";

type Activity = { kind: string; occurredAt: string; detail: string };

type Case = {
  source: string;
  row: number;
  cohort: string;
  position: number;
  firstName: string;
  lastName: string;
  email: string;
  club: string | null;
  faNumber: string | null;
  season: string | null;
  educatorName: string | null;
  educatorAccount: string | null;
  status: "IN_PROGRESS" | "SUCCESSFUL" | "UNSUCCESSFUL" | "WITHDRAWN" | "LAPSED";
  outcomeRaw: string | null;
  closedAt: string | null;
  deadline: string | null;
  fqRating: number | null;
  faRating: string | null;
  onCourseOutcome: string | null;
  reason: string | null;
  plan: string | null;
  closingNote: string | null;
  notes: string | null;
  activities: Activity[];
  extension: {
    status: "REQUESTED" | "GRANTED" | "REFUSED";
    requestedUntil: string;
    grantedUntil: string | null;
    reason: string | null;
    decidedBy: string | null;
  } | null;
  availability?: { note: string; answeredAt: string | null; source: string };
  issues: string[];
};

type Cohort = {
  key: string;
  label: string;
  qualification: string;
  season: string | null;
  deadline: string | null;
  sources: string[];
};

type Data = { note: string; extractedAt: string; cohorts: Cohort[]; cases: Case[] };

/** Midnight UTC, the way every other date in this schema is stored. */
function day(iso: string | null): Date | null {
  return iso ? new Date(`${iso}T00:00:00Z`) : null;
}

/** A course educator's address, derived the way the other importers derive them. */
function staffEmail(name: string) {
  const [first, ...rest] = name.trim().split(/\s+/);
  const initial = rest.length ? rest[rest.length - 1][0] : "";
  const stem = `${first}${initial}`.toLowerCase().replace(/[^a-z]/g, "");
  return `${stem}@${process.env.FQ_ASSESSOR_DOMAIN ?? "footballqueensland.com.au"}`;
}

/**
 * The address the B Diploma extractor would have given this coach.
 *
 * `extract-b-diploma-2026.py` rewrites every address in a register to
 * `first.last@example.com`, because that file is committed. A coach who sat
 * one of those registers and is on a support sheet is therefore already here
 * under an address that cannot receive mail, and matching on address alone
 * would give them a second account and split their record in two.
 *
 * Deterministic rather than fuzzy: the placeholder is derived by a rule, so
 * this reverses the rule. It is still only a name match, which is why finding
 * one reports a possible duplicate rather than merging the two: giving an
 * account somebody else's address because they share a name hands a stranger
 * a sign-in link to a coach's assessment history. Merging is `--link`, after
 * a person has looked at the names it names.
 */
function placeholderEmail(firstName: string, lastName: string) {
  const stem = `${firstName} ${lastName}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.|\.$/g, "");
  return `${stem}@example.com`;
}

function title(cohort: Cohort) {
  return `${cohort.qualification} — ${cohort.label}`;
}

export async function importSupport(
  prisma: PrismaClient,
  { dry = false, link = false } = {},
) {
  const file = dataFile();
  if (!existsSync(file)) {
    // Name what is actually in the directory. On a host with no shell there is
    // no other way to tell a secret file that was never added from one added
    // under a different name, and the first deploy that failed here cost a
    // round trip to find out which.
    let neighbours = "";
    try {
      const found = readdirSync(path.dirname(file));
      neighbours = found.length
        ? `\n${path.dirname(file)} holds: ${found.join(", ")}`
        : `\n${path.dirname(file)} is empty.`;
    } catch {
      neighbours = `\n${path.dirname(file)} does not exist.`;
    }
    throw new Error(
      `No support register at ${file}.${neighbours}\n` +
        "The name has to match exactly: on Render the secret file is mounted at " +
        "/etc/secrets/ plus the filename it was given.\n" +
        "Extract one with scripts/extract-post-course-support.py, or point " +
        "SUPPORT_DATA_FILE at it.",
    );
  }
  const data: Data = JSON.parse(readFileSync(file, "utf8"));

  const counts = {
    cohorts: 0,
    cohortsCreated: 0,
    cases: 0,
    created: 0,
    reopened: 0,
    coaches: 0,
    newAccounts: 0,
    linked: 0,
    enrolments: 0,
    activities: 0,
    extensions: 0,
    availability: 0,
  };
  /** Everything a person should look at afterwards, printed at the end. */
  const flagged: string[] = [];
  for (const row of data.cases) {
    for (const issue of row.issues) {
      flagged.push(`${row.firstName} ${row.lastName} (${row.cohort}): ${issue}`);
    }
  }

  // ---- Cohorts ------------------------------------------------------------
  //
  // Nearly all of these are intakes whose attendance register was never
  // loaded — 2023, 2024, and the 2025 cohorts that pre-date the 2026 ones in
  // prisma/data. A case cannot exist without a course, so the cohort is
  // created from what the support sheet knows about it: a name, a year, and
  // the date the intake's support is due. It carries no days and no roster,
  // and says so, so nobody mistakes it for a register that has been imported.
  const courseIds = new Map<string, string>();
  for (const cohort of data.cohorts) {
    const existing = await prisma.course.findFirst({ where: { title: title(cohort) } });
    if (!existing) counts.cohortsCreated += 1;
    counts.cohorts += 1;

    if (dry) {
      console.log(
        `  ${existing ? "update" : "create"} ${title(cohort)} · support due ` +
          `${cohort.deadline ?? "no date"}`,
      );
      continue;
    }

    const record = {
      title: title(cohort),
      season: cohort.season,
      qualification: cohort.qualification,
      published: true,
      // 2.5 on every AFC/FA diploma, and what put these coaches here.
      ratingThreshold: 2.5,
      supportDeadline: day(cohort.deadline),
      description:
        `${cohort.qualification} intake "${cohort.label}", known to this system only from ` +
        "Football Queensland's post-course support register. No attendance register has " +
        "been imported for it, so it has no days and its roster is the coaches who were " +
        "referred for support.",
    };
    const saved = existing
      ? await prisma.course.update({
          where: { id: existing.id },
          // A cohort whose register has since been imported keeps it: only the
          // support deadline is this register's to say.
          data: { supportDeadline: record.supportDeadline },
        })
      : await prisma.course.create({ data: record });
    courseIds.set(cohort.key, saved.id);
  }

  // ---- Cases --------------------------------------------------------------
  for (const row of data.cases) {
    const name = `${row.firstName} ${row.lastName}`.replace(/\s+/g, " ").trim();
    const courseId = courseIds.get(row.cohort);
    if (!dry && !courseId) {
      flagged.push(`${row.firstName} ${row.lastName}: no cohort ${row.cohort} — case skipped`);
      continue;
    }

    let user = await prisma.user.findUnique({ where: { email: row.email } });
    let linked = false;
    if (!user) {
      const placeholder = await prisma.user.findUnique({
        where: { email: placeholderEmail(row.firstName, row.lastName) },
      });
      // Probably the same human, under the address the register extractor
      // invented for them. Only probably: it is a name match. With --link
      // they become one account under the real address, which is what lets
      // the coach sign in and keeps their record whole; without it they stay
      // two, and the duplicate is reported for somebody to settle.
      if (placeholder && placeholder.role === "COACH") {
        if (link) {
          user = placeholder;
          linked = true;
        } else {
          flagged.push(
            `${name}: ${placeholder.email} is a register account with the same name — ` +
              "a second account was created; re-run with --link to merge them",
          );
        }
      }
    }
    if (linked) counts.linked += 1;
    if (!user) counts.newAccounts += 1;
    counts.coaches += 1;

    if (dry) {
      console.log(
        `  ${user ? (linked ? "link " : "have ") : "new  "} ${name} · ${row.cohort} · ` +
          `${row.status}${row.deadline ? ` · due ${row.deadline}` : ""}`,
      );
      if (linked) {
        flagged.push(
          `${name}: would merge into the register account ${user!.email}, which takes the ` +
            `address ${row.email}`,
        );
      }
      counts.cases += 1;
      continue;
    }

    user = user
      ? await prisma.user.update({
          where: { id: user.id },
          // Never a role change, in either direction: an import has no business
          // deciding that an admin is a coach. The address moves only off the
          // extractor's placeholder.
          data: { name: user.name ?? name, ...(linked ? { email: row.email } : {}) },
        })
      : await prisma.user.create({ data: { email: row.email, name, role: "COACH" } });
    if (linked) {
      flagged.push(`${name}: register account took the real address ${row.email}`);
    }

    // The educator running it. A name that resolves to one person becomes the
    // account; two people or somebody outside FQ is kept as text, which is
    // what `educatorName` is for.
    let educatorId: string | null = null;
    if (row.educatorAccount) {
      const educator = await prisma.user.upsert({
        where: { email: staffEmail(row.educatorAccount) },
        create: {
          email: staffEmail(row.educatorAccount),
          name: row.educatorAccount,
          role: "EDUCATOR",
          title: "Coach Education",
        },
        update: {},
      });
      educatorId = educator.id;
    }

    // An enrolment, where the register never put one there. Without it the
    // coach has a case on a course they are not on: their own course list
    // skips it, and the cohort's roster is empty.
    const enrolment = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: user.id, courseId: courseId! } },
    });
    if (!enrolment) {
      await prisma.enrollment.create({
        data: {
          userId: user.id,
          courseId: courseId!,
          position: row.position,
          clubName: row.club,
          externalRef: row.faNumber,
          rating: row.fqRating,
          // What the register says of everybody on these sheets, whatever has
          // happened since: this is the list of who needed more support.
          outcome: "POST_COURSE_SUPPORT",
        },
      });
      counts.enrolments += 1;
    }

    // ---- The case ---------------------------------------------------------
    const existing = await prisma.supportCase.findUnique({
      where: { courseId_userId: { courseId: courseId!, userId: user.id } },
    });

    // A case somebody closed here and the register still shows as open is a
    // decision taken in this system after the spreadsheet was last touched.
    // Reopening it would undo their work, so it is reported instead.
    const wouldReopen =
      existing && existing.status !== "IN_PROGRESS" && row.status === "IN_PROGRESS";
    if (wouldReopen) {
      flagged.push(
        `${name} (${row.cohort}): closed here as ${existing!.status}, open on the register — ` +
          "left as it is",
      );
    }

    const fields = {
      status: wouldReopen ? existing!.status : row.status,
      reason: row.reason,
      referredRating: row.fqRating,
      educatorId,
      educatorName: row.educatorName,
      // Only where it differs from the cohort's, so correcting an intake's
      // date still reaches everybody who has not been given one of their own.
      deadline: null as Date | null,
      plan: row.plan,
      closingNote: row.closingNote,
      closedAt: day(row.closedAt),
      // The register does not record when a case was opened, so the earliest
      // thing that happened on it stands in. Where nothing on it is dated, the
      // import's own timestamp stays: a case page saying it opened today is at
      // least true of this system, and a date picked to look plausible is not.
      ...(row.activities.length > 0
        ? { openedAt: day(row.activities[0].occurredAt)! }
        : {}),
      ...(row.availability
        ? {
            availabilityNote: row.availability.note,
            availabilityAt: day(row.availability.answeredAt),
          }
        : {}),
    };
    const cohort = data.cohorts.find((c) => c.key === row.cohort);
    if (row.deadline && row.deadline !== cohort?.deadline) fields.deadline = day(row.deadline);
    if (row.availability) counts.availability += 1;

    const saved = existing
      ? await prisma.supportCase.update({ where: { id: existing.id }, data: fields })
      : await prisma.supportCase.create({
          data: { courseId: courseId!, userId: user.id, ...fields },
        });
    counts.cases += 1;
    if (!existing) counts.created += 1;

    // ---- The log ----------------------------------------------------------
    //
    // Keyed on the day and the text, because the register has no identifier
    // for an entry and the text is what distinguishes one. An educator's own
    // entries are never touched: this only ever adds the ones the register
    // has and this case doesn't.
    const already = await prisma.supportActivity.findMany({
      where: { caseId: saved.id },
      select: { occurredAt: true, detail: true },
    });
    const seen = new Set(
      already.map((a) => `${a.occurredAt.toISOString().slice(0, 10)}|${a.detail ?? ""}`),
    );
    for (const activity of row.activities) {
      if (seen.has(`${activity.occurredAt}|${activity.detail}`)) continue;
      await prisma.supportActivity.create({
        data: {
          caseId: saved.id,
          kind: activity.kind as never,
          occurredAt: day(activity.occurredAt)!,
          detail: activity.detail,
        },
      });
      counts.activities += 1;
    }

    if (row.extension) {
      const open = await prisma.supportExtension.findFirst({
        where: { caseId: saved.id, requestedUntil: day(row.extension.requestedUntil)! },
      });
      if (!open) {
        await prisma.supportExtension.create({
          data: {
            caseId: saved.id,
            status: row.extension.status as never,
            requestedUntil: day(row.extension.requestedUntil)!,
            grantedUntil: day(row.extension.grantedUntil),
            reason: row.extension.reason,
            decidedBy: row.extension.decidedBy,
            decidedAt: row.extension.grantedUntil ? day(row.extension.requestedUntil) : null,
          },
        });
        counts.extensions += 1;
      }
    }
  }

  console.log(dry ? "\nDry run — nothing was written.\n" : "\nImported.\n");
  console.log(`  Cohorts         ${counts.cohorts} (${counts.cohortsCreated} new)`);
  console.log(`  Cases           ${counts.cases} (${counts.created} new)`);
  console.log(
    `  Coaches         ${counts.coaches} (${counts.newAccounts} new accounts, ` +
      `${counts.linked} merged into a register account)`,
  );
  if (!dry) {
    console.log(`  Enrolments      ${counts.enrolments}`);
    console.log(`  Log entries     ${counts.activities}`);
    console.log(`  Extensions      ${counts.extensions}`);
    console.log(`  Form responses  ${counts.availability}`);
  }

  if (flagged.length > 0) {
    console.log(`\n  ${flagged.length} thing${flagged.length === 1 ? "" : "s"} to check:\n`);
    for (const line of flagged) console.log(`    ${line}`);
  }
  console.log(
    "\nNo attempts were recorded: the register keeps outcomes, not marks against the\n" +
      "rubric, and a rated delivery nobody rated is worse than none. See /admin/support.\n",
  );
  return counts;
}

// Only when run directly; the boot-time path owns its own client.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dry = process.argv.includes("--dry-run");
  const link = process.argv.includes("--link");
  if (!dry && !process.argv.includes("--yes")) {
    console.log(
      "Refusing to write without --yes.\n\n" +
        "  npm run support:import -- --dry-run   what would change\n" +
        "  npm run support:import -- --yes       do it\n" +
        "  npm run support:import -- --yes --link\n" +
        "        merge a coach onto the account an imported register already gave them,\n" +
        "        where the two share a name. Check the names a dry run lists first.\n",
    );
  } else {
    const prisma = new PrismaClient({ adapter: createAdapter() });
    importSupport(prisma, { dry, link })
      .catch((error) => {
        console.error(error);
        process.exit(1);
      })
      .finally(() => prisma.$disconnect());
  }
}
