"use server";

import { revalidatePath } from "next/cache";
import QRCode from "qrcode";
import { z } from "zod";
import { createInviteLink, normalizeEmail } from "@/lib/auth";
import { requireCdu } from "@/lib/cda/access";
import { activeCycle, ensureAssessment, freezeResult, loadAssessment } from "@/lib/cda/assessment";
import { MAX_ASSESSORS_PER_CLUB, MAX_STARS } from "@/lib/cda/rubric";
import { prisma } from "@/lib/db";

export type CduFormState = {
  status: "idle" | "ok" | "error";
  message?: string;
  invite?: { url: string; qrSvg: string; email: string; expiresAt: string };
};

async function buildInvite(userId: string, email: string) {
  const { url, expiresAt } = await createInviteLink(userId);
  return {
    url,
    qrSvg: await QRCode.toString(url, { type: "svg", margin: 1, width: 180 }),
    email,
    expiresAt: expiresAt.toISOString(),
  };
}

function refresh() {
  revalidatePath("/cda/cdu", "layout");
}

/* -------------------------------------------------------------------------- */
/* Clubs                                                                      */
/* -------------------------------------------------------------------------- */

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

const clubSchema = z.object({
  name: z.string().trim().min(3, "Enter the club's name."),
  zone: z.string().trim().max(80),
  tier: z.string().trim().max(40),
  contactName: z.string().trim().max(120),
  contactEmail: z.string().trim().email("Enter a valid contact email.").or(z.literal("")),
});

export async function saveClub(_prev: CduFormState, formData: FormData): Promise<CduFormState> {
  await requireCdu();

  const parsed = clubSchema.safeParse({
    name: formData.get("name") ?? "",
    zone: formData.get("zone") ?? "",
    tier: formData.get("tier") ?? "",
    contactName: formData.get("contactName") ?? "",
    contactEmail: formData.get("contactEmail") ?? "",
  });

  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const data = {
    name: parsed.data.name,
    zone: parsed.data.zone || null,
    tier: parsed.data.tier || null,
    contactName: parsed.data.contactName || null,
    contactEmail: parsed.data.contactEmail || null,
  };

  const clubId = String(formData.get("clubId") ?? "");

  if (clubId) {
    await prisma.club.update({ where: { id: clubId }, data });
    refresh();
    return { status: "ok", message: `${data.name} updated.` };
  }

  // The slug is only ever derived here. Two clubs with the same name in
  // different zones is a real thing in Queensland football, so collisions are
  // resolved rather than rejected.
  let slug = slugify(data.name);
  for (let n = 2; await prisma.club.findUnique({ where: { slug } }); n += 1) {
    slug = `${slugify(data.name)}-${n}`;
  }

  const club = await prisma.club.create({ data: { ...data, slug } });

  // Bring the new club into the open cycle straight away, so it appears on the
  // CDU's board and can start entering data without a second step.
  const cycle = await activeCycle();
  if (cycle) await ensureAssessment(club.id, cycle.id);

  refresh();
  return { status: "ok", message: `${club.name} added.` };
}

export async function setClubActive(formData: FormData) {
  await requireCdu();
  const clubId = String(formData.get("clubId") ?? "");
  const active = formData.get("active") === "true";
  await prisma.club.update({ where: { id: clubId }, data: { active } });
  refresh();
}

/* -------------------------------------------------------------------------- */
/* People                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Creates a portal account and returns a sign-in link to hand over.
 *
 * Same model as the coach-education side: no passwords, an admin creates the
 * account, and the link is delivered by hand. For a club administrator the
 * account is linked to the club in the same step — an unlinked CLUB account can
 * see nothing at all, so leaving that to a second action just creates a state
 * where someone has an account that does nothing.
 */
