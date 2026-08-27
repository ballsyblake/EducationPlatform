"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DEFAULT_RATING_THRESHOLD, RATING_SCALE } from "@/lib/support-rubric";
import type { CourseOutcome } from "@prisma-client";

export type RegisterState = { status: "idle" | "ok" | "error"; message?: string };

const MARKS = new Set<number>(RATING_SCALE);
const OUTCOMES: CourseOutcome[] = [
  "IN_PROGRESS",
  "PASSED",
  "POST_COURSE_SUPPORT",
  "WITHDRAWN",
];

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

/**
 * Saves a whole attendance grid in one go.
 *
 * A course is nine days by twenty-five coaches, and a mark per request would be
 * two hundred round trips to record a morning — which is why the register is a
 * spreadsheet in the first place. The form posts the ticked boxes; every cell
 * on the grid is named in `cells` so an unticked box reads as absent rather
 * than as unrecorded, and a day nobody has taken yet is simply not on the form.
 */
export async function saveAttendance(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  await requireAdmin();
  const courseId = text(formData, "courseId");

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, days: { select: { id: true } }, enrollments: { select: { id: true } } },
  });
  if (!course) return { status: "error", message: "Course not found." };

  const dayIds = new Set(course.days.map((d) => d.id));
  const enrollmentIds = new Set(course.enrollments.map((e) => e.id));

  const present = new Set(formData.getAll("present").map(String));
  const cells = formData.getAll("cell").map(String);

  const writes: Promise<unknown>[] = [];
  let changed = 0;

  for (const cell of cells) {
    const [courseDayId, enrollmentId] = cell.split(":");
    // Ids come off the form, so they are checked against this course rather
    // than trusted — a crafted post must not reach another course's register.
    if (!dayIds.has(courseDayId) || !enrollmentIds.has(enrollmentId)) continue;

    const value = present.has(cell);
    changed += 1;
    writes.push(
      prisma.attendance.upsert({
        where: { courseDayId_enrollmentId: { courseDayId, enrollmentId } },
        create: { courseDayId, enrollmentId, present: value },
        update: { present: value },
      }),
    );
  }

  await Promise.all(writes);

  revalidatePath(`/admin/courses/${courseId}/register`);
  revalidatePath(`/courses/${courseId}`);
  return { status: "ok", message: `Attendance saved — ${changed} marks.` };
}

/** The same, for the CET team's own row of the register. */
export async function saveStaffAttendance(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  await requireAdmin();
  const courseId = text(formData, "courseId");

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { days: { select: { id: true } }, staff: { select: { id: true } } },
  });
  if (!course) return { status: "error", message: "Course not found." };

  const dayIds = new Set(course.days.map((d) => d.id));
  const staffIds = new Set(course.staff.map((s) => s.id));

  const present = new Set(formData.getAll("present").map(String));
  const writes: Promise<unknown>[] = [];

  for (const cell of formData.getAll("cell").map(String)) {
    const [courseDayId, staffId] = cell.split(":");
    if (!dayIds.has(courseDayId) || !staffIds.has(staffId)) continue;
    const value = present.has(cell);
    writes.push(
      prisma.staffAttendance.upsert({
        where: { courseDayId_staffId: { courseDayId, staffId } },
        create: { courseDayId, staffId, present: value },
        update: { present: value },
      }),
    );
  }

  await Promise.all(writes);
  revalidatePath(`/admin/courses/${courseId}/register`);
  return { status: "ok", message: "Staff attendance saved." };
}

/**
 * Saves the register's result block — the rating, the outcome and the notes
 * beside them — for every coach on a course at once.
 *
 * The outcome is checked against the rating rather than taken on trust: the
 * rubric says a coach at or above the course's pass mark has passed and one
 * below it goes to post-course support, and an educator recording the opposite
 * is either mistaken or working around the rubric. Withdrawing is always
 * available, because leaving a course is not a judgement about a delivery.
 */
export async function saveResults(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  await requireAdmin();
  const courseId = text(formData, "courseId");

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      ratingThreshold: true,
      enrollments: { select: { id: true, user: { select: { name: true, email: true } } } },
    },
  });
  if (!course) return { status: "error", message: "Course not found." };

  const threshold = course.ratingThreshold ?? DEFAULT_RATING_THRESHOLD;
  const writes: Promise<unknown>[] = [];

  for (const enrollment of course.enrollments) {
    const id = enrollment.id;
    if (formData.get(`rating_${id}`) === null) continue; // not on this form

    const rawRating = text(formData, `rating_${id}`);
    let rating: number | null = null;
    if (rawRating) {
      const parsed = Number(rawRating);
      if (!MARKS.has(parsed)) {
        return { status: "error", message: "Ratings run from 1 to 5 in half steps." };
      }
      rating = parsed;
    }

    const rawOutcome = text(formData, `outcome_${id}`) as CourseOutcome;
    if (!OUTCOMES.includes(rawOutcome)) {
      return { status: "error", message: "Pick an outcome from the list." };
    }

    const who = enrollment.user.name ?? enrollment.user.email;
    if (rawOutcome === "PASSED" && rating !== null && rating < threshold) {
      return {
        status: "error",
        message:
          `${who} is rated ${rating}, and the rubric puts anything below ${threshold} in ` +
          "post-course support. Move the rating or the outcome.",
      };
    }
    if (rawOutcome === "PASSED" && rating === null) {
      return { status: "error", message: `Rate ${who} before recording them as passed.` };
    }
    if (rawOutcome === "POST_COURSE_SUPPORT" && rating !== null && rating >= threshold) {
      return {
        status: "error",
        message:
          `${who} is rated ${rating}, at or above the pass mark, so post-course support isn't ` +
          "the rubric's outcome for them.",
      };
    }

    writes.push(
      prisma.enrollment.update({
        where: { id },
        data: {
          rating,
          outcome: rawOutcome,
          attendanceMet: formData.get(`attended_${id}`) === "on",
          journalComplete: formData.get(`journal_${id}`) === "on",
          readiness: text(formData, `readiness_${id}`) || null,
          registerComments: text(formData, `comments_${id}`) || null,
        },
      }),
    );
  }

  await Promise.all(writes);

  revalidatePath(`/admin/courses/${courseId}/register`);
  revalidatePath("/admin/support");
  revalidatePath("/admin/progress");
  revalidatePath("/grades");
  return { status: "ok", message: "Results saved." };
}
