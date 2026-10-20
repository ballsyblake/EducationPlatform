/**
 * The coursework a diploma carries, as distinct from the coursework a cohort's
 * author happened to write.
 *
 * FQ's diplomas each come with work every coach on them owes: two session plans
 * on a C Diploma, a coaching journal on a B Diploma. It is the same work every
 * intake, so it is described here once and provisioned onto courses from
 * `ensureDiplomaCoursework` below, rather than retyped per
 * cohort. All three imported B Diploma cohorts carried no assignments and no
 * quizzes at all, which meant eighty-odd coaches opened their dashboard to an
 * empty to-do list and nothing anywhere said they owed a journal.
 *
 * The catalogue half is pure and free of database access, like
 * `support-rubric.ts`, so the register's client-side results table can label a
 * column with the same words the coach reads on their own page. The
 * provisioning half takes the client it writes through rather than importing
 * one, which is what lets both the app and `scripts/boot.ts` call it.
 */
import type { Prisma } from "../../generated/prisma/client.ts";

/** The diploma levels that carry standing coursework. */
export type DiplomaLevel = "B" | "C";

export type Requirement = {
  /** Stored in `Assignment.requirement`; never changes once it has shipped. */
  code: string;
  title: string;
  instructions: string;
  /** Short form for a table column, where a title will not fit. */
  short: string;
};

/**
 * What each level owes, in the order a coach should meet it.
 *
 * Points are left at the Assignment default of 100 deliberately: these are
 * handed in and signed off rather than marked out of anything, and the grading
 * queue already treats a submission with no score as work still to do.
 */
export const DIPLOMA_COURSEWORK: Record<DiplomaLevel, Requirement[]> = {
  C: [
    {
      code: "SESSION_PLAN_1",
      title: "Session plan 1",
      short: "Plan 1",
      instructions:
        "Hand in the first of your two session plans: the session, the coaching " +
        "points you are working on, and how you have organised it. Attach the " +
        "plan as a file or write it here.",
    },
    {
      code: "SESSION_PLAN_2",
      title: "Session plan 2",
      short: "Plan 2",
      instructions:
        "Hand in your second session plan. It should show a different topic to " +
        "your first, so the two together cover more than one part of the game.",
    },
  ],
  B: [
    {
      code: "JOURNAL",
      title: "Coaching journal",
      short: "Journal",
      instructions:
        "Hand in your coaching journal: your reflections across the course, " +
        "what you changed in your own practice, and what you are taking back to " +
        "your club. Attach the journal as a file or write it here.",
    },
  ],
};

/** Every requirement code the catalogue knows, for recognising the rows back. */
export const REQUIREMENT_CODES = Object.values(DIPLOMA_COURSEWORK)
  .flat()
  .map((r) => r.code);

const LEVEL_PATTERN =
  /\b([abc])\s*[-/]?\s*(?:diploma|licence|license|certificate)\b/i;

/**
 * Which diploma a course is on, from the words FQ actually writes.
 *
 * `Course.qualification` is free text off the register — "B Diploma", "C
 * Licence", sometimes prefixed "AFC/FA" — and is null on every course created
 * through the authoring form, which has no field for it. So the title is read
 * as a fallback: the importer puts the qualification in there too, and a course
 * somebody typed is far more likely to be called "C Diploma Metro" than to have
 * had the settings page visited.
 *
 * Only B and C carry standing coursework here. An A Diploma, a goalkeeping
 * course or anything the pattern doesn't recognise gets nothing provisioned,
 * which is the honest answer rather than a guess at somebody else's syllabus.
 */
export function diplomaLevelOf(course: {
  qualification?: string | null;
  title?: string | null;
}): DiplomaLevel | null {
  for (const source of [course.qualification, course.title]) {
    const match = source?.match(LEVEL_PATTERN);
    const letter = match?.[1]?.toUpperCase();
    if (letter === "B" || letter === "C") return letter;
  }
  return null;
}

