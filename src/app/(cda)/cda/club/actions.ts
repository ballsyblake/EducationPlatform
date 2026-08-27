"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  clubCanEdit,
  currentClub,
  ratingVisibleToClub,
  requireClubUser,
} from "@/lib/cda/access";
import { activeCycle, ensureAssessment, syncStructureLevel } from "@/lib/cda/assessment";
import { METRIC_SPECS } from "@/lib/cda/rubric";
import { checkQuota, reviewAllowance, reviewTimeline } from "@/lib/cda/review";
import { STATUS_OPTIONS } from "@/lib/cda/structure";
import { prisma } from "@/lib/db";
import { UploadError, storeUpload } from "@/lib/uploads";

export type ClubFormState = { status: "idle" | "ok" | "error"; message?: string };

/**
 * Resolves the assessment the signed-in club administrator is working on, and
 * refuses to hand it back once it has been submitted.
 *
 * Every write in this file goes through here. Checking "is this mine" and "is
 * it still open" in one place is what stops a stale form tab from editing a
 * club's staff register after assessors have already started scoring it.
 */
async function openAssessment() {
  const user = await requireClubUser();
  const club = await currentClub(user.id);
  if (!club) throw new Error("Your account isn't linked to a club yet.");

  const cycle = await activeCycle();
  if (!cycle) throw new Error("No assessment cycle is open.");

  const assessment = await ensureAssessment(club.id, cycle.id);
  if (!clubCanEdit(assessment.status)) {
    throw new Error("Your submission is closed — contact the Club Development Unit to reopen it.");
  }

  return { user, club, cycle, assessment };
}

/** Nudges NOT_STARTED to IN_PROGRESS the first time a club actually enters data. */
async function markInProgress(assessmentId: string, status: string) {
  if (status === "NOT_STARTED") {
    await prisma.clubAssessment.update({
      where: { id: assessmentId },
      data: { status: "IN_PROGRESS" },
    });
  }
}

function refresh() {
  revalidatePath("/cda/club", "layout");
}

/* -------------------------------------------------------------------------- */
/* Staff register                                                             */
/* -------------------------------------------------------------------------- */

const staffSchema = z.object({
  name: z.string().trim().min(2, "Enter the staff member's name."),
  email: z.string().trim().email("Enter a valid email address.").or(z.literal("")),
  staffRole: z.enum([
    "TECHNICAL_DIRECTOR",
    "HEAD_OF_YOUTH_ACADEMY",
    "SENIOR_HEAD_COACH",
    "YOUTH_HEAD_COACH",
    "JUNIOR_COACH",
    "GOALKEEPING_COACH",
    "FEMALE_PROGRAM_LEAD",
    "PLAYER_DEVELOPMENT_OFFICER",
    "STRENGTH_AND_CONDITIONING",
    "MINIROOS_COORDINATOR",
  ]),
  qualificationId: z.string().trim(),
  yearsExperience: z.coerce.number().int().min(0).max(60),
  employment: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "VOLUNTEER"]),
  gender: z.enum(["FEMALE", "MALE", "OTHER", "UNDISCLOSED"]),
  blueCard: z.coerce.boolean(),
  blueCardExpiry: z.string().trim(),
  notes: z.string().trim().max(2000),
});

export async function saveStaffMember(
  _prev: ClubFormState,
  formData: FormData,
): Promise<ClubFormState> {
  let ctx: Awaited<ReturnType<typeof openAssessment>>;
  try {
    ctx = await openAssessment();
  } catch (error) {
    return { status: "error", message: (error as Error).message };
  }

  const parsed = staffSchema.safeParse({
    name: formData.get("name") ?? "",
    email: formData.get("email") ?? "",
    staffRole: formData.get("staffRole") ?? "",
    qualificationId: formData.get("qualificationId") ?? "",
    yearsExperience: formData.get("yearsExperience") || 0,
    employment: formData.get("employment") ?? "VOLUNTEER",
    gender: formData.get("gender") ?? "UNDISCLOSED",
    blueCard: formData.get("blueCard") === "on",
    blueCardExpiry: formData.get("blueCardExpiry") ?? "",
    notes: formData.get("notes") ?? "",
  });

  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const data = {
    name: parsed.data.name,
    email: parsed.data.email || null,
    staffRole: parsed.data.staffRole,
    qualificationId: parsed.data.qualificationId || null,
    yearsExperience: parsed.data.yearsExperience,
    employment: parsed.data.employment,
    gender: parsed.data.gender,
    blueCard: parsed.data.blueCard,
    blueCardExpiry: parsed.data.blueCardExpiry ? new Date(parsed.data.blueCardExpiry) : null,
    notes: parsed.data.notes || null,
  };

  const staffId = String(formData.get("staffId") ?? "");
  let saved;

  if (staffId) {
    // Scoped to the assessment, so an id belonging to another club's staff
    // register updates nothing rather than being trusted because it was posted.
    const existing = await prisma.staffMember.findFirst({
      where: { id: staffId, assessmentId: ctx.assessment.id },
    });
    if (!existing) return { status: "error", message: "That staff member no longer exists." };
    saved = await prisma.staffMember.update({ where: { id: staffId }, data });
  } else {
    saved = await prisma.staffMember.create({
      data: { ...data, assessmentId: ctx.assessment.id },
    });
  }

  const certificate = formData.get("certificate");
  if (certificate instanceof File && certificate.size > 0) {
    try {
      const upload = await storeUpload(certificate);
      await prisma.upload.update({
        where: { id: upload.id },
        data: { staffMemberId: saved.id },
      });
    } catch (error) {
      const message =
        error instanceof UploadError ? error.message : "The certificate couldn't be stored.";
      // The staff record itself saved; only the attachment failed. Saying so
      // beats rolling the whole thing back and making them retype it.
      return { status: "error", message: `${saved.name} was saved, but ${message}` };
    }
  }

  await markInProgress(ctx.assessment.id, ctx.assessment.status);
  refresh();
  return { status: "ok", message: `${saved.name} saved.` };
}

