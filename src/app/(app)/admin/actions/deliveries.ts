"use server";

import { revalidatePath } from "next/cache";
import { assertCourseStaff } from "@/lib/access";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { displayName } from "@/lib/format";
import { RATING_SCALE } from "@/lib/support-rubric";

export type DeliveryState = { status: "idle" | "ok" | "error"; message?: string };

const MARKS = new Set<number>(RATING_SCALE);

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

/**
 * The write-up as the register keeps it.
 *
 * Every delivery imported from an FQ register is one spreadsheet cell in this
 * shape, and the app writes the same shape back: an educator who exports a
 * course, or opens the row in the register it came from, should not be able to
 * tell which of them was typed here.
 *
 * The parsed columns are what the app reads — `raw` is the form as a whole, and
 * exists so nothing an assessor wrote can be lost to a field the schema
 * doesn't have.
 */
function composeRaw(fields: {
  assessor: string | null;
  block: string | null;
  component: string | null;
  topic: string | null;
  comment: string | null;
  actionPlan: string | null;
  rating: number | null;
}) {
  const lines: string[] = [];
  if (fields.assessor) lines.push(`Assessor: ${fields.assessor}`);
  if (fields.block) lines.push(`When: ${fields.block}`);
  if (fields.component) lines.push(`Component: ${fields.component}`);
  if (fields.topic) lines.push(`Topic: ${fields.topic}`);
  if (fields.comment) lines.push("", "Comment:", fields.comment);
  if (fields.actionPlan) lines.push("", "Action plan: ", fields.actionPlan);
  if (fields.rating !== null) lines.push("", `Session Rating: ${fields.rating}`);
  return lines.join("\n");
}

/** The action plan, as the numbered list the register writes. */
function composeActionPlan(steps: string[]) {
  const kept = steps.map((s) => s.trim()).filter(Boolean);
  return kept.length ? kept.map((step, i) => `${i + 1}. ${step}`).join("\n") : null;
}

/**
 * Writes up one practical delivery — the coach in front of a group, watched.
 *
 * The assessor is a name rather than an account because a register names people
 * before they have one, and the course team is written on the register whether
 * or not anybody signed in. Where the name is one this course knows — the
 * person saving, or a seat on the course team — the account is recorded beside
 * it, which is what makes "deliveries I assessed" answerable later.
 *
 * A rating is optional on purpose. Better than half the deliveries on the 2026
 * registers carry feedback and no session mark: the coach's course rating is a
 * judgement across everything they delivered, and an assessor who isn't ready
 * to put a number on one session should still be able to write up what they
 * saw rather than inventing one to get past a form.
 */
export async function saveDelivery(
  _prev: DeliveryState,
  formData: FormData,
): Promise<DeliveryState> {
  const actor = await requireStaff();

  const enrollmentId = text(formData, "enrollmentId");
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    select: { id: true, courseId: true },
  });
  if (!enrollment) return { status: "error", message: "That coach isn't on this course." };
  await assertCourseStaff(actor, enrollment.courseId);

  const comment = text(formData, "comment");
  if (!comment) {
    return { status: "error", message: "Write what you saw before saving — the comment is the feedback." };
  }

  const rawRating = text(formData, "rating");
  let rating: number | null = null;
  if (rawRating) {
    const parsed = Number(rawRating);
    if (!MARKS.has(parsed)) {
      return { status: "error", message: "Ratings run from 1 to 5 in half steps." };
    }
    rating = parsed;
  }

  const assessor = text(formData, "assessor") || displayName(actor);
  // The account behind the name, where this course knows one. The person
  // saving is the usual answer; a write-up done for a colleague resolves
  // against the course team, and a name from neither is kept as text.
  let assessorId: string | null = null;
  if (assessor.toLowerCase() === displayName(actor).toLowerCase()) {
    assessorId = actor.id;
  } else {
    const seat = await prisma.courseStaff.findFirst({
      where: { courseId: enrollment.courseId, name: assessor },
      select: { userId: true },
    });
    assessorId = seat?.userId ?? null;
  }

  const written = {
    assessor,
    block: text(formData, "block") || null,
    component: text(formData, "component") || null,
    topic: text(formData, "topic") || null,
    comment,
    actionPlan: composeActionPlan(formData.getAll("action").map(String)),
    rating,
  };
  const fields = { ...written, assessorId, raw: composeRaw(written) };

  const deliveryId = text(formData, "deliveryId");
  if (deliveryId) {
    // Checked against this enrolment rather than trusted: a delivery id off a
    // form must not be able to rewrite somebody else's write-up.
    const existing = await prisma.practicalDelivery.findUnique({
      where: { id: deliveryId },
      select: { id: true, enrollmentId: true },
    });
    if (!existing || existing.enrollmentId !== enrollment.id) {
      return { status: "error", message: "That delivery isn't on this coach's record." };
    }
    await prisma.practicalDelivery.update({ where: { id: deliveryId }, data: fields });
  } else {
    const last = await prisma.practicalDelivery.findFirst({
      where: { enrollmentId: enrollment.id },
      orderBy: { deliveryNo: "desc" },
      select: { deliveryNo: true },
    });
    await prisma.practicalDelivery.create({
      data: { enrollmentId: enrollment.id, deliveryNo: (last?.deliveryNo ?? 0) + 1, ...fields },
    });
  }

  revalidateFor(enrollment.courseId);
  return { status: "ok", message: deliveryId ? "Feedback updated." : "Feedback saved." };
}

/** Removes a write-up. The delivery happened; this says nobody assessed it. */
export async function deleteDelivery(
  _prev: DeliveryState,
  formData: FormData,
): Promise<DeliveryState> {
  const actor = await requireStaff();

  const delivery = await prisma.practicalDelivery.findUnique({
    where: { id: text(formData, "deliveryId") },
    select: { id: true, enrollment: { select: { courseId: true } } },
  });
  if (!delivery) return { status: "error", message: "That delivery is already gone." };
  await assertCourseStaff(actor, delivery.enrollment.courseId);

  await prisma.practicalDelivery.delete({ where: { id: delivery.id } });

  revalidateFor(delivery.enrollment.courseId);
  return { status: "ok", message: "Feedback removed." };
}

/**
 * The register's own Comments column: what the course makes of the coach, in
 * one place, separate from any one session they delivered.
 */
export async function saveCoachComment(
  _prev: DeliveryState,
  formData: FormData,
): Promise<DeliveryState> {
  const actor = await requireStaff();

  const enrollment = await prisma.enrollment.findUnique({
    where: { id: text(formData, "enrollmentId") },
    select: { id: true, courseId: true },
  });
  if (!enrollment) return { status: "error", message: "That coach isn't on this course." };
  await assertCourseStaff(actor, enrollment.courseId);

  await prisma.enrollment.update({
    where: { id: enrollment.id },
    data: { registerComments: text(formData, "comments") || null },
  });

  revalidateFor(enrollment.courseId);
  return { status: "ok", message: "Comment saved." };
}

/**
 * Everywhere a write-up shows up: the assessor's page, the register it feeds,
 * the coach's own course page, and the staff lists that count deliveries.
 */
function revalidateFor(courseId: string) {
  revalidatePath(`/admin/courses/${courseId}/assess`);
  revalidatePath(`/admin/courses/${courseId}/register`);
  revalidatePath(`/courses/${courseId}`);
  revalidatePath("/admin/coaches");
  revalidatePath("/grades");
}
