import "server-only";

import { prisma } from "@/lib/db";

export type TaskState = "not_started" | "in_progress" | "submitted" | "graded";

export type TaskItem = {
  kind: "assignment" | "quiz";
  id: string;
  title: string;
  courseId: string;
  courseTitle: string;
  dueAt: Date | null;
  points: number;
  state: TaskState;
  score: number | null;
  maxScore: number | null;
  hasFeedback: boolean;
  href: string;
};

/** Everything a coach has been assigned, flattened into one to-do list. */
/**
 * Every task for a set of coaches, in a fixed number of queries.
 *
 * The progress page used to call the single-coach version once per coach. Each
 * of those was a nested read — enrolments, then courses, then assignments, then
 * that coach's submissions, then quizzes, then question points, then that
 * coach's attempts — which Prisma resolves as roughly seven statements. With
 * eighty-eight coaches on the register that was 624 queries to draw one page,
 * against five to thirty for every other page in the product.
 *
 * It looked survivable in development because SQLite is a function call away.
 * Production talks to Turso over the network, where 624 round trips is the
 * difference between a page and a wait.
 *
 * Six queries now, whatever the roster size. The single-coach version below is
 * a wrapper on this one so the dashboard and the progress page can never
 * disagree about what somebody still owes.
 */
export async function getTasksForCoaches(
  userIds: string[],
  /** Restrict to these courses; null or undefined means every course. */
  courseIds: string[] | null = null,
): Promise<Map<string, TaskItem[]>> {
  const byUser = new Map<string, TaskItem[]>();
  if (userIds.length === 0) return byUser;
  if (courseIds && courseIds.length === 0) return byUser;

  const enrollments = await prisma.enrollment.findMany({
    where: {
      userId: { in: userIds },
      course: { published: true },
      ...(courseIds ? { courseId: { in: courseIds } } : {}),
    },
    select: { userId: true, courseId: true, course: { select: { id: true, title: true } } },
  });
  if (enrollments.length === 0) return byUser;

  const courses = [...new Set(enrollments.map((e) => e.courseId))];

  const [assignments, quizzes] = await Promise.all([
    prisma.assignment.findMany({
      where: { published: true, courseId: { in: courses } },
      select: { id: true, courseId: true, title: true, dueAt: true, points: true },
    }),
    prisma.quiz.findMany({
      where: { published: true, courseId: { in: courses } },
      select: {
        id: true,
        courseId: true,
        title: true,
        dueAt: true,
        questions: { select: { points: true } },
      },
    }),
  ]);

  const [submissions, attempts] = await Promise.all([
    assignments.length
      ? prisma.submission.findMany({
          where: { userId: { in: userIds }, assignmentId: { in: assignments.map((a) => a.id) } },
          select: {
            assignmentId: true,
            userId: true,
            status: true,
            score: true,
            feedback: true,
          },
        })
      : [],
    quizzes.length
      ? prisma.quizAttempt.findMany({
          where: { userId: { in: userIds }, quizId: { in: quizzes.map((q) => q.id) } },
          // Newest first, so the first one seen per coach and quiz is the one
          // that counts — the same rule the single-coach read applied.
          orderBy: { attemptNo: "desc" },
          select: {
            quizId: true,
            userId: true,
            status: true,
            score: true,
            maxScore: true,
            feedback: true,
          },
        })
      : [],
  ]);

  const submissionFor = new Map<string, (typeof submissions)[number]>();
  for (const s of submissions) submissionFor.set(`${s.userId}:${s.assignmentId}`, s);

  const latestAttemptFor = new Map<string, (typeof attempts)[number]>();
  for (const a of attempts) {
    const key = `${a.userId}:${a.quizId}`;
    if (!latestAttemptFor.has(key)) latestAttemptFor.set(key, a);
  }

  const assignmentsByCourse = new Map<string, typeof assignments>();
  for (const a of assignments) {
    const list = assignmentsByCourse.get(a.courseId) ?? [];
    list.push(a);
    assignmentsByCourse.set(a.courseId, list);
  }

  const quizzesByCourse = new Map<string, typeof quizzes>();
  for (const q of quizzes) {
    const list = quizzesByCourse.get(q.courseId) ?? [];
    list.push(q);
    quizzesByCourse.set(q.courseId, list);
  }

  for (const { userId, course } of enrollments) {
    const tasks = byUser.get(userId) ?? [];

    for (const assignment of assignmentsByCourse.get(course.id) ?? []) {
      const submission = submissionFor.get(`${userId}:${assignment.id}`);
      // RETURNED is work sent back for revision, so it counts as still open.
      let state: TaskState = "not_started";
      if (submission?.status === "GRADED") state = "graded";
      else if (submission?.status === "SUBMITTED") state = "submitted";
      else if (submission?.status === "DRAFT" || submission?.status === "RETURNED")
        state = "in_progress";

      tasks.push({
        kind: "assignment",
        id: assignment.id,
        title: assignment.title,
        courseId: course.id,
        courseTitle: course.title,
        dueAt: assignment.dueAt,
        points: assignment.points,
        state,
        score: submission?.score ?? null,
        maxScore: state === "graded" ? assignment.points : null,
        hasFeedback: Boolean(submission?.feedback?.trim()),
        href: `/assignments/${assignment.id}`,
      });
    }

    for (const quiz of quizzesByCourse.get(course.id) ?? []) {
      const latest = latestAttemptFor.get(`${userId}:${quiz.id}`);
      const totalPoints = quiz.questions.reduce((sum, q) => sum + q.points, 0);

      let state: TaskState = "not_started";
      if (latest?.status === "GRADED") state = "graded";
      else if (latest?.status === "AWAITING_REVIEW") state = "submitted";
      else if (latest?.status === "IN_PROGRESS") state = "in_progress";

      tasks.push({
        kind: "quiz",
        id: quiz.id,
        title: quiz.title,
        courseId: course.id,
        courseTitle: course.title,
        dueAt: quiz.dueAt,
        points: totalPoints,
        state,
        score: latest?.score ?? null,
        maxScore: latest?.maxScore ?? (state === "graded" ? totalPoints : null),
        hasFeedback: Boolean(latest?.feedback?.trim()),
        href: `/quizzes/${quiz.id}`,
      });
    }

    byUser.set(userId, tasks);
  }

  for (const tasks of byUser.values()) tasks.sort(byDueDate);
  return byUser;
}