export async function deleteStaffMember(formData: FormData) {
  const ctx = await openAssessment();
  const staffId = String(formData.get("staffId") ?? "");

  await prisma.staffMember.deleteMany({
    where: { id: staffId, assessmentId: ctx.assessment.id },
  });

  refresh();
}

/* -------------------------------------------------------------------------- */
/* Non-Negotiables                                                            */
/* -------------------------------------------------------------------------- */

export async function declareNonNegotiable(
  _prev: ClubFormState,
  formData: FormData,
): Promise<ClubFormState> {
  let ctx: Awaited<ReturnType<typeof openAssessment>>;
  try {
    ctx = await openAssessment();
  } catch (error) {
    return { status: "error", message: (error as Error).message };
  }

  const resultId = String(formData.get("resultId") ?? "");
  const declared = String(formData.get("declared") ?? "");

  const result = await prisma.nonNegotiableResult.findFirst({
    where: { id: resultId, assessmentId: ctx.assessment.id },
    include: { nonNegotiable: true },
  });
  if (!result) return { status: "error", message: "That check no longer exists." };

  await prisma.nonNegotiableResult.update({
    where: { id: resultId },
    data: {
      clubDeclared: declared === "yes" ? true : declared === "no" ? false : null,
      clubNote: String(formData.get("clubNote") ?? "").trim() || null,
      // A club changing its answer invalidates any verdict already recorded
      // against the old one, so the CDU is asked to look again rather than
      // silently keeping a PASS that was given for a different answer.
      ...(result.verdict !== "PENDING"
        ? { verdict: "PENDING" as const, verifiedAt: null, verifiedById: null }
        : {}),
    },
  });

  const evidence = formData.get("evidence");
  if (evidence instanceof File && evidence.size > 0) {
    try {
      const upload = await storeUpload(evidence);
      await prisma.upload.update({
        where: { id: upload.id },
        data: { nonNegotiableResultId: resultId },
      });
    } catch (error) {
      const message =
        error instanceof UploadError ? error.message : "The evidence couldn't be stored.";
      return { status: "error", message: `Your answer was saved, but ${message}` };
    }
  }

  await markInProgress(ctx.assessment.id, ctx.assessment.status);
  refresh();
  return { status: "ok", message: `${result.nonNegotiable.code} updated.` };
}

/* -------------------------------------------------------------------------- */
/* Participation figures                                                      */
/* -------------------------------------------------------------------------- */

export async function saveMetrics(
  _prev: ClubFormState,
  formData: FormData,
): Promise<ClubFormState> {
  let ctx: Awaited<ReturnType<typeof openAssessment>>;
  try {
    ctx = await openAssessment();
  } catch (error) {
    return { status: "error", message: (error as Error).message };
  }

  for (const spec of METRIC_SPECS) {
    const raw = String(formData.get(spec.key) ?? "").trim();
    const priorRaw = String(formData.get(`${spec.key}__prior`) ?? "").trim();

    const value = raw === "" ? null : Number(raw);
    const priorValue = priorRaw === "" ? null : Number(priorRaw);

    if ((value !== null && !Number.isFinite(value)) || (priorValue !== null && !Number.isFinite(priorValue))) {
      return { status: "error", message: `"${spec.label}" must be a number.` };
    }
    if ((value !== null && value < 0) || (priorValue !== null && priorValue < 0)) {
      return { status: "error", message: `"${spec.label}" can't be negative.` };
    }

    await prisma.clubMetric.upsert({
      where: { assessmentId_key: { assessmentId: ctx.assessment.id, key: spec.key } },
      update: { value, priorValue },
      create: { assessmentId: ctx.assessment.id, key: spec.key, value, priorValue },
    });
  }

  await markInProgress(ctx.assessment.id, ctx.assessment.status);
  refresh();
  return { status: "ok", message: "Participation figures saved." };
}

