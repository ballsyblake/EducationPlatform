"use server";

import { revalidatePath } from "next/cache";
import { assertCourseStaff } from "@/lib/access";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  AREA_CODES,
  DELIVERY_AREAS,
  MAX_DELIVERY_POINTS,
  outcomeFor,
  parseAreaScore,
  thresholdsFor,
  totalPoints,
} from "@/lib/delivery-rubric";
import { displayName } from "@/lib/format";
import { RATING_SCALE } from "@/lib/support-rubric";

export type DeliveryState = { status: "idle" | "ok" | "error"; message?: string };

const MARKS = new Set<number>(RATING_SCALE);

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

/**
 * A date off a form, as the day it names.
 *
 * Built at UTC midday rather than midnight: a date stored at the start of a UTC
 * day reads back as the day before anywhere east of Greenwich, and Queensland
 * is ten hours east. Midday survives the round trip either way.
 */
function day(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12),
  );
  return Number.isNaN(date.getTime()) ? null : date;
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
  session: string | null;
  component: string | null;
  topic: string | null;
  deliveredOn: Date | null;
  comment: string | null;
  actionPlan: string | null;
  rating: number | null;
  scores: Map<string, number>;
  points: { points: number; complete: boolean };
  outcome: string | null;
}) {
  const lines: string[] = [];
  if (fields.assessor) lines.push(`Assessor: ${fields.assessor}`);
  if (fields.block) lines.push(`When: ${fields.block}`);
  if (fields.session) lines.push(`Session: ${fields.session}`);
  if (fields.component) lines.push(`Component: ${fields.component}`);
  if (fields.topic) lines.push(`Topic: ${fields.topic}`);
  if (fields.deliveredOn) {
    lines.push(`Date: ${fields.deliveredOn.toISOString().slice(0, 10)}`);
  }
  if (fields.scores.size > 0) {
    lines.push("", "Rubric:");
    for (const area of DELIVERY_AREAS) {
      const score = fields.scores.get(area.code);
      if (score !== undefined) lines.push(`${area.title}: ${score}`);
    }
    lines.push(
      `Total: ${fields.points.points} / ${MAX_DELIVERY_POINTS}${
        fields.points.complete ? "" : " (incomplete)"
      }`,
    );
    if (fields.outcome) lines.push(`Outcome: ${fields.outcome}`);
  }
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
 * A rating is optional on purpose, and so is the rubric. Better than half the
 * deliveries on the 2026 registers carry feedback and no session mark: the
 * coach's course rating is a judgement across everything they delivered, and an
 * assessor who isn't ready to put a number on one session should still be able
 * to write up what they saw rather than inventing one to get past a form. The
 * same goes for a scoresheet half filled in on the drive home — six areas at
 * once or nothing would mean a session's notes waiting on a laptop.
 */
export async function saveDelivery(
  _prev: DeliveryState,
  formData: FormData,
): Promise<DeliveryState> {
  const actor = await requireStaff();

  const enrollmentId = text(formData, "enrollmentId");
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    select: {
      id: true,
      courseId: true,
      course: { select: { title: true, qualification: true } },
    },
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

  const rawDate = text(formData, "deliveredOn");
  const deliveredOn = rawDate ? day(rawDate) : null;
  if (rawDate && deliveredOn === null) {
    return { status: "error", message: "That isn't a date — give the day the session was delivered." };
  }

  // The rubric, as far as it was filled in. A form that doesn't carry the
  // scoresheet at all — the short write-up form on the course page — posts no
  // score fields, and `scores` stays empty rather than clearing what the
  // assessment page wrote. Clearing a scoresheet is done on the scoresheet.
  const postedScores = AREA_CODES.some((code) => formData.has(`score-${code}`));
  const scores = new Map<string, number>();
  if (postedScores) {
    for (const code of AREA_CODES) {
      if (!formData.has(`score-${code}`)) continue;
      const raw = text(formData, `score-${code}`);
      const score = parseAreaScore(raw);
      if (raw !== "" && score === null) {
        return { status: "error", message: "Each area scores 0, 1, 2 or 3 on Football Australia's rubric." };
      }
      if (score !== null) scores.set(code, score);
    }
  }
  const points = totalPoints(scores);
  const thresholds = thresholdsFor(enrollment.course);
  const outcome = points.complete ? outcomeFor(points.points, thresholds).label : null;

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
    session: text(formData, "session") || null,
    component: text(formData, "component") || null,
    topic: text(formData, "topic") || null,
    deliveredOn,
    comment,
    actionPlan: composeActionPlan(formData.getAll("action").map(String)),
    rating,
  };
  const fields = {
    ...written,
    assessorId,
    raw: composeRaw({ ...written, scores, points, outcome }),
  };

  const deliveryId = text(formData, "deliveryId");
  let savedId: string;
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
    savedId = deliveryId;
  } else {
    const last = await prisma.practicalDelivery.findFirst({
      where: { enrollmentId: enrollment.id },
      orderBy: { deliveryNo: "desc" },
      select: { deliveryNo: true },
    });
    const created = await prisma.practicalDelivery.create({
      data: { enrollmentId: enrollment.id, deliveryNo: (last?.deliveryNo ?? 0) + 1, ...fields },
      select: { id: true },
    });
    savedId = created.id;
  }

  if (postedScores) {
    // Delete then write, rather than upsert per area: an area cleared back to
    // "not scored yet" has to lose its row, and six upserts would leave the old
    // score sitting there answering a question the assessor withdrew.
    await prisma.deliveryScore.deleteMany({ where: { deliveryId: savedId } });
    if (scores.size > 0) {
      await prisma.deliveryScore.createMany({
        data: [...scores].map(([code, score]) => ({ deliveryId: savedId, code, score })),
      });
    }
  }

  revalidateFor(enrollment.courseId, enrollment.id);
  return { status: "ok", message: deliveryId ? "Assessment updated." : "Assessment saved." };
}

/** Removes a write-up. The delivery happened; this says nobody assessed it. */
export async function deleteDelivery(
  _prev: DeliveryState,
  formData: FormData,
): Promise<DeliveryState> {
  const actor = await requireStaff();

  const delivery = await prisma.practicalDelivery.findUnique({
    where: { id: text(formData, "deliveryId") },
    select: { id: true, enrollmentId: true, enrollment: { select: { courseId: true } } },
  });
  if (!delivery) return { status: "error", message: "That delivery is already gone." };
  await assertCourseStaff(actor, delivery.enrollment.courseId);

  await prisma.practicalDelivery.delete({ where: { id: delivery.id } });

  revalidateFor(delivery.enrollment.courseId, delivery.enrollmentId);
  return { status: "ok", message: "Feedback removed." };
}

/**
 * Everywhere a write-up shows up: the assessment page, the assessor's course
 * page, the register it feeds, the coach's own course page, and the lists that
 * count deliveries — including the grading queue and the educator's dashboard,
 * which are the two places that say a delivery is still owed.
 */
function revalidateFor(courseId: string, enrollmentId: string) {
  revalidatePath(`/educator/grading/${enrollmentId}`);
  revalidatePath("/educator/grading");
  revalidatePath("/dashboard");
  revalidatePath(`/admin/courses/${courseId}/assess`);
  revalidatePath(`/admin/courses/${courseId}/register`);
  revalidatePath(`/courses/${courseId}`);
  revalidatePath("/admin/coaches");
  revalidatePath("/grades");
}
