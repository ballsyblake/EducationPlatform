"use server";

import { revalidatePath } from "next/cache";
import { assertCourseStaff } from "@/lib/access";
import { dayMinutes, makeUpAmount, standardDayMinutes } from "@/lib/attendance";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { MakeUpStatus } from "@prisma-client";

export type MakeUpState = { status: "idle" | "ok" | "error"; message?: string };

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

/**
 * An amount off a form, in days or in hours, as minutes.
 *
 * Educators write "2" days or "1.5" hours, never "90". Everything below this
 * line is minutes, and this is the only place the units meet.
 *
 * The length of a day is worked out here from the course rather than taken
 * from the form. A posted conversion factor is a posted number of hours with
 * an extra step, and this one decides how long a coach has to sit.
 */
function minutesFromAmount(raw: string, unit: string, dayLength: number): number | null {
  if (!raw) return null;
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0) return null;
  // Days need a day length to mean anything. Without one the form only offers
  // hours, so this is a crafted post rather than a mistake.
  if (unit === "days") return dayLength > 0 ? Math.round(amount * dayLength) : null;
  return Math.round(amount * 60);
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
  const admin = await requireStaff();

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
  await assertCourseStaff(admin, enrollment.courseId);

  const rawDayId = text(formData, "courseDayId");
  const day = rawDayId ? enrollment.course.days.find((d) => d.id === rawDayId) : undefined;
  if (rawDayId && !day) {
    return { status: "error", message: "That day isn't on this coach's course." };
  }

  const dayLength = standardDayMinutes(enrollment.course.days);

  // The amount can come from the form or from the day itself. Off the register
  // the shortfall is already known, and retyping it is a chance to get it wrong.
  const unit = text(formData, "unit");
  const typed = minutesFromAmount(text(formData, "amount"), unit, dayLength);
  if (text(formData, "amount") && typed === null) {
    return {
      status: "error",
      message:
        unit === "days"
          ? "This course doesn't record how long its days run, so a make-up on it has to be set in hours."
          : "How much is owed has to be a number.",
    };
  }
  const minutesOwed = typed ?? (day ? dayMinutes(day) : 0);
  if (!minutesOwed || minutesOwed <= 0) {
    return { status: "error", message: "Say how much there is to make up." };
  }
  // A fortnight of days is a transfer, not a make-up. The old ceiling was one
  // day, which a three-day catch-up on another course would have failed.
  if (minutesOwed > 14 * (dayLength || 60 * 24)) {
    return { status: "error", message: "That's more time than a course runs — check the number." };
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
  const owed = makeUpAmount(minutesOwed, dayLength);
  return {
    status: "ok",
    message: `${who} has ${owed.label}${owed.note ? ` (${owed.note})` : ""} to make up.`,
  };
}

const STATUSES: MakeUpStatus[] = ["OWED", "ARRANGED", "COMPLETED", "WAIVED"];

/**
 * Moves a debt along: arranged, made up, or written off.
 *
 * Completing one credits the time in full — a debt made up in part stays open
 * with what has been sat so far, which is what "1 day still to sit" on the desk
 * means. Waiving credits nothing on purpose: the time was not sat, an educator
 * decided it didn't need to be, and the record should say so rather than
 * pretend the coach was there.
 */
export async function settleMakeUp(
  _prev: MakeUpState,
  formData: FormData,
): Promise<MakeUpState> {
  const actor = await requireStaff();

  const id = text(formData, "id");
  const makeUp = await prisma.attendanceMakeUp.findUnique({
    where: { id },
    select: {
      id: true,
      minutesOwed: true,
      minutesCredited: true,
      enrollment: {
        select: {
          courseId: true,
          course: { select: { days: { select: { startTime: true, endTime: true } } } },
        },
      },
    },
  });
  if (!makeUp) return { status: "error", message: "That make-up no longer exists." };
  await assertCourseStaff(actor, makeUp.enrollment.courseId);

  const status = text(formData, "status") as MakeUpStatus;
  if (!STATUSES.includes(status)) {
    return { status: "error", message: "Pick a status from the list." };
  }

  const dayLength = standardDayMinutes(makeUp.enrollment.course.days);
  const raw = text(formData, "creditAmount");
  const typed = minutesFromAmount(raw, text(formData, "creditUnit"), dayLength);
  if (raw && typed === null) {
    return { status: "error", message: "What has been sat has to be a number." };
  }
  if (typed !== null && typed > makeUp.minutesOwed) {
    const owed = makeUpAmount(makeUp.minutesOwed, dayLength);
    return {
      status: "error",
      message: `Only ${owed.label} ${owed.label === "1 day" ? "is" : "are"} owed — that is more than the debt.`,
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
  const actor = await requireStaff();
  const id = text(formData, "id");
  const makeUp = await prisma.attendanceMakeUp.findUnique({
    where: { id },
    select: { status: true, enrollment: { select: { courseId: true } } },
  });
  if (!makeUp) return { status: "error", message: "That make-up no longer exists." };
  await assertCourseStaff(actor, makeUp.enrollment.courseId);
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