export async function addPortalUser(
  _prev: CduFormState,
  formData: FormData,
): Promise<CduFormState> {
  await requireCdu();

  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const name = String(formData.get("name") ?? "").trim() || null;
  const title = String(formData.get("title") ?? "").trim() || null;
  const role = String(formData.get("role") ?? "") === "ASSESSOR" ? "ASSESSOR" : "CLUB";
  const clubId = String(formData.get("clubId") ?? "");

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { status: "error", message: "Enter a valid email address." };
  }
  if (role === "CLUB" && !clubId) {
    return { status: "error", message: "Choose the club this administrator belongs to." };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { status: "error", message: `${email} already has an account.` };
  }

  const user = await prisma.user.create({
    data: {
      email,
      name,
      title: title ?? (role === "ASSESSOR" ? "FQ Assessor" : "Club Administrator"),
      role,
      ...(role === "CLUB" ? { clubMemberships: { create: { clubId } } } : {}),
    },
  });

  refresh();
  return {
    status: "ok",
    message: `${email} added.`,
    invite: await buildInvite(user.id, email),
  };
}

export async function issueSignInLink(
  _prev: CduFormState,
  formData: FormData,
): Promise<CduFormState> {
  await requireCdu();
  const userId = String(formData.get("userId") ?? "");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.active) {
    return { status: "error", message: "That account is inactive." };
  }
  // Restricted to the two portal roles so this can't be used to mint a link for
  // an ADMIN account from a page that only manages clubs and assessors.
  if (user.role !== "CLUB" && user.role !== "ASSESSOR") {
    return { status: "error", message: "That account isn't a portal account." };
  }

  return {
    status: "ok",
    message: `Sign-in link for ${user.email}.`,
    invite: await buildInvite(user.id, user.email),
  };
}

export async function setUserActive(formData: FormData) {
  await requireCdu();
  const userId = String(formData.get("userId") ?? "");
  const active = formData.get("active") === "true";

  await prisma.user.updateMany({
    where: { id: userId, role: { in: ["CLUB", "ASSESSOR"] } },
    data: { active },
  });

  if (!active) {
    // Deactivation has to take effect now, not whenever their session lapses.
    await prisma.session.deleteMany({ where: { userId } });
  }

  refresh();
}

/* -------------------------------------------------------------------------- */
/* Assessor assignment                                                        */
/* -------------------------------------------------------------------------- */

export async function assignAssessor(
  _prev: CduFormState,
  formData: FormData,
): Promise<CduFormState> {
  await requireCdu();

  const assessmentId = String(formData.get("assessmentId") ?? "");
  const assessorId = String(formData.get("assessorId") ?? "");
  if (!assessorId) return { status: "error", message: "Choose an assessor." };

  const assessment = await prisma.clubAssessment.findUnique({
    where: { id: assessmentId },
    include: { _count: { select: { assessors: true } } },
  });
  if (!assessment) return { status: "error", message: "That assessment no longer exists." };

  if (assessment._count.assessors >= MAX_ASSESSORS_PER_CLUB) {
    return {
      status: "error",
      message: `A club can have at most ${MAX_ASSESSORS_PER_CLUB} assessors.`,
    };
  }

  const assessor = await prisma.user.findFirst({
    where: { id: assessorId, role: "ASSESSOR", active: true },
  });
  if (!assessor) return { status: "error", message: "That assessor isn't available." };

  try {
    await prisma.assessorAssignment.create({ data: { assessmentId, assessorId } });
  } catch {
    // The unique index is the real guard against a double submit.
    return { status: "error", message: "That assessor is already assigned to this club." };
  }

  refresh();
  return { status: "ok", message: `${assessor.name ?? assessor.email} assigned.` };
}

/**
 * Removes an assessor from a club.
 *
 * Their scores go with them. Leaving orphaned scores behind would mean the
 * reconciliation view showing a column headed by someone no longer on the club,
 * and those scores silently counting towards the median.
 */
export async function unassignAssessor(formData: FormData) {
  await requireCdu();

  const assessmentId = String(formData.get("assessmentId") ?? "");
  const assessorId = String(formData.get("assessorId") ?? "");

  await prisma.$transaction([
    prisma.assessorScore.deleteMany({ where: { assessmentId, assessorId } }),
    prisma.assessorAssignment.deleteMany({ where: { assessmentId, assessorId } }),
  ]);

  refresh();
}

