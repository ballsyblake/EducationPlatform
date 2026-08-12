"use server";

import { revalidatePath } from "next/cache";
import QRCode from "qrcode";
import { z } from "zod";
import { createInviteLink, normalizeEmail } from "@/lib/auth";
import { RELEASED_STATUSES, requireCdu } from "@/lib/cda/access";
import { activeCycle, ensureAssessment, freezeResult, loadAssessment } from "@/lib/cda/assessment";
import { MAX_ASSESSORS_PER_CLUB } from "@/lib/cda/rubric";
import { STAGE_LABELS, reviewTimeline } from "@/lib/cda/review";
import { THRESHOLD_LEVELS } from "@/lib/cda/scoring";
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

/**
 * Allocates one line item, across one pool, to one assessor.
 *
 * Slots 1 and 2 assess independently. Slot 3 exists only to break a split
 * between them and is normally left empty — filling it as a matter of course
 * turns a tiebreaker into a third opinion and costs a third of the assessing
 * effort for nothing.
 */
export async function assignCriterion(
  _prev: CduFormState,
  formData: FormData,
): Promise<CduFormState> {
  await requireCdu();

  const poolId = String(formData.get("poolId") ?? "");
  const criterionId = String(formData.get("criterionId") ?? "");
  const assessorId = String(formData.get("assessorId") ?? "");
  const slot = Number(formData.get("slot") ?? 1);

  if (!assessorId) return { status: "error", message: "Choose an assessor." };
  if (!Number.isInteger(slot) || slot < 1 || slot > MAX_ASSESSORS_PER_CLUB) {
    return { status: "error", message: `Slot must be 1 to ${MAX_ASSESSORS_PER_CLUB}.` };
  }

  const assessor = await prisma.user.findFirst({
    where: { id: assessorId, role: "ASSESSOR", active: true },
  });
  if (!assessor) return { status: "error", message: "That assessor isn't available." };

  const existing = await prisma.criterionAssignment.findUnique({
    where: { poolId_criterionId_slot: { poolId, criterionId, slot } },
  });
  if (existing) {
    return { status: "error", message: `Slot ${slot} is already filled for this line item.` };
  }

  try {
    await prisma.criterionAssignment.create({ data: { poolId, criterionId, assessorId, slot } });
  } catch {
    // The second unique index catches the same person in two slots.
    return { status: "error", message: "That assessor already holds this line item." };
  }

  refresh();
  return { status: "ok", message: `${assessor.name ?? assessor.email} assigned to slot ${slot}.` };
}

/**
 * Removes a line item from an assessor.
 *
 * Their scores for it go too, across every club in the pool. Leaving them
 * behind would mean the reconciliation view showing a column headed by someone
 * who no longer holds the item, with those scores still counting towards the
 * median.
 */
export async function unassignCriterion(formData: FormData) {
  await requireCdu();
  const assignmentId = String(formData.get("assignmentId") ?? "");

  const assignment = await prisma.criterionAssignment.findUnique({
    where: { id: assignmentId },
    select: { poolId: true, criterionId: true, assessorId: true },
  });
  if (!assignment) return;

  const clubs = await prisma.clubAssessment.findMany({
    where: { poolId: assignment.poolId },
    select: { id: true },
  });

  await prisma.$transaction([
    prisma.assessorScore.deleteMany({
      where: {
        assessorId: assignment.assessorId,
        criterionId: assignment.criterionId,
        assessmentId: { in: clubs.map((c) => c.id) },
      },
    }),
    prisma.criterionAssignment.delete({ where: { id: assignmentId } }),
  ]);

  refresh();
}

/** Hands a submitted line item back to its assessor to change. */
export async function reopenAssignment(formData: FormData) {
  await requireCdu();
  const assignmentId = String(formData.get("assignmentId") ?? "");

  const assignment = await prisma.criterionAssignment.findUnique({
    where: { id: assignmentId },
    select: { poolId: true },
  });
  if (!assignment) return;

  await prisma.criterionAssignment.update({
    where: { id: assignmentId },
    data: { submittedAt: null },
  });

  // Reopening one item pulls the pool's clubs back out of reconciliation, since
  // the assessment they were moved on the strength of is no longer complete.
  await prisma.clubAssessment.updateMany({
    where: { poolId: assignment.poolId, status: "RECONCILING", lockedAt: null },
    data: { status: "IN_ASSESSMENT" },
  });

  refresh();
}

/* -------------------------------------------------------------------------- */
/* Pools                                                                      */
/* -------------------------------------------------------------------------- */

