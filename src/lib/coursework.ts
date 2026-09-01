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
export async function getTasksForCoach(userId: string): Promise<TaskItem[]> {
  const enrollments = await prisma.enrollment.findMany({
    where: { userId, course: { published: true } },
    include: {
      course: {
        include: {
          assignments: {
            where: { published: true },
            include: { submissions: { where: { userId } } },
          },
          quizzes: {
            where: { published: true },
            include: {
              questions: { select: { points: true } },
              attempts: { where: { userId }, orderBy: { attemptNo: "desc" } },
            },
          },
        },
      },
    },
  });

  const tasks: TaskItem[] = [];

  for (const { course } of enrollments) {
    for (const assignment of course.assignments) {
      const submission = assignment.submissions[0];
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

    for (const quiz of course.quizzes) {
      const latest = quiz.attempts[0];
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
  }

  return tasks.sort(byDueDate);
}

/** Undated work sorts last; otherwise soonest first. */
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

export type StaffProgressRow = {
  user: { id: string; name: string | null; email: string; title: string | null };
  summary: ReturnType<typeof summarizeTasks>;
  tasks: TaskItem[];
};

/**
 * Per-coach rollup for the admin progress dashboard.
 *
 * `scope` is the courses the viewer may see, or null for every course — an
 * educator is staff on the courses they are rostered onto and nowhere else, and
 * a dashboard that quietly showed them the whole program would make the role
 * decorative.
 */
export async function getStaffProgress(
  courseId?: string,
  scope: string[] | null = null,
): Promise<StaffProgressRow[]> {
  const within = (id: string) => scope === null || scope.includes(id);
  if (courseId && !within(courseId)) return [];

  const coaches = await prisma.user.findMany({
    where: {
      role: "COACH",
      active: true,
      ...(courseId
        ? { enrollments: { some: { courseId } } }
        : scope === null
          ? {}
          : { enrollments: { some: { courseId: { in: scope } } } }),
    },
    orderBy: [{ name: "asc" }, { email: "asc" }],
    select: { id: true, name: true, email: true, title: true },
  });

  const rows = await Promise.all(
    coaches.map(async (user) => {
      const all = await getTasksForCoach(user.id);
      const tasks = all.filter((t) => (courseId ? t.courseId === courseId : within(t.courseId)));
      return { user, tasks, summary: summarizeTasks(tasks) };
    }),
  );

  return rows;
}

/** Counts of work waiting on a human grader, within the viewer's courses. */
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