/* -------------------------------------------------------------------------- */
/* Non-Negotiable verification                                                */
/* -------------------------------------------------------------------------- */

export async function verifyNonNegotiable(
  _prev: CduFormState,
  formData: FormData,
): Promise<CduFormState> {
  const cdu = await requireCdu();

  const resultId = String(formData.get("resultId") ?? "");
  const verdictRaw = String(formData.get("verdict") ?? "");
  const verdict =
    verdictRaw === "PASS" ? "PASS" : verdictRaw === "FAIL" ? "FAIL" : ("PENDING" as const);

  const result = await prisma.nonNegotiableResult.findUnique({
    where: { id: resultId },
    include: { assessment: true, nonNegotiable: true },
  });
  if (!result) return { status: "error", message: "That check no longer exists." };

  if (result.assessment.lockedAt) {
    return {
      status: "error",
      message: "This assessment is locked. Unlock it before changing a verdict.",
    };
  }

  const adminNote = String(formData.get("adminNote") ?? "").trim() || null;
  if (verdict === "FAIL" && !adminNote) {
    // A failure costs the club its whole shield. It doesn't go on the record
    // without a reason the club can read and act on.
    return { status: "error", message: "A failed check needs a note explaining why." };
  }

  await prisma.nonNegotiableResult.update({
    where: { id: resultId },
    data: {
      verdict,
      adminNote,
      verifiedById: verdict === "PENDING" ? null : cdu.id,
      verifiedAt: verdict === "PENDING" ? null : new Date(),
    },
  });

  revalidatePath(`/cda/cdu/assessments/${result.assessmentId}`, "layout");
  return { status: "ok", message: `${result.nonNegotiable.code} marked ${verdict.toLowerCase()}.` };
}

/* -------------------------------------------------------------------------- */
/* Reconciliation                                                             */
/* -------------------------------------------------------------------------- */

export async function resolveCriterion(
  _prev: CduFormState,
  formData: FormData,
): Promise<CduFormState> {
  const cdu = await requireCdu();

  const assessmentId = String(formData.get("assessmentId") ?? "");
  const criterionId = String(formData.get("criterionId") ?? "");
  const stars = Number(formData.get("stars"));

  if (!Number.isInteger(stars) || stars < 0 || stars > MAX_STARS) {
    return { status: "error", message: `Choose a rating from 0 to ${MAX_STARS}.` };
  }

  const assessment = await prisma.clubAssessment.findUnique({ where: { id: assessmentId } });
  if (!assessment) return { status: "error", message: "That assessment no longer exists." };
  if (assessment.lockedAt) {
    return { status: "error", message: "This assessment is locked. Unlock it to change a score." };
  }

  const rationale = String(formData.get("rationale") ?? "").trim() || null;

  await prisma.finalScore.upsert({
    where: { assessmentId_criterionId: { assessmentId, criterionId } },
    update: { stars, rationale, resolvedById: cdu.id, resolvedAt: new Date() },
    create: { assessmentId, criterionId, stars, rationale, resolvedById: cdu.id },
  });

  revalidatePath(`/cda/cdu/assessments/${assessmentId}`, "layout");
  return { status: "ok", message: "Resolved." };
}

/**
 * Accepts every criterion the assessors already agree on, in one go.
 *
 * This is the whole reason reconciliation is tractable: on a typical club the
 * assessors agree outright on most of the forty criteria, and asking the CDU to
 * click through those one at a time to reach the handful that are genuinely
 * split is how the disagreements get rubber-stamped along with everything else.
 * Anything with a spread is deliberately left alone.
 */
export async function acceptAgreed(
  _prev: CduFormState,
  formData: FormData,
): Promise<CduFormState> {
  const cdu = await requireCdu();
  const assessmentId = String(formData.get("assessmentId") ?? "");

  const overview = await loadAssessment(assessmentId);
  if (overview.assessment.lockedAt) {
    return { status: "error", message: "This assessment is locked." };
  }

  const agreed = overview.agreements.filter((a) => a.level === "AGREED" && a.final === null);

  for (const a of agreed) {
    await prisma.finalScore.create({
      data: {
        assessmentId,
        criterionId: a.criterion.id,
        stars: a.given[0],
        resolvedById: cdu.id,
      },
    });
  }

  revalidatePath(`/cda/cdu/assessments/${assessmentId}`, "layout");
  return {
    status: "ok",
    message: agreed.length
      ? `Accepted ${agreed.length} criteri${agreed.length === 1 ? "on" : "a"} the assessors agreed on.`
      : "Nothing left to accept — every agreed criterion is already resolved.",
  };
}