export async function createPool(_prev: CduFormState, formData: FormData): Promise<CduFormState> {
  await requireCdu();

  const cycleId = String(formData.get("cycleId") ?? "");
  const name = String(formData.get("name") ?? "").trim().toUpperCase();

  if (!name) return { status: "error", message: "Give the pool a name." };
  if (name.length > 12) return { status: "error", message: "Keep pool names short — “A”, “B”, “C”." };

  const existing = await prisma.pool.findUnique({ where: { cycleId_name: { cycleId, name } } });
  if (existing) return { status: "error", message: `Pool ${name} already exists in this cycle.` };

  const count = await prisma.pool.count({ where: { cycleId } });
  await prisma.pool.create({ data: { cycleId, name, position: count } });

  refresh();
  return { status: "ok", message: `Pool ${name} created.` };
}

/**
 * Moves a club into a pool — or out of one.
 *
 * Scores already recorded stay put. They belong to (club, criterion, assessor)
 * and remain valid evidence of what that assessor judged; what changes is who
 * is responsible for the club's remaining line items.
 */
export async function setClubPool(formData: FormData) {
  await requireCdu();

  const assessmentId = String(formData.get("assessmentId") ?? "");
  const poolId = String(formData.get("poolId") ?? "");

  const assessment = await prisma.clubAssessment.findUnique({
    where: { id: assessmentId },
    select: { lockedAt: true },
  });
  if (!assessment || assessment.lockedAt) return;

  await prisma.clubAssessment.update({
    where: { id: assessmentId },
    data: { poolId: poolId || null },
  });

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

  const threshold = result.nonNegotiable.kind === "SHIELD_THRESHOLD";

  // THRESHOLD_LEVELS rather than every shield: FQ sets its threshold standards
  // per shield, and Development Committed is a badge, not a shield — there is
  // no bar below Bronze to fall short of.
  const levelRaw = String(formData.get("shieldMet") ?? "");
  const shieldMet = THRESHOLD_LEVELS.find((s) => s === levelRaw) ?? null;

  if (threshold && verdict === "PASS" && shieldMet === null) {
    // Passing a threshold check without saying which bar was met would leave
    // the cap open, and an open cap silently awards whatever the score earned —
    // the one outcome these checks exist to prevent.
    return {
      status: "error",
      message: "Say which shield's standard the club met before recording this one as passed.",
    };
  }

  // Departing from a computed level needs a reason on the record. The Unit is
  // entitled to exercise judgement — FQ plainly does — but a level that differs
  // from what the rules give should be a decision somebody signed, not a number
  // indistinguishable from arithmetic. This is the same bargain the reconcile
  // screen strikes when the CDU departs from the assessors' median.
  const derived = result.shieldMetDerived;
  const departing = threshold && verdict === "PASS" && derived !== null && shieldMet !== derived;
  const overrideReason = String(formData.get("overrideReason") ?? "").trim() || null;

  if (departing && !overrideReason) {
    return {
      status: "error",
      message: `The club's recorded structure computes to ${derived}. Say why you're recording a different level.`,
    };
  }

  await prisma.nonNegotiableResult.update({
    where: { id: resultId },
    data: {
      verdict,
      adminNote,
      // A gate check has no level, and a level left behind on a check that has
      // been reset to unverified would go on capping the shield invisibly.
      shieldMet: threshold && verdict === "PASS" ? shieldMet : null,
      overrideReason: departing ? overrideReason : null,
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

  // Bounded by the criterion's own maximum, not a constant — resolving a
  // three-point item to 4 would put a club above the maximum the report says it
  // was measured against.
  const criterion = await prisma.criterion.findUnique({
    where: { id: criterionId },
    select: { maxScore: true, code: true },
  });
  if (!criterion) return { status: "error", message: "That criterion no longer exists." };

  if (!Number.isInteger(stars) || stars < 0 || stars > criterion.maxScore) {
    return {
      status: "error",
      message: `${criterion.code} is scored from 0 to ${criterion.maxScore}.`,
    };
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

/**
 * Records the CDU's paragraph of feedback on one macro-area.
 *
 * This is the part of the report a club actually acts on — "the framework
 * exists but is not applied below U14" says something a percentage cannot — so
 * it is written per area rather than once for the whole domain.
 */
export async function saveAreaNote(
  _prev: CduFormState,
  formData: FormData,
): Promise<CduFormState> {
  const cdu = await requireCdu();

  const assessmentId = String(formData.get("assessmentId") ?? "");
  const domain = String(formData.get("domain") ?? "");
  const area = String(formData.get("area") ?? "");
  const comment = String(formData.get("comment") ?? "").trim();

  if (!["PLANNING", "DELIVERY", "OUTCOMES"].includes(domain)) {
    return { status: "error", message: "Unknown domain." };
  }

  const assessment = await prisma.clubAssessment.findUnique({
    where: { id: assessmentId },
    select: { publishedAt: true },
  });
  if (!assessment) return { status: "error", message: "That assessment no longer exists." };
  if (assessment.publishedAt) {
    return {
      status: "error",
      message: "This rating has been released. Withdraw it before editing the feedback.",
    };
  }

  if (!comment) {
    // Clearing is deleting: an empty paragraph on a report is worse than none.
    await prisma.areaNote.deleteMany({
      where: { assessmentId, domain: domain as never, area },
    });
  } else {
    await prisma.areaNote.upsert({
      where: {
        assessmentId_domain_area: { assessmentId, domain: domain as never, area },
      },
      update: { comment, authorId: cdu.id },
      create: { assessmentId, domain: domain as never, area, comment, authorId: cdu.id },
    });
  }

  revalidatePath(`/cda/cdu/assessments/${assessmentId}`, "layout");
  return { status: "ok", message: `${area} feedback saved.` };
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

  // Below the Bronze bar the Development Committed badge is the award, and it
  // turns on licence compliance. Freezing with that unanswered would record
  // "no badge" as a decision when it is really an omission — and the club would
  // be told so in writing.
  if (overview.rating.provisionalShield === "NONE" && overview.assessment.licenceCompliant === null) {
    return {
      status: "error",
      message:
        "This club scored below the Bronze bar, so record whether it is licence compliant in non-technical areas before locking — that decides the Development Committed badge.",
    };
  }

  await freezeResult(assessmentId, cdu.id);

  revalidatePath(`/cda/cdu/assessments/${assessmentId}`, "layout");
  return { status: "ok", message: "Scores locked and the result frozen." };
}

/**
 * Records whether the club is licence compliant in non-technical areas.
 *
 * The one condition Football Queensland attaches to the Development Committed
 * badge, and it isn't measured by this assessment — compliance sits under the
 * Advanced Participation Licence. So it is recorded rather than derived, and
 * left null until someone actually knows: a club that scores under 40% and has
 * never been looked at gets nothing, not a badge by default.
 */
export async function setLicenceCompliance(
  _prev: CduFormState,
  formData: FormData,
): Promise<CduFormState> {
  await requireCdu();
  const assessmentId = String(formData.get("assessmentId") ?? "");

  const assessment = await prisma.clubAssessment.findUnique({ where: { id: assessmentId } });
  if (!assessment) return { status: "error", message: "That assessment no longer exists." };

  if (assessment.lockedAt) {
    return {
      status: "error",
      message: "This assessment is locked. Unlock it before changing licence compliance.",
    };
  }

  const raw = String(formData.get("licenceCompliant") ?? "");
  const licenceCompliant = raw === "yes" ? true : raw === "no" ? false : null;

  await prisma.clubAssessment.update({
    where: { id: assessmentId },
    data: { licenceCompliant },
  });

  revalidatePath(`/cda/cdu/assessments/${assessmentId}`, "layout");
  return {
    status: "ok",
    message:
      licenceCompliant === null
        ? "Licence compliance cleared."
        : licenceCompliant
          ? "Recorded as licence compliant."
          : "Recorded as not licence compliant.",
  };
}

export async function unlockAssessment(
  _prev: CduFormState,
  formData: FormData,
): Promise<CduFormState> {
  await requireCdu();
  const assessmentId = String(formData.get("assessmentId") ?? "");

  const assessment = await prisma.clubAssessment.findUnique({ where: { id: assessmentId } });
  if (!assessment) return { status: "error", message: "That assessment no longer exists." };

  if (RELEASED_STATUSES.includes(assessment.status as never)) {
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

  // A live review is a process the club has already started and has a clock
  // running on. Pulling the rating out from under it would leave a request with
  // nothing to review and a club that has spent its one allowance on it.
  const review = await prisma.reviewRequest.findUnique({ where: { assessmentId } });
  if (review) {
    return {
      status: "error",
      message:
        "This club has an open review request. Answer or resolve the review before withdrawing the rating.",
    };
  }

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
  technicalMaxPoints: z.coerce.number().int().min(0).max(5000),
  bronzeMin: z.coerce.number().int().min(0).max(100),
  silverMin: z.coerce.number().int().min(0).max(100),
  goldMin: z.coerce.number().int().min(0).max(100),
});

export async function updateCycle(_prev: CduFormState, formData: FormData): Promise<CduFormState> {
  await requireCdu();
  const cycleId = String(formData.get("cycleId") ?? "");

  const parsed = cycleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Thresholds must be whole numbers from 0 to 100, and Technical points from 0 to 5000.",
    };
  }

  const d = parsed.data;

  if (!(d.bronzeMin < d.silverMin && d.silverMin < d.goldMin)) {
    return {
      status: "error",
      message: "Shield thresholds must increase: Bronze < Silver < Gold.",
    };
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
      published > 0
        ? `Saved. ${published} already-published rating${published === 1 ? " is" : "s are"} unaffected — their results are frozen.`
        : "Cycle settings saved.",
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

/* -------------------------------------------------------------------------- */
/* Review and appeal                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Records the Unit's answer on one line item the club put forward.
 *
 * Revising a score writes through to the reconciled `FinalScore` — a review
 * that changed a number but left the rating showing the old one would be a
 * review in name only. The frozen result is recomputed when the response is
 * sent, not here, so the club sees one movement rather than a percentage that
 * creeps while the Unit works through the list.
 */
export async function answerReviewItem(
  _prev: CduFormState,
  formData: FormData,
): Promise<CduFormState> {
  const cdu = await requireCdu();
  const itemId = String(formData.get("itemId") ?? "");

  const item = await prisma.reviewItem.findUnique({
    where: { id: itemId },
    include: { request: { include: { assessment: true } }, criterion: true },
  });
  if (!item) return { status: "error", message: "That review item no longer exists." };

  if (item.request.respondedAt) {
    return {
      status: "error",
      message: "This review has already been sent to the club. Reopen it to make changes.",
    };
  }

  const response = String(formData.get("response") ?? "").trim();
  if (!response) {
    // FQ commits to "detailed feedback to the club regarding their request".
    // A bare outcome with no reasoning is the thing clubs appeal.
    return { status: "error", message: "Say what you found — the club sees this." };
  }

  const preserve = String(formData.get("outcome") ?? "") === "PRESERVED";

  const current = await prisma.finalScore.findUnique({
    where: {
      assessmentId_criterionId: {
        assessmentId: item.request.assessmentId,
        criterionId: item.criterionId,
      },
    },
  });

  if (preserve) {
    await prisma.reviewItem.update({
      where: { id: itemId },
      data: {
        outcome: "PRESERVED",
        response,
        scoreBefore: current?.stars ?? null,
        scoreAfter: current?.stars ?? null,
      },
    });
    revalidatePath(`/cda/cdu/assessments/${item.request.assessmentId}`, "layout");
    return { status: "ok", message: `${item.criterion.code} preserved.` };
  }

  const raw = String(formData.get("stars") ?? "");
  const stars = Number.parseInt(raw, 10);
  if (!Number.isInteger(stars) || stars < 0 || stars > item.criterion.maxScore) {
    return {
      status: "error",
      message: `Choose a score from 0 to ${item.criterion.maxScore}.`,
    };
  }

  await prisma.finalScore.upsert({
    where: {
      assessmentId_criterionId: {
        assessmentId: item.request.assessmentId,
        criterionId: item.criterionId,
      },
    },
    update: {
      stars,
      resolvedById: cdu.id,
      // The rationale carries the review's fingerprint, so anyone reading the
      // reconciliation later sees why a score departs from what the assessors
      // agreed rather than assuming the CDU simply overrode them.
      rationale: `Revised on review: ${response}`,
    },
    create: {
      assessmentId: item.request.assessmentId,
      criterionId: item.criterionId,
      stars,
      resolvedById: cdu.id,
      rationale: `Revised on review: ${response}`,
    },
  });

  await prisma.reviewItem.update({
    where: { id: itemId },
    data: {
      outcome: "REVISED",
      response,
      scoreBefore: current?.stars ?? null,
      scoreAfter: stars,
    },
  });

  revalidatePath(`/cda/cdu/assessments/${item.request.assessmentId}`, "layout");
  return {
    status: "ok",
    message: `${item.criterion.code} revised to ${stars}.`,
  };
}

/**
 * Sends the Unit's response and recomputes the rating.
 *
 * The re-freeze is the whole point. A review that revised scores has changed
 * the answer, and the frozen columns are what the club is shown, so they have
 * to be rewritten — this is the one legitimate reason to move a number a club
 * has already been given, and it is done in the open with the before figures
 * preserved on the request.
 */
export async function sendReviewResponse(
  _prev: CduFormState,
  formData: FormData,
): Promise<CduFormState> {
  const cdu = await requireCdu();
  const requestId = String(formData.get("requestId") ?? "");

  const request = await prisma.reviewRequest.findUnique({
    where: { id: requestId },
    include: { items: true, assessment: true },
  });
  if (!request) return { status: "error", message: "That review no longer exists." };
  if (request.respondedAt) {
    return { status: "error", message: "This review has already been answered." };
  }

  const unanswered = request.items.filter((i) => i.outcome === "PENDING");
  if (unanswered.length > 0) {
    return {
      status: "error",
      message: `${unanswered.length} item${
        unanswered.length === 1 ? " is" : "s are"
      } still unanswered. Football Queensland answers on every item the club puts forward.`,
    };
  }

  const response = String(formData.get("response") ?? "").trim() || null;

  // Recompute from the revised scores. freezeResult reads the live reconciled
  // scores, so this picks up every revision made above in one pass.
  await freezeResult(request.assessmentId, cdu.id);

  await prisma.reviewRequest.update({
    where: { id: requestId },
    data: {
      status: "RESPONDED",
      respondedAt: new Date(),
      respondedById: cdu.id,
      response,
    },
  });

  // freezeResult sets LOCKED; the rating is already with the club, so put it
  // back where it belongs — released, and now inside the appeal window.
  await prisma.clubAssessment.update({
    where: { id: request.assessmentId },
    data: { status: "PUBLISHED" },
  });

  revalidatePath(`/cda/cdu/assessments/${request.assessmentId}`, "layout");
  return { status: "ok", message: "Response sent. The club now has 3 working days to appeal." };
}

/** Records the CEO's ruling. Final — nothing follows it. */
export async function decideAppeal(
  _prev: CduFormState,
  formData: FormData,
): Promise<CduFormState> {
  const cdu = await requireCdu();
  const requestId = String(formData.get("requestId") ?? "");

  const request = await prisma.reviewRequest.findUnique({ where: { id: requestId } });
  if (!request) return { status: "error", message: "That review no longer exists." };
  if (!request.appealedAt) return { status: "error", message: "There's no appeal to decide." };
  if (request.appealDecidedAt) {
    return { status: "error", message: "This appeal has already been decided." };
  }

  const decision = String(formData.get("decision") ?? "").trim();
  if (!decision) {
    return { status: "error", message: "Record the decision — the club sees this in full." };
  }

  await prisma.reviewRequest.update({
    where: { id: requestId },
    data: {
      status: "APPEAL_DECIDED",
      appealDecidedAt: new Date(),
      appealDecidedById: cdu.id,
      appealDecision: decision,
    },
  });

  // The appeal decision exhausts the process, so the rating confirms here
  // rather than waiting for a clock that has nothing left to run.
  await prisma.clubAssessment.update({
    where: { id: request.assessmentId },
    data: { status: "CONFIRMED" },
  });

  revalidatePath(`/cda/cdu/assessments/${request.assessmentId}`, "layout");
  return { status: "ok", message: "Appeal decided and the rating confirmed." };
}

/**
 * Marks a rating Confirmed once its windows have run out.
 *
 * Football Queensland confirms by the clock, not by a decision — "if there is
 * no review request, the club assessment score is set and final (Confirmed)
 * after the review timeframe has lapsed". There is no scheduler here, so this
 * is the manual equivalent: the button appears exactly when the timeline says
 * the rating is already settled, and the guard below is what stops it being
 * pressed a day early.
 */
export async function confirmRating(
  _prev: CduFormState,
  formData: FormData,
): Promise<CduFormState> {
  await requireCdu();
  const assessmentId = String(formData.get("assessmentId") ?? "");

  const assessment = await prisma.clubAssessment.findUnique({
    where: { id: assessmentId },
    include: { review: true },
  });
  if (!assessment) return { status: "error", message: "That assessment no longer exists." };

  const timeline = reviewTimeline({
    status: assessment.status,
    publishedAt: assessment.publishedAt,
    review: assessment.review,
  });

  if (!timeline.shouldConfirm) {
    return {
      status: "error",
      message:
        timeline.stage === "CONFIRMED"
          ? "This rating is already confirmed."
          : `Not yet — ${STAGE_LABELS[timeline.stage].toLowerCase()}. The club's window is still open.`,
    };
  }

  await prisma.clubAssessment.update({
    where: { id: assessmentId },
    data: { status: "CONFIRMED" },
  });

  revalidatePath(`/cda/cdu/assessments/${assessmentId}`, "layout");
  return { status: "ok", message: "Rating confirmed. The club may now display its shield." };
}