export async function getTasksForCoach(userId: string): Promise<TaskItem[]> {
  return (await getTasksForCoaches([userId])).get(userId) ?? [];
}

export function byDueDate(a: { dueAt: Date | null }, b: { dueAt: Date | null }) {
  if (!a.dueAt && !b.dueAt) return 0;
  if (!a.dueAt) return 1;
  if (!b.dueAt) return -1;
  return a.dueAt.getTime() - b.dueAt.getTime();
}

export function summarizeTasks(tasks: TaskItem[], now = new Date()) {
  const outstanding = tasks.filter((t) => t.state === "not_started" || t.state === "in_progress");
  const overdue = outstanding.filter((t) => t.dueAt && t.dueAt < now);
  const graded = tasks.filter((t) => t.state === "graded" && t.maxScore);

  const earned = graded.reduce((sum, t) => sum + (t.score ?? 0), 0);
  const possible = graded.reduce((sum, t) => sum + (t.maxScore ?? 0), 0);

  return {
    total: tasks.length,
    completed: tasks.filter((t) => t.state === "submitted" || t.state === "graded").length,
    outstanding: outstanding.length,
    overdue: overdue.length,
    awaitingFeedback: tasks.filter((t) => t.state === "submitted").length,
    average: possible > 0 ? Math.round((earned / possible) * 100) : null,
    completionPct: tasks.length
      ? Math.round(
          (tasks.filter((t) => t.state === "submitted" || t.state === "graded").length /
            tasks.length) *
            100,
        )
      : 0,
  };
}

export async function getGradingQueueCounts(scope: string[] | null = null) {
  const [submissions, attempts] = await Promise.all([
    prisma.submission.count({
      where: {
        status: "SUBMITTED",
        ...(scope === null ? {} : { assignment: { courseId: { in: scope } } }),
      },
    }),
    prisma.quizAttempt.count({
      where: {
        status: "AWAITING_REVIEW",
        ...(scope === null ? {} : { quiz: { courseId: { in: scope } } }),
      },
    }),
  ]);
  return { submissions, attempts, total: submissions + attempts };
}
