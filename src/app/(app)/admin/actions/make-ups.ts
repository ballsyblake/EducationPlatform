"use server";

import { revalidatePath } from "next/cache";
import { dayMinutes, formatHours } from "@/lib/attendance";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { MakeUpStatus } from "@prisma-client";

export type MakeUpState = { status: "idle" | "ok" | "error"; message?: string };

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

/**
 * Hours off a form, in hours, as minutes.
 *
 * Educators write "1.5", not "90". Everything below this line is minutes, and
 * this is the only place the two units meet.
 */
function minutesFromHours(raw: string): number | null {
  if (!raw) return null;
  const hours = Number(raw);
  if (!Number.isFinite(hours) || hours < 0) return null;
  const minutes = Math.round(hours * 60);
  return minutes;
}

/** Paths that show a coach's hours. Cheap to revalidate, easy to forget. */
function revalidateFor(courseId: string | null) {
  revalidatePath("/admin/make-ups");
  revalidatePath("/attendance");
  if (courseId) {
    revalidatePath(`/admin/courses/${courseId}/register`);
    revalidatePath(`/courses/${courseId}`);
  }
}

/**
 * Opens a debt: this coach owes these hours.
 *
 * Raising a debt is deliberate rather than automatic. A register full of blanks
 * on a course still running is normal, and turning every one of them into an
 * obligation would bury the handful that an educator has actually decided need
 * making up. The register shows the gap; a person decides it is a debt.
 */
export async function openMakeUp(
  _prev: MakeUpState,
  formData: FormData,
): Promise<MakeUpState> {
  const admin = await requireAdmin();

  const enrollmentId = text(formData, "enrollmentId");
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    select: {
      id: true,
      courseId: true,
      user: { select: { name: true, email: true } },
      course: { select: { days: { select: { id: true, dayNo: true, startTime: true, endTime: true } } } },
    },
  });
  if (!enrollment) return { status: "error", message: "Enrolment not found." };

  const rawDayId = text(formData, "courseDayId");
  const day = rawDayId ? enrollment.course.days.find((d) => d.id === rawDayId) : undefined;
  if (rawDayId && !day) {
    return { status: "error", message: "That day isn't on this coach's course." };
  }

  // Hours can come from the form or from the day itself. Off the register the
  // shortfall is already known, and retyping it is a chance to get it wrong.
  const typed = minutesFromHours(text(formData, "hours"));
  const minutesOwed = typed ?? (day ? dayMinutes(day) : 0);
  if (!minutesOwed || minutesOwed <= 0) {
    return { status: "error", message: "Say how many hours are owed." };
  }
  if (minutesOwed > 60 * 24) {
    return { status: "error", message: "That's more than a day — check the hours." };
  }

  await prisma.attendanceMakeUp.create({
    data: {
      enrollmentId,
      courseDayId: day?.id ?? null,
      minutesOwed,
      arrangedNote: text(formData, "note") || null,
      status: text(formData, "note") ? "ARRANGED" : "OWED",
      openedById: admin.id,
    },
  });

  revalidateFor(enrollment.courseId);
  const who = enrollment.user.name ?? enrollment.user.email;
  return { status: "ok", message: `${formatHours(minutesOwed)} owed by ${who}.` };
}

const STATUSES: MakeUpStatus[] = ["OWED", "ARRANGED", "COMPLETED", "WAIVED"];

/**
 * Moves a debt along: arranged, made up, or written off.
 *
 * Completing one credits the hours in full — a debt made up in part stays open
 * with the hours credited so far, which is what "3 of 8 hours" on the desk
 * means. Waiving credits nothing on purpose: the hours were not sat, an
 * educator decided they didn't need to be, and the record should say so rather
 * than pretend the coach was there.
 */
export async function settleMakeUp(
  _prev: MakeUpState,
  formData: FormData,
): Promise<MakeUpState> {
  await requireAdmin();

  const id = text(formData, "id");
  const makeUp = await prisma.attendanceMakeUp.findUnique({
    where: { id },
    select: {
      id: true,
      minutesOwed: true,
      minutesCredited: true,
      enrollment: { select: { courseId: true } },
    },
  });
  if (!makeUp) return { status: "error", message: "That make-up no longer exists." };

  const status = text(formData, "status") as MakeUpStatus;
  if (!STATUSES.includes(status)) {
    return { status: "error", message: "Pick a status from the list." };
  }

  const typed = minutesFromHours(text(formData, "creditHours"));
  if (text(formData, "creditHours") && typed === null) {
    return { status: "error", message: "Credited hours must be a number." };
  }
  if (typed !== null && typed > makeUp.minutesOwed) {
    return {
      status: "error",
      message: `Only ${formatHours(makeUp.minutesOwed)} are owed; ${formatHours(typed)} is more than the debt.`,
    };
  }

  const minutesCredited =
    status === "COMPLETED"
      ? makeUp.minutesOwed
      : status === "WAIVED"
        ? 0
        : (typed ?? makeUp.minutesCredited);

  await prisma.attendanceMakeUp.update({
    where: { id },
    data: {
      status,
      minutesCredited,
      arrangedNote: text(formData, "note") || null,
      creditedNote: text(formData, "creditedNote") || null,
      settledAt: status === "COMPLETED" || status === "WAIVED" ? new Date() : null,
    },
  });

  revalidateFor(makeUp.enrollment.courseId);
  return { status: "ok", message: "Make-up updated." };
}

/** Removes a debt raised by mistake. Settled ones stay as the record. */
export async function deleteMakeUp(
  _prev: MakeUpState,
  formData: FormData,
): Promise<MakeUpState> {
  await requireAdmin();
  const id = text(formData, "id");
  const makeUp = await prisma.attendanceMakeUp.findUnique({
    where: { id },
    select: { status: true, enrollment: { select: { courseId: true } } },
  });
  if (!makeUp) return { status: "error", message: "That make-up no longer exists." };
  if (makeUp.status === "COMPLETED") {
    return {
      status: "error",
      message: "A completed make-up is the record that it was made up. Reopen it first.",
    };
  }

  await prisma.attendanceMakeUp.delete({ where: { id } });
  revalidateFor(makeUp.enrollment.courseId);
  return { status: "ok", message: "Make-up removed." };
}
