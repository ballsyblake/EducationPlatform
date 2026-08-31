"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export type TransferState = { status: "idle" | "ok" | "error"; message?: string };

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

/** A date field off a form, read as a plain day rather than an instant. */
function day(raw: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function revalidateFor(...courseIds: (string | null | undefined)[]) {
  revalidatePath("/admin/coaches");
  revalidatePath("/admin/make-ups");
  for (const id of courseIds) {
    if (!id) continue;
    revalidatePath(`/admin/courses/${id}/register`);
    revalidatePath(`/courses/${id}`);
  }
}

/**
 * Sets the window a coach was on a course for.
 *
 * Used on its own for somebody who joined at Block 2 and is picking up Block 1
 * elsewhere — there is no second enrolment to point at, they simply weren't
 * here for the first three days, and without saying so the register holds them
 * twenty-four hours short of a standard nobody was applying.
 */
export async function setEnrolmentWindow(
  _prev: TransferState,
  formData: FormData,
): Promise<TransferState> {
  await requireAdmin();

  const enrollmentId = text(formData, "enrollmentId");
  if (!enrollmentId) return { status: "error", message: "Pick a coach first." };

  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    select: { id: true, courseId: true },
  });
  if (!enrollment) return { status: "error", message: "Enrolment not found." };

  const rawJoined = text(formData, "joinedAt");
  const rawLeft = text(formData, "leftAt");
  const joinedAt = rawJoined ? day(rawJoined) : null;
  const leftAt = rawLeft ? day(rawLeft) : null;
  if ((rawJoined && !joinedAt) || (rawLeft && !leftAt)) {
    return { status: "error", message: "Use a real date for the window." };
  }
  if (joinedAt && leftAt && leftAt < joinedAt) {
    return { status: "error", message: "They can't have left before they joined." };
  }

  await prisma.enrollment.update({
    where: { id: enrollmentId },
    data: { joinedAt, leftAt },
  });

  revalidateFor(enrollment.courseId);
  return {
    status: "ok",
    message: joinedAt || leftAt ? "Window saved." : "Window cleared — on the course throughout.",
  };
}

/**
 * Records a coach moving from one course to another.
 *
 * The move is one operation because its parts are only correct together: the
 * origin closes at the day they left, the destination opens at the day they
 * arrived, the two are linked, and any hours still owed go with the person
 * rather than staying on a register they have left. Doing those by hand, in
 * four places, is how a coach ends up counted twice or not at all.
 *
 * Hours already sat are deliberately not added to the destination's total. A
 * coach who did Block 1 here and started again at another intake has sat those
 * days twice, and quietly adding them would report a qualification as
 * three-quarters done on the strength of the same three days counted twice.
 * The link makes them visible; whether they are worth crediting is a judgement,
 * and the make-up ledger is where a judgement gets written down.
 */
