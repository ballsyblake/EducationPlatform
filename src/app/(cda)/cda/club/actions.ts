"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clubCanEdit, currentClub, requireClubUser } from "@/lib/cda/access";
import { activeCycle, ensureAssessment } from "@/lib/cda/assessment";
import { METRIC_SPECS } from "@/lib/cda/rubric";
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