/* -------------------------------------------------------------------------- */
/* Lock, publish, reopen                                                      */
/* -------------------------------------------------------------------------- */

export async function lockAssessment(
  _prev: CduFormState,
  formData: FormData,
): Promise<CduFormState> {
  const cdu = await requireCdu();
  const assessmentId = String(formData.get("assessmentId") ?? "");

  const overview = await loadAssessment(assessmentId);

  if (overview.unresolved.length > 0) {
    return {
      status: "error",
      message: `${overview.unresolved.length} criteri${
        overview.unresolved.length === 1 ? "on is" : "a are"
      } still unresolved.`,
    };
  }

  const pending = overview.assessment.nonNegotiables.filter((n) => n.verdict === "PENDING");
  if (pending.length > 0) {
    return {
      status: "error",
      message: `${pending.length} Non-Negotiable${
        pending.length === 1 ? " is" : "s are"
      } still unverified. Every check must be decided before locking.`,
    };
  }

  await freezeResult(assessmentId, cdu.id);

  revalidatePath(`/cda/cdu/assessments/${assessmentId}`, "layout");
  return { status: "ok", message: "Scores locked and the result frozen." };
}

export async function unlockAssessment(
  _prev: CduFormState,
  formData: FormData,
): Promise<CduFormState> {
  await requireCdu();
  const assessmentId = String(formData.get("assessmentId") ?? "");

  const assessment = await prisma.clubAssessment.findUnique({ where: { id: assessmentId } });
  if (!assessment) return { status: "error", message: "That assessment no longer exists." };

  if (assessment.status === "PUBLISHED") {
    return {
      status: "error",
      message: "This rating has been released to the club. Withdraw it before unlocking.",
    };
  }

  await prisma.clubAssessment.update({
    where: { id: assessmentId },
    data: {
      status: "RECONCILING",
      lockedAt: null,
      lockedById: null,
      // The frozen numbers are cleared with the lock. Leaving them behind would
      // let a stale result sit on the record while the live view recomputes,
      // and the two would disagree at exactly the moment someone is editing.
      finalPercent: null,
      technicalPct: null,
      planningPct: null,
      deliveryPct: null,
      outcomesPct: null,
      finalShield: null,
      eligible: null,
    },
  });

  revalidatePath(`/cda/cdu/assessments/${assessmentId}`, "layout");
  return { status: "ok", message: "Unlocked. The result will be recomputed when you lock again." };
}

export async function publishAssessment(
  _prev: CduFormState,
  formData: FormData,
): Promise<CduFormState> {
  await requireCdu();
  const assessmentId = String(formData.get("assessmentId") ?? "");

  const assessment = await prisma.clubAssessment.findUnique({ where: { id: assessmentId } });
  if (!assessment) return { status: "error", message: "That assessment no longer exists." };
  if (!assessment.lockedAt) {
    return { status: "error", message: "Lock the scores before releasing the rating." };
  }

  await prisma.clubAssessment.update({
    where: { id: assessmentId },
    data: {
      status: "PUBLISHED",
      publishedAt: new Date(),
      summary: String(formData.get("summary") ?? "").trim() || null,
    },
  });

  revalidatePath(`/cda/cdu/assessments/${assessmentId}`, "layout");
  return { status: "ok", message: "Rating released to the club." };
}

export async function withdrawAssessment(
  _prev: CduFormState,
  formData: FormData,
): Promise<CduFormState> {
  await requireCdu();
  const assessmentId = String(formData.get("assessmentId") ?? "");

  await prisma.clubAssessment.update({
    where: { id: assessmentId },
    data: { status: "LOCKED", publishedAt: null },
  });

  revalidatePath(`/cda/cdu/assessments/${assessmentId}`, "layout");
  return { status: "ok", message: "Withdrawn. The club can no longer see the rating." };
}