/* -------------------------------------------------------------------------- */
/* Submission                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Hands the assessment over to the assessors.
 *
 * Blocked while any Non-Negotiable is unanswered. The nine checks are the
 * eligibility gate, and an assessor who starts on a club that hasn't declared
 * them may be scoring a club that can't be awarded anything.
 */
export async function submitAssessment(
  _prev: ClubFormState,
  _formData: FormData,
): Promise<ClubFormState> {
  let ctx: Awaited<ReturnType<typeof openAssessment>>;
  try {
    ctx = await openAssessment();
  } catch (error) {
    return { status: "error", message: (error as Error).message };
  }

  const unanswered = await prisma.nonNegotiableResult.count({
    where: { assessmentId: ctx.assessment.id, clubDeclared: null },
  });
  if (unanswered > 0) {
    return {
      status: "error",
      message: `${unanswered} Non-Negotiable${unanswered === 1 ? " is" : "s are"} still unanswered.`,
    };
  }

  const staffCount = await prisma.staffMember.count({
    where: { assessmentId: ctx.assessment.id },
  });
  if (staffCount === 0) {
    return { status: "error", message: "Add your technical staff before submitting." };
  }

  await prisma.clubAssessment.update({
    where: { id: ctx.assessment.id },
    data: { status: "SUBMITTED", clubSubmittedAt: new Date() },
  });

  refresh();
  return { status: "ok", message: "Submitted to Football Queensland." };
}

/* -------------------------------------------------------------------------- */
/* Review and appeal                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Resolves the club's assessment for the review flow.
 *
 * Deliberately separate from `openAssessment`: that one refuses anything past
 * submission, which is every assessment a review could possibly apply to. The
 * two gates are opposites and merging them would mean weakening the one that
 * protects the submission.
 */
async function releasedAssessment() {
  const user = await requireClubUser();
  const club = await currentClub(user.id);
  if (!club) throw new Error("Your account isn't linked to a club yet.");

  const cycle = await activeCycle();
  if (!cycle) throw new Error("No assessment cycle is open.");

  const assessment = await prisma.clubAssessment.findUnique({
    where: { clubId_cycleId: { clubId: club.id, cycleId: cycle.id } },
    // Tier and pool come along because they set the club's review allowance,
    // and that has to be read from the record rather than from the form.
    include: { review: true, tier: true, pool: true },
  });
  if (!assessment || !ratingVisibleToClub(assessment.status)) {
    throw new Error("Your rating hasn't been released yet.");
  }

  return { user, club, assessment };
}

/**
 * Submits the club's review request.
 *
 * Every constraint FQ publishes is enforced here rather than only in the form:
 * the window, the per-domain quotas, the overall cap, the single-round rule and
 * the requirement that each item carries the club's case. A form that hides the
 * "Submit" button is a courtesy; this is the rule.
 */
