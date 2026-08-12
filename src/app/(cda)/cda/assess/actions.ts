"use server";

import { revalidatePath } from "next/cache";
import { assessorCanScore, requireAssessor } from "@/lib/cda/access";
import { starsFromEvidence } from "@/lib/cda/rubric";
import { prisma } from "@/lib/db";

export type AssessFormState = { status: "idle" | "ok" | "error"; message?: string };

/**
 * Resolves one club within one of this assessor's line-item assignments.
 *
 * Both halves are checked every time: the assignment must be theirs, and the
 * club must be in that assignment's pool. Without the second check an assessor
 * holding D6 for Pool A could post a score against a Pool B club by editing a
 * hidden field, and the pool boundary is the only thing separating them.
 */
async function scorable(assignmentId: string, assessmentId: string) {
  const assessor = await requireAssessor();

  const assignment = await prisma.criterionAssignment.findUnique({
    where: { id: assignmentId },
    include: { criterion: { include: { subCriteria: true } } },
  });
  if (!assignment || assignment.assessorId !== assessor.id) {
    throw new Error("That line item isn't assigned to you.");
  }
  if (assignment.submittedAt) {
    throw new Error("You've submitted this line item. Ask the CDU to reopen it.");
  }

  const assessment = await prisma.clubAssessment.findUnique({
    where: { id: assessmentId },
    select: { id: true, status: true, poolId: true, club: { select: { name: true } } },
  });
  if (!assessment || assessment.poolId !== assignment.poolId) {
    throw new Error("That club isn't in your pool for this line item.");
  }
  if (!assessorCanScore(assessment.status)) {
    throw new Error(`${assessment.club.name} is no longer open for scoring.`);
  }

  return { assessor, assignment, assessment };
}

/**
 * Records this assessor's judgement of one line item for one club.
 *
 * The score is derived from the ticked evidence and never read from the form —
 * the whole point of the evidence points is that the band follows from what was
 * observed, and trusting a posted number would let the rubric be bypassed.
 */
export async function saveScore(
  _prev: AssessFormState,
  formData: FormData,
): Promise<AssessFormState> {
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const assessmentId = String(formData.get("assessmentId") ?? "");

  let ctx: Awaited<ReturnType<typeof scorable>>;
  try {
    ctx = await scorable(assignmentId, assessmentId);
  } catch (error) {
    return { status: "error", message: (error as Error).message };
  }

  const { criterion } = ctx.assignment;
  const ticked = new Set(formData.getAll("met").map(String));
  // Intersected with this criterion's own evidence points, so an id borrowed
  // from another criterion can't inflate the count.
  const metIds = criterion.subCriteria.filter((sc) => ticked.has(sc.id)).map((sc) => sc.id);

  const stars = starsFromEvidence(metIds.length, criterion);
  const comment = String(formData.get("comment") ?? "").trim() || null;

  await prisma.$transaction(async (tx) => {
    const score = await tx.assessorScore.upsert({
      where: {
        assessmentId_assessorId_criterionId: {
          assessmentId,
          assessorId: ctx.assessor.id,
          criterionId: criterion.id,
        },
      },
      update: { stars, comment },
      create: { assessmentId, assessorId: ctx.assessor.id, criterionId: criterion.id, stars, comment },
    });

    // The form posts the complete set of ticks, so stored evidence is replaced
    // rather than diffed.
    await tx.scoreEvidence.deleteMany({ where: { scoreId: score.id } });
    if (metIds.length) {
      await tx.scoreEvidence.createMany({
        data: metIds.map((subCriterionId) => ({ scoreId: score.id, subCriterionId })),
      });
    }
  });

  if (ctx.assessment.status === "SUBMITTED") {
    await prisma.clubAssessment.update({
      where: { id: assessmentId },
      data: { status: "IN_ASSESSMENT" },
    });
  }

  revalidatePath(`/cda/assess/${assignmentId}`);
  return { status: "ok", message: "Saved." };
}

/**
 * Declares one line item finished across the whole pool.
 *
 * Refused while any club in the pool is unscored. A half-finished line item
 * submitted anyway is indistinguishable, on the CDU's comparison, from one
 * where several clubs genuinely scored zero.
 */
export async function submitAssignment(
  _prev: AssessFormState,
  formData: FormData,
): Promise<AssessFormState> {
  const assessor = await requireAssessor();
  const assignmentId = String(formData.get("assignmentId") ?? "");

  const assignment = await prisma.criterionAssignment.findUnique({
    where: { id: assignmentId },
    include: { criterion: { select: { code: true, title: true } } },
  });
  if (!assignment || assignment.assessorId !== assessor.id) {
    return { status: "error", message: "That line item isn't assigned to you." };
  }
  if (assignment.submittedAt) {
    return { status: "error", message: "Already submitted." };
  }

  // Only clubs actually open for scoring count towards completion. A club that
  // hasn't submitted its own data can't be scored at all, and requiring it would
  // leave the assessor permanently unable to finish a line item because of
  // somebody else's paperwork.
  const clubs = await prisma.clubAssessment.findMany({
    where: { poolId: assignment.poolId, status: { in: ["SUBMITTED", "IN_ASSESSMENT"] } },
    select: { id: true },
  });
  const scored = await prisma.assessorScore.count({
    where: {
      assessorId: assessor.id,
      criterionId: assignment.criterionId,
      assessmentId: { in: clubs.map((c) => c.id) },
    },
  });

  if (scored < clubs.length) {
    const missing = clubs.length - scored;
    return {
      status: "error",
      message: `${missing} club${missing === 1 ? "" : "s"} in this pool still unscored for ${assignment.criterion.code}.`,
    };
  }

  await prisma.criterionAssignment.update({
    where: { id: assignmentId },
    data: { submittedAt: new Date() },
  });

  await advancePool(assignment.poolId);

  revalidatePath("/cda/assess", "layout");
  return { status: "ok", message: `${assignment.criterion.code} submitted.` };
}

/**
 * Moves a pool's clubs into reconciliation once every line item is in.
 *
 * A club is ready when the whole pool's assessment is, not when one assessor
 * finishes — under vertical assessment no single person ever holds a complete
 * club, so nobody is in a position to declare one finished.
 */
async function advancePool(poolId: string) {
  const outstanding = await prisma.criterionAssignment.count({
    where: { poolId, submittedAt: null },
  });
  if (outstanding > 0) return;

  await prisma.clubAssessment.updateMany({
    where: { poolId, status: { in: ["SUBMITTED", "IN_ASSESSMENT"] } },
    data: { status: "RECONCILING" },
  });
}
