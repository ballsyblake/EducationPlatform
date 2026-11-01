"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * The delivery days a register is kept against.
 *
 * Until now these only ever arrived with an imported FQ register, which was
 * fine while every cohort came off a spreadsheet and wrong the moment one could
 * be created from a Learning Centre export: the register page told whoever got
 * there to "add them to a course you created here", and there was nowhere to.
 *
 * Hours are the reason to be careful. A day is worth its scheduled length and a
 * day with no times is worth zero — never a guessed eight hours — so the times
 * are a person's to type, and a day saved without them says so on the page
 * rather than quietly counting for nothing.
 */
export type DayActionState = { status: "idle" | "ok" | "error"; message?: string };

/** "08:30", and nothing else. Wall clock, as the register writes it. */
function parseTime(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return { value: null as string | null };
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return { error: `"${raw}" isn't a time. Use 24-hour, like 08:30.` };
  const [, h, m] = match;
  if (Number(h) > 23 || Number(m) > 59) return { error: `"${raw}" isn't a time of day.` };
  return { value: `${h.padStart(2, "0")}:${m}` };
}

function parseDay(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return { error: "Give the day a date." };
  const date = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return { error: `"${raw}" isn't a date.` };
  return { value: date };
}

/** The weekday the register would write beside the date. */
function weekdayOf(date: Date) {
  return date.toLocaleDateString("en-AU", { weekday: "short", timeZone: "UTC" });
}

function checkTimes(start: { value?: string | null; error?: string }, end: { value?: string | null; error?: string }) {
  if (start.error) return start.error;
  if (end.error) return end.error;
  if (start.value && end.value && end.value <= start.value) {
    return "The day has to finish after it starts.";
  }
  // One time without the other is worth nothing to the hours, so it is a
  // mistake rather than a half-filled day.
  if (Boolean(start.value) !== Boolean(end.value)) {
    return "Give both times, or neither.";
  }
  return null;
}

/**
 * Number the days by date, earliest first.
 *
 * Day 1 means the first day of the course to everybody who reads a register, so
 * the number follows the dates rather than the order somebody typed them in.
 * Nothing is attached to the number — attendance, make-ups and staff marks all
 * hang off the day's id — so renumbering moves a heading and nothing else.
 *
 * Two passes, because `(courseId, dayNo)` is unique and swapping two days would
 * otherwise collide halfway through. The first pass parks every day on a
 * negative number, which no real day holds.
 */
async function renumber(courseId: string) {
  const days = await prisma.courseDay.findMany({
    where: { courseId },
    orderBy: [{ date: "asc" }, { dayNo: "asc" }],
    select: { id: true },
  });

  await prisma.$transaction([
    ...days.map((day, at) =>
      prisma.courseDay.update({ where: { id: day.id }, data: { dayNo: -(at + 1) } }),
    ),
    ...days.map((day, at) =>
      prisma.courseDay.update({ where: { id: day.id }, data: { dayNo: at + 1 } }),
    ),
  ]);
}

function touch(courseId: string) {
  revalidatePath(`/admin/courses/${courseId}`);
  revalidatePath(`/admin/courses/${courseId}/days`);
  revalidatePath(`/admin/courses/${courseId}/register`);
  revalidatePath(`/courses/${courseId}`);
  revalidatePath("/admin/cohorts");
}

export async function addCourseDay(
  _prev: DayActionState,
  formData: FormData,
): Promise<DayActionState> {
  await requireAdmin();
  const courseId = String(formData.get("courseId") ?? "");
  if (!courseId) return { status: "error", message: "No course." };

  const date = parseDay(formData.get("date"));
  if (date.error) return { status: "error", message: date.error };

  const start = parseTime(formData.get("startTime"));
  const end = parseTime(formData.get("endTime"));
  const wrong = checkTimes(start, end);
  if (wrong) return { status: "error", message: wrong };

  const clash = await prisma.courseDay.findFirst({
    where: { courseId, date: date.value },
    select: { dayNo: true },
  });
  if (clash) {
    return {
      status: "error",
      message: `Day ${clash.dayNo} is already on that date. Edit it instead, or pick another date.`,
    };
  }

  const last = await prisma.courseDay.aggregate({ where: { courseId }, _max: { dayNo: true } });
  await prisma.courseDay.create({
    data: {
      courseId,
      dayNo: (last._max.dayNo ?? 0) + 1,
      date: date.value!,
      weekday: weekdayOf(date.value!),
      startTime: start.value ?? null,
      endTime: end.value ?? null,
    },
  });

  await renumber(courseId);
  touch(courseId);

  return {
    status: "ok",
    message: start.value
      ? "Day added."
      : "Day added with no times, so it counts for no hours until you give it some.",
  };
}

export async function updateCourseDay(
  _prev: DayActionState,
  formData: FormData,
): Promise<DayActionState> {
  await requireAdmin();
  const id = String(formData.get("dayId") ?? "");
  const day = await prisma.courseDay.findUnique({ where: { id }, select: { courseId: true } });
  if (!day) return { status: "error", message: "That day is gone." };

  const date = parseDay(formData.get("date"));
  if (date.error) return { status: "error", message: date.error };

  const start = parseTime(formData.get("startTime"));
  const end = parseTime(formData.get("endTime"));
  const wrong = checkTimes(start, end);
  if (wrong) return { status: "error", message: wrong };

  const clash = await prisma.courseDay.findFirst({
    where: { courseId: day.courseId, date: date.value, NOT: { id } },
    select: { dayNo: true },
  });
  if (clash) {
    return { status: "error", message: `Day ${clash.dayNo} is already on that date.` };
  }

  await prisma.courseDay.update({
    where: { id },
    data: {
      date: date.value!,
      weekday: weekdayOf(date.value!),
      startTime: start.value ?? null,
      endTime: end.value ?? null,
    },
  });

  await renumber(day.courseId);
  touch(day.courseId);

  return { status: "ok", message: "Day saved." };
}

/**
 * Take a day off the register.
 *
 * Refused once anything has been recorded against it. Attendance cascades with
 * the day, so deleting one that has been marked would take hours off coaches'
 * records silently — and a day that ran and is being removed is a correction
 * somebody should make deliberately, by clearing the marks first.
 */
export async function deleteCourseDay(
  _prev: DayActionState,
  formData: FormData,
): Promise<DayActionState> {
  await requireAdmin();
  const id = String(formData.get("dayId") ?? "");
  const day = await prisma.courseDay.findUnique({
    where: { id },
    select: {
      courseId: true,
      dayNo: true,
      _count: { select: { attendance: true, staffAttendance: true, makeUps: true } },
    },
  });
  if (!day) return { status: "error", message: "That day is gone." };

  const marked = day._count.attendance + day._count.staffAttendance;
  if (marked > 0) {
    return {
      status: "error",
      message: `Day ${day.dayNo} has attendance marked against it. Clear the register for that day first.`,
    };
  }
  if (day._count.makeUps > 0) {
    return {
      status: "error",
      message: `Day ${day.dayNo} has make-ups owed against it. Settle those first.`,
    };
  }

  await prisma.courseDay.delete({ where: { id } });
  await renumber(day.courseId);
  touch(day.courseId);

  return { status: "ok", message: "Day removed." };
}