/** The work a course's coaches owe, or an empty list if the diploma carries none. */
export function requirementsFor(course: {
  qualification?: string | null;
  title?: string | null;
}): Requirement[] {
  const level = diplomaLevelOf(course);
  return level ? DIPLOMA_COURSEWORK[level] : [];
}

/** "B Diploma", for a badge on a row that already says which course it is. */
export function levelLabel(level: DiplomaLevel) {
  return `${level} Diploma`;
}

/**
 * Which diploma a requirement row belongs to, read from the row rather than
 * from the course it is on.
 *
 * Those can disagree: a course created as "C Diploma Metro" and later given the
 * qualification "B Diploma" keeps the two session plans it was provisioned
 * with, because nothing here deletes a coach's work on somebody's second
 * thoughts. Labelling those rows from the course would call a session plan a B
 * Diploma requirement, which is the one thing the badge exists to get right.
 */
export function levelOfRequirement(code: string): DiplomaLevel | null {
  for (const [level, items] of Object.entries(DIPLOMA_COURSEWORK)) {
    if (items.some((item) => item.code === code)) return level as DiplomaLevel;
  }
  return null;
}

/* --------------------------- Provisioning --------------------------------- */

/**
 * The two models this writes through, described rather than named.
 *
 * `PrismaClient` itself cannot be the parameter type: the app's client carries
 * a client-level `omit` for `Upload.data` (see `src/lib/db.ts`), which makes it
 * structurally different from the bare client `scripts/boot.ts` builds, and a
 * signature naming one rejects the other. Describing the three calls accepts
 * both, and the arguments are still Prisma's own.
 */
type CourseFacts = { id: string; title: string; qualification: string | null };

type CourseworkClient = {
  course: {
    findMany(args: Prisma.CourseFindManyArgs): Promise<CourseFacts[]>;
  };
  assignment: {
    findMany(
      args: Prisma.AssignmentFindManyArgs,
    ): Promise<{ courseId: string; requirement: string | null }[]>;
    createMany(args: Prisma.AssignmentCreateManyArgs): Promise<{ count: number }>;
  };
};

/**
 * Puts the diploma's own coursework on the courses that owe it.
 *
 * Creates only. An existing requirement row is left exactly as it is, however
 * much an educator has reworded it, and nothing is ever deleted — withdrawing
 * one from a cohort means unpublishing it, which this will not undo.
 *
 * Three queries whatever the size of the register, because it is called from
 * boot and from every enrolment: the courses, the requirement rows those
 * courses already have, and one `createMany` for the gap. Assignments hang off
 * the course rather than the enrolment, so provisioning a course covers the
 * coaches already on it and everybody enrolled afterwards — which is what makes
 * this safe to call on an enrolment rather than needing a per-coach backfill.
 *
 * @param courseIds Restrict to these courses; omit for every course there is.
 */
export async function ensureDiplomaCoursework(
  db: CourseworkClient,
  courseIds?: string[],
): Promise<{ created: number }> {
  if (courseIds && courseIds.length === 0) return { created: 0 };

  const courses = await db.course.findMany({
    ...(courseIds ? { where: { id: { in: courseIds } } } : {}),
    select: { id: true, title: true, qualification: true },
  });

  const wanted = new Map<string, Requirement[]>();
  for (const course of courses) {
    const required = requirementsFor(course);
    if (required.length) wanted.set(course.id, required);
  }
  if (wanted.size === 0) return { created: 0 };

  const existing = await db.assignment.findMany({
    where: { courseId: { in: [...wanted.keys()] }, requirement: { in: REQUIREMENT_CODES } },
    select: { courseId: true, requirement: true },
  });
  const have = new Set(existing.map((a) => `${a.courseId}:${a.requirement}`));

  const missing = [...wanted].flatMap(([courseId, required]) =>
    required
      .filter((r) => !have.has(`${courseId}:${r.code}`))
      .map((r) => ({
        courseId,
        requirement: r.code,
        title: r.title,
        instructions: r.instructions,
      })),
  );
  if (missing.length === 0) return { created: 0 };

  const { count } = await db.assignment.createMany({ data: missing });
  return { created: count };
}