export async function submitReviewRequest(
  _prev: ClubFormState,
  formData: FormData,
): Promise<ClubFormState> {
  const { user, assessment } = await releasedAssessment();

  if (assessment.review) {
    return {
      status: "error",
      message: "You've already submitted a review request for this cycle, and only one is allowed.",
    };
  }

  const timeline = reviewTimeline({
    status: assessment.status,
    publishedAt: assessment.publishedAt,
    review: null,
  });
  if (!timeline.canRequestReview) {
    return {
      status: "error",
      message:
        "The review window for this rating has closed. Contact the Club Development Unit if you believe that's wrong.",
    };
  }

  // Comments arrive as comment:<criterionId>, so a criterion with no comment is
  // simply not selected — there is no way to put an item forward without saying
  // why, which is the only ground FQ admits.
  const selections: { criterionId: string; comment: string }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("comment:")) continue;
    const comment = String(value).trim();
    if (comment) selections.push({ criterionId: key.slice("comment:".length), comment });
  }

  const technicalComment = String(formData.get("technicalComment") ?? "").trim();

  if (selections.length === 0 && !technicalComment) {
    return {
      status: "error",
      message:
        "Choose at least one line item and say what evidence you believe was missed. A review can only be requested on that ground.",
    };
  }

  // Read the domains from the database rather than trusting the form: the quota
  // is the whole substance of the rule, and a hand-built POST would otherwise
  // set its own.
  const criteria = await prisma.criterion.findMany({
    where: { id: { in: selections.map((s) => s.criterionId) }, active: true },
    select: { id: true, domain: true },
  });
  if (criteria.length !== selections.length) {
    return { status: "error", message: "One of those line items no longer exists." };
  }

  // The club's own allowance, read from its tier and pool rather than from the
  // form: the quota is the whole substance of the rule, and a Pool B club must
  // not be able to spend a Pool A allowance by posting one.
  const allowance = reviewAllowance({
    tierCode: assessment.tier?.code,
    poolName: assessment.pool?.name,
  });

  const quota = checkQuota(
    { domains: criteria.map((c) => c.domain), technical: Boolean(technicalComment) },
    allowance,
  );
  if (!quota.ok) return { status: "error", message: quota.message };

  await prisma.reviewRequest.create({
    data: {
      assessmentId: assessment.id,
      submittedById: user.id,
      // Frozen now, because the whole point of the report afterwards is to show
      // what the review moved, and the current figures stop being "before" the
      // moment the Unit revises anything.
      percentBefore: assessment.finalPercent,
      shieldBefore: assessment.eligible ? assessment.finalShield : null,
      technicalRequested: Boolean(technicalComment),
      technicalComment: technicalComment || null,
      items: {
        create: selections.map((s) => ({
          criterionId: s.criterionId,
          clubComment: s.comment,
        })),
      },
    },
  });

  await prisma.clubAssessment.update({
    where: { id: assessment.id },
    data: { status: "IN_REVIEW" },
  });

  revalidatePath("/cda/club", "layout");
  return {
    status: "ok",
    message: `Review request submitted for ${quota.total} item${quota.total === 1 ? "" : "s"}.`,
  };
}

/** Takes the review outcome to the CEO. */
export async function submitAppeal(
  _prev: ClubFormState,
  formData: FormData,
): Promise<ClubFormState> {
  const { assessment } = await releasedAssessment();

  if (!assessment.review) {
    return { status: "error", message: "There's no review to appeal." };
  }

  const timeline = reviewTimeline({
    status: assessment.status,
    publishedAt: assessment.publishedAt,
    review: assessment.review,
  });
  if (!timeline.canAppeal) {
    return {
      status: "error",
      message:
        assessment.review.appealedAt !== null
          ? "You've already appealed, and the process allows one appeal."
          : "The appeal window has closed.",
    };
  }

  const appeal = String(formData.get("appeal") ?? "").trim();
  if (appeal.length < 20) {
    return {
      status: "error",
      message: "Set out the grounds for your appeal — the CEO decides on what you write here.",
    };
  }

  await prisma.reviewRequest.update({
    where: { id: assessment.review.id },
    data: { status: "APPEALED", appealedAt: new Date(), appeal },
  });

  await prisma.clubAssessment.update({
    where: { id: assessment.id },
    data: { status: "UNDER_APPEAL" },
  });

  revalidatePath("/cda/club", "layout");
  return { status: "ok", message: "Your appeal has been sent to the CEO of Football Queensland." };
}

/* -------------------------------------------------------------------------- */
/* Club structure (NN7)                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Saves the club's organisational structure.
 *
 * Written as one form rather than a row at a time because the standard is a
 * count across the whole structure — filling one role can move the club a whole
 * shield, and the club should see that happen in response to the change they
 * actually made rather than to whichever row they saved last.
 */
export async function saveStructure(
  _prev: ClubFormState,
  formData: FormData,
): Promise<ClubFormState> {
  const { assessment } = await openAssessment();

  const roles = await prisma.structureRole.findMany({
    where: { active: true },
    select: { id: true, kind: true },
  });

  for (const role of roles) {
    const raw = String(formData.get(`status:${role.id}`) ?? "");
    // Only answers the role's own kind allows. A PRESENCE role has no
    // "B Diploma" answer, and accepting one would put a qualification level on
    // a role the standard never asks about.
    const status = STATUS_OPTIONS[role.kind].includes(raw as never)
      ? (raw as (typeof STATUS_OPTIONS)[typeof role.kind][number])
      : "ABSENT";
    const holderName = String(formData.get(`holder:${role.id}`) ?? "").trim() || null;

    await prisma.structureEntry.upsert({
      where: { assessmentId_roleId: { assessmentId: assessment.id, roleId: role.id } },
      update: { status, holderName },
      create: { assessmentId: assessment.id, roleId: role.id, status, holderName },
    });
  }

  await markInProgress(assessment.id, assessment.status);
  // Keeps NN7's derived level in step with what the club just recorded, so the
  // Unit never opens a check whose computation is a submission out of date.
  await syncStructureLevel(assessment.id);

  revalidatePath("/cda/club", "layout");
  return { status: "ok", message: "Structure saved." };
}
