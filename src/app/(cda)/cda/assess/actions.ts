"use server";

import { revalidatePath } from "next/cache";
import { assessorCanScore, requireAssessmentAccess, requireAssessor } from "@/lib/cda/access";
import { starsFromEvidence } from "@/lib/cda/rubric";
import { prisma } from "@/lib/db";

export type AssessFormState = { status: "idle" | "ok" | "error"; message?: string };

/**
 * Loads a criterion on an assessment this assessor is allowed to score right
 * now — assigned to them, and still open.
 */
async function scorable(assessmentId: string, criterionId: string) {
  const assessor = await requireAssessor();
  const assessment = await requireAssessmentAccess(assessor, assessmentId);

  if (!assessorCanScore(assessment.status)) {
    throw new Error(
      "This assessment is closed to scoring — the Club Development Unit has moved it into review.",
    );
  }

  const criterion = await prisma.criterion.findUnique({
    where: { id: criterionId },
    include: { subCriteria: { orderBy: { position: "asc" } } },
  });
  if (!criterion) throw new Error("That criterion no longer exists.");

  return { assessor, assessment, criterion };
}

/**
 * Records one assessor's judgement on one criterion.
 *
 * The star rating is derived here from the ticked evidence and never accepted
 * from the form. The whole point of the sub-criteria is that the band follows
 * from what was actually observed; trusting a posted star count would let the
 * rubric be bypassed by anyone willing to edit a hidden input.
 */
export async function saveScore(
  _prev: AssessFormState,
  formData: FormData,
): Promise<AssessFormState> {
  const assessmentId = String(formData.get("assessmentId") ?? "");
  const criterionId = String(formData.get("criterionId") ?? "");

  let ctx: Awaited<ReturnType<typeof scorable>>;
  try {
    ctx = await scorable(assessmentId, criterionId);
  } catch (error) {
    return { status: "error", message: (error as Error).message };
  }

  const ticked = new Set(formData.getAll("met").map(String));
  // Intersected with the criterion's own sub-criteria, so an id from a
  // different criterion can't be smuggled in to inflate the count.
  const metIds = ctx.criterion.subCriteria.filter((sc) => ticked.has(sc.id)).map((sc) => sc.id);

  const stars = starsFromEvidence(metIds.length, ctx.criterion);
  const comment = String(formData.get("comment") ?? "").trim() || null;

  await prisma.$transaction(async (tx) => {
    const score = await tx.assessorScore.upsert({
      where: {
        assessmentId_assessorId_criterionId: {
          assessmentId,
          assessorId: ctx.assessor.id,
          criterionId,
        },
      },
      update: { stars, comment },
      create: { assessmentId, assessorId: ctx.assessor.id, criterionId, stars, comment },
    });

    // Replace rather than diff: the form posts the complete set of ticks every
    // time, so the stored evidence is whatever was just submitted.
    await tx.scoreEvidence.deleteMany({ where: { scoreId: score.id } });
    if (metIds.length) {
      await tx.scoreEvidence.createMany({
        data: metIds.map((subCriterionId) => ({ scoreId: score.id, subCriterionId })),
      });
    }
  });

  // The first score on a club moves it out of the queue and into assessment.
  if (ctx.assessment.status === "SUBMITTED") {
    await prisma.clubAssessment.update({
      where: { id: assessmentId },
      data: { status: "IN_ASSESSMENT" },
    });
  }

  revalidatePath(`/cda/assess/${assessmentId}`);
  return { status: "ok", message: "Saved." };
}

/**
 * Declares this assessor's scoring complete.
 *
 * Blocked while any criterion is unscored. An assessor who submits with gaps
 * looks to the CDU like an assessor who scored everything at zero, and the
 * reconciliation screen has no way to tell the two apart.
 */
export async function submitScoring(
  _prev: AssessFormState,
  formData: FormData,
): Promise<AssessFormState> {
  const assessmentId = String(formData.get("assessmentId") ?? "");

  const assessor = await requireAssessor();
  const assessment = await requireAssessmentAccess(assessor, assessmentId);

  if (!assessorCanScore(assessment.status)) {
    return { status: "error", message: "This assessment is already closed to scoring." };
  }

  const total = await prisma.criterion.count({
    where: { active: true, domain: { in: ["PLANNING", "DELIVERY", "OUTCOMES"] } },
  });
  const scored = await prisma.assessorScore.count({
    where: { assessmentId, assessorId: assessor.id },
  });

  if (scored < total) {
    return {
      status: "error",
      message: `${total - scored} criteria still unscored. Score every criterion before submitting.`,
    };
  }

  await prisma.assessorAssignment.update({
    where: { assessmentId_assessorId: { assessmentId, assessorId: assessor.id } },
    data: { submittedAt: new Date() },
  });

  // Once every assigned assessor is in, the club moves to the CDU automatically
  // — nobody has to notice and push it along.
  const outstanding = await prisma.assessorAssignment.count({
    where: { assessmentId, submittedAt: null },
  });
  if (outstanding === 0) {
    await prisma.clubAssessment.update({
      where: { id: assessmentId },
      data: { status: "RECONCILING" },
    });
  }

  revalidatePath("/cda/assess", "layout");
  return { status: "ok", message: "Submitted to the Club Development Unit." };
}