export async function transferEnrolment(
  _prev: TransferState,
  formData: FormData,
): Promise<TransferState> {
  const admin = await requireAdmin();

  const enrollmentId = text(formData, "enrollmentId");
  if (!enrollmentId) return { status: "error", message: "Pick the coach who moved." };

  const origin = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      course: { select: { id: true, title: true } },
    },
  });
  if (!origin) return { status: "error", message: "Enrolment not found." };
  if (origin.transferredToId) {
    return { status: "error", message: "This enrolment has already been transferred." };
  }

  const toCourseId = text(formData, "toCourseId");
  if (!toCourseId) return { status: "error", message: "Pick the course they moved to." };
  if (toCourseId === origin.courseId) {
    return { status: "error", message: "That's the course they're already on." };
  }
  const destination = await prisma.course.findUnique({
    where: { id: toCourseId },
    select: { id: true, title: true, days: { orderBy: { dayNo: "asc" }, take: 1 } },
  });
  if (!destination) return { status: "error", message: "Pick the course they moved to." };

  const leftAt = day(text(formData, "leftAt"));
  if (!leftAt) return { status: "error", message: "Say which day was their last one here." };

  const rawJoined = text(formData, "joinedAt");
  const picked = rawJoined ? day(rawJoined) : null;
  if (rawJoined && !picked) {
    return { status: "error", message: "Use a real date for their first day there." };
  }
  // Starting the new course from its first day is not a window — it is the
  // ordinary case, and recording it would label the coach a part intake on a
  // course they did all of. Only a later start is worth writing down.
  const firstDay = destination.days[0]?.date ?? null;
  const joinedAt = picked && firstDay && picked <= firstDay ? null : picked;

  const note = text(formData, "note") || null;
  const who = origin.user.name ?? origin.user.email;

  const moved = await prisma.$transaction(async (tx) => {
    // The destination enrolment may already exist — a coach often appears on
    // the new register before anybody records the move — so this joins to it
    // rather than insisting on creating one.
    const existing = await tx.enrollment.findUnique({
      where: { userId_courseId: { userId: origin.userId, courseId: destination.id } },
      select: { id: true, joinedAt: true },
    });

    const target = existing
      ? await tx.enrollment.update({
          where: { id: existing.id },
          // An existing window is somebody's earlier decision; don't overwrite it.
          data: { joinedAt: existing.joinedAt ?? joinedAt },
          select: { id: true },
        })
      : await tx.enrollment.create({
          data: {
            userId: origin.userId,
            courseId: destination.id,
            joinedAt,
            clubName: origin.clubName,
            coachingAgeGroup: origin.coachingAgeGroup,
            ageAtCourse: origin.ageAtCourse,
            gender: origin.gender,
            externalRef: origin.externalRef,
            enrolmentStatus: origin.enrolmentStatus,
            registerComments: `Transferred from ${origin.course.title}.`,
          },
          select: { id: true },
        });

    await tx.enrollment.update({
      where: { id: origin.id },
      data: {
        leftAt,
        transferredToId: target.id,
        transferNote: note,
        // TRANSFERRED replaces "still going" — withdrawn would be wrong, they
        // haven't left the pathway. It does not replace a result: a coach who
        // was rated and passed here passed here, and moving them to another
        // intake afterwards is not a reason to erase what an educator decided.
        // The move is recorded by the link either way.
        outcome: origin.outcome === "IN_PROGRESS" ? "TRANSFERRED" : origin.outcome,
      },
    });

    // Open debts follow the coach. A settled one stays where it was settled:
    // it is the record of hours that were actually made up on that course.
    const carried = await tx.attendanceMakeUp.updateMany({
      where: { enrollmentId: origin.id, status: { in: ["OWED", "ARRANGED"] } },
      data: {
        enrollmentId: target.id,
        // The day missed belongs to the course they have left, and pointing a
        // debt at a day on another register is how it becomes unreadable.
        courseDayId: null,
        openedById: admin.id,
      },
    });

    return { targetId: target.id, carried: carried.count, reused: Boolean(existing) };
  });

  revalidateFor(origin.courseId, destination.id);
  return {
    status: "ok",
    message:
      `${who} moved to ${destination.title}` +
      (moved.reused ? " (joined their existing enrolment)" : "") +
      (moved.carried ? `, carrying ${moved.carried} open make-up${moved.carried === 1 ? "" : "s"}` : "") +
      ".",
  };
}

/**
 * Undoes a transfer recorded by mistake.
 *
 * Only the link and the origin's window are undone. The destination enrolment
 * stays, because by the time anybody notices there may be attendance against
 * it, and deleting a register row to fix a clerical error is the wrong trade.
 */
export async function undoTransfer(
  _prev: TransferState,
  formData: FormData,
): Promise<TransferState> {
  await requireAdmin();

  const enrollmentId = text(formData, "enrollmentId");
  const origin = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    select: { id: true, courseId: true, outcome: true, transferredToId: true },
  });
  if (!origin) return { status: "error", message: "Enrolment not found." };
  if (!origin.transferredToId) {
    return { status: "error", message: "That enrolment hasn't been transferred." };
  }

  const target = await prisma.enrollment.findUnique({
    where: { id: origin.transferredToId },
    select: { courseId: true },
  });

  await prisma.enrollment.update({
    where: { id: origin.id },
    data: {
      transferredToId: null,
      transferNote: null,
      leftAt: null,
      // Only the state the transfer itself set is undone. A result recorded
      // before the move was never the transfer's to change.
      outcome: origin.outcome === "TRANSFERRED" ? "IN_PROGRESS" : origin.outcome,
    },
  });

  revalidateFor(origin.courseId, target?.courseId);
  return { status: "ok", message: "Transfer undone. The other enrolment is still there." };
}