/** Hands an assessment back to the club to correct something. */
export async function reopenForClub(
  _prev: CduFormState,
  formData: FormData,
): Promise<CduFormState> {
  await requireCdu();
  const assessmentId = String(formData.get("assessmentId") ?? "");

  const assessment = await prisma.clubAssessment.findUnique({ where: { id: assessmentId } });
  if (!assessment) return { status: "error", message: "That assessment no longer exists." };
  if (assessment.lockedAt) {
    return { status: "error", message: "Unlock the assessment first." };
  }

  await prisma.clubAssessment.update({
    where: { id: assessmentId },
    data: { status: "IN_PROGRESS", clubSubmittedAt: null },
  });

  revalidatePath(`/cda/cdu/assessments/${assessmentId}`, "layout");
  return { status: "ok", message: "Reopened. The club can edit and resubmit." };
}

/* -------------------------------------------------------------------------- */
/* Cycle                                                                      */
/* -------------------------------------------------------------------------- */

const cycleSchema = z.object({
  technicalWeight: z.coerce.number().int().min(0).max(100),
  planningWeight: z.coerce.number().int().min(0).max(100),
  deliveryWeight: z.coerce.number().int().min(0).max(100),
  outcomesWeight: z.coerce.number().int().min(0).max(100),
  bronzeMin: z.coerce.number().int().min(0).max(100),
  silverMin: z.coerce.number().int().min(0).max(100),
  goldMin: z.coerce.number().int().min(0).max(100),
  platinumMin: z.coerce.number().int().min(0).max(100),
});

export async function updateCycle(_prev: CduFormState, formData: FormData): Promise<CduFormState> {
  await requireCdu();
  const cycleId = String(formData.get("cycleId") ?? "");

  const parsed = cycleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Weights and thresholds must be whole numbers from 0 to 100." };
  }

  const d = parsed.data;

  if (!(d.bronzeMin < d.silverMin && d.silverMin < d.goldMin && d.goldMin < d.platinumMin)) {
    return {
      status: "error",
      message: "Shield thresholds must increase: Bronze < Silver < Gold < Platinum.",
    };
  }

  const totalWeight =
    d.technicalWeight + d.planningWeight + d.deliveryWeight + d.outcomesWeight;
  if (totalWeight === 0) {
    return { status: "error", message: "At least one domain must carry some weight." };
  }

  // Any published assessment in this cycle has its numbers frozen on its own
  // row, so a weight change here can't move a rating a club has already been
  // given. Saying so beats an admin discovering it by accident.
  const published = await prisma.clubAssessment.count({
    where: { cycleId, status: "PUBLISHED" },
  });

  const status = String(formData.get("status") ?? "");
  const validStatus = ["SETUP", "CLUB_ENTRY", "ASSESSING", "RECONCILING", "PUBLISHED"].includes(
    status,
  );

  await prisma.cycle.update({
    where: { id: cycleId },
    data: { ...d, ...(validStatus ? { status: status as never } : {}) },
  });

  refresh();
  return {
    status: "ok",
    message:
      totalWeight === 100
        ? published > 0
          ? `Saved. ${published} already-published rating${published === 1 ? "" : "s"} are unaffected — their results are frozen.`
          : "Cycle settings saved."
        : `Saved. Weights total ${totalWeight}%, so they'll be normalised when scoring.`,
  };
}

export async function createCycle(_prev: CduFormState, formData: FormData): Promise<CduFormState> {
  await requireCdu();

  const year = Number(formData.get("year"));
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    return { status: "error", message: "Enter a valid year." };
  }

  const existing = await prisma.cycle.findUnique({ where: { year } });
  if (existing) return { status: "error", message: `A ${year} cycle already exists.` };

  await prisma.cycle.create({
    data: { year, name: `${year} Club Rating`, status: "SETUP" },
  });

  refresh();
  return { status: "ok", message: `${year} cycle created.` };
}
