"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertCourseStaff } from "@/lib/access";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { courseResultsFor, deadlineInForce, isPastDeadline } from "@/lib/support";
import {
  DEFAULT_RATING_THRESHOLD,
  RATING_SCALE,
  reviewGate,
  SUPPORT_CRITERIA,
} from "@/lib/support-rubric";
import type { SupportActivityKind, SupportPathway } from "@prisma-client";

/**
 * The course a case or an attempt belongs to.
 *
 * Every action here is reached from a case, and a case is always on a course —
 * which is what decides whether the actor may touch it. Resolved rather than
 * taken off the form, because a form field naming the course would be a form
 * field somebody could change.
 */
async function courseOfCase(caseId: string) {
  const row = await prisma.supportCase.findUnique({
    where: { id: caseId },
    select: { courseId: true },
  });
  return row?.courseId ?? null;
}

async function courseOfAttempt(attemptId: string) {
  const row = await prisma.supportAttempt.findUnique({
    where: { id: attemptId },
    select: { case: { select: { courseId: true } } },
  });
  return row?.case.courseId ?? null;
}

async function courseOfExtension(extensionId: string) {
  const row = await prisma.supportExtension.findUnique({
    where: { id: extensionId },
    select: { case: { select: { courseId: true } } },
  });
  return row?.case.courseId ?? null;
}

export type SupportState = { status: "idle" | "ok" | "error"; message?: string };

const PATHWAYS: SupportPathway[] = ["LIVE_ASSESSMENT", "VIDEO_REVIEW"];
const MARKS = new Set<number>(RATING_SCALE);

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function parseDate(formData: FormData, key: string) {
  const raw = text(formData, key);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * A `<input type="date">` value, read as that day rather than as an instant.
 *
 * Anchored to UTC the way the register anchors a course day: a deadline is a
 * date somebody agreed to, and parsing it in the server's zone would let the
 * machine's location decide whether a coach ran out of time.
 */
function parseDay(formData: FormData, key: string) {
  const raw = text(formData, key);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function readPathway(formData: FormData): SupportPathway | null {
  const value = text(formData, "pathway") as SupportPathway;
  return PATHWAYS.includes(value) ? value : null;
}

/** Everything the two arranging forms agree on, since they take the same fields. */
function readArrangement(formData: FormData) {
  const pathway = readPathway(formData);
  if (!pathway) return { error: "Choose live assessment or video review." as const };

  const dueAt = parseDate(formData, "dueAt");
  if (!dueAt) {
    return {
      error:
        pathway === "LIVE_ASSESSMENT"
          ? ("Set the date and time of the session you'll be attending." as const)
          : ("Set the date the coach's video is due." as const),
    };
  }

  const venue = text(formData, "venue");
  if (pathway === "LIVE_ASSESSMENT" && !venue) {
    return { error: "Say where the session is — the coach needs to know you have the right ground." as const };
  }

  return {
    pathway,
    dueAt,
    venue: venue || null,
    // A live assessment starts booked; a video pathway starts waiting on the coach.
    status: pathway === "LIVE_ASSESSMENT" ? ("SCHEDULED" as const) : ("AWAITING_VIDEO" as const),
  };
}

function refreshCase(caseId: string) {
  revalidatePath("/admin/support");
  revalidatePath(`/admin/support/${caseId}`);
  revalidatePath("/support");
  revalidatePath(`/support/${caseId}`);
  revalidatePath("/dashboard");
}

/* ------------------------------ Referral ---------------------------------- */

/**
 * Opens a support case and arranges the first assessment in one step.
 *
 * The percentage that triggered the referral is frozen onto the case as it
 * stands right now: a regrade or a late turn-in afterwards can move the live
 * figure, and neither should quietly rewrite the reason the coach was referred.
 */
export async function referToSupport(
  _prev: SupportState,
  formData: FormData,
): Promise<SupportState> {
  const admin = await requireStaff();
  const courseId = text(formData, "courseId");
  const userId = text(formData, "userId");
  if (courseId) await assertCourseStaff(admin, courseId);

  if (!courseId || !userId) return { status: "error", message: "Pick a coach and a course." };

  const arrangement = readArrangement(formData);
  if ("error" in arrangement) return { status: "error", message: arrangement.error };

  const [coach, course, existing] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.course.findUnique({ where: { id: courseId } }),
    prisma.supportCase.findUnique({ where: { courseId_userId: { courseId, userId } } }),
  ]);

  if (!coach || coach.role !== "COACH") return { status: "error", message: "That isn't a coach." };
  if (!course) return { status: "error", message: "Course not found." };
  if (existing) {
    return {
      status: "error",
      message: "This coach already has a support case on this course.",
    };
  }

  const results = await courseResultsFor(userId);
  const result = results.find((r) => r.courseId === courseId);

  const created = await prisma.supportCase.create({
    data: {
      courseId,
      userId,
      reason: text(formData, "reason") || null,
      referredRating: result?.rating ?? null,
      educatorId: text(formData, "educatorId") || admin.id,
      referredById: admin.id,
      attempts: {
        create: {
          attemptNo: 1,
          pathway: arrangement.pathway,
          status: arrangement.status,
          dueAt: arrangement.dueAt,
          venue: arrangement.venue,
        },
      },
    },
  });

  refreshCase(created.id);
  revalidatePath("/admin/progress");
  redirect(`/admin/support/${created.id}`);
}

/* ------------------------------ Arranging --------------------------------- */

/** Books the next assessment on a case whose last attempt fell short. */
export async function arrangeAttempt(
  _prev: SupportState,
  formData: FormData,
): Promise<SupportState> {
  const actor = await requireStaff();
  const caseId = text(formData, "caseId");
  const scope = await courseOfCase(caseId);
  if (scope) await assertCourseStaff(actor, scope);

  const supportCase = await prisma.supportCase.findUnique({
    where: { id: caseId },
    include: { attempts: { select: { attemptNo: true, status: true } } },
  });
  if (!supportCase) return { status: "error", message: "Case not found." };
  if (supportCase.status !== "IN_PROGRESS") {
    return { status: "error", message: "This case is closed. Reopen it first." };
  }
  if (supportCase.attempts.some((a) => a.status !== "REVIEWED")) {
    return { status: "error", message: "There's already an assessment open on this case." };
  }
  if (supportCase.attempts.length >= supportCase.attemptsAllowed) {
    return {
      status: "error",
      message:
        `This case allows ${supportCase.attemptsAllowed} assessment` +
        `${supportCase.attemptsAllowed === 1 ? "" : "s"} and they've all been used. ` +
        "Raise the allowance in Case settings if another one is warranted.",
    };
  }

  const arrangement = readArrangement(formData);
  if ("error" in arrangement) return { status: "error", message: arrangement.error };

  await prisma.supportAttempt.create({
    data: {
      caseId,
      attemptNo: Math.max(0, ...supportCase.attempts.map((a) => a.attemptNo)) + 1,
      pathway: arrangement.pathway,
      status: arrangement.status,
      dueAt: arrangement.dueAt,
      venue: arrangement.venue,
    },
  });

  refreshCase(caseId);
  return { status: "ok", message: "Assessment arranged." };
}

/** Moves a booked assessment — a new date, a new ground, or the other pathway. */
export async function rearrangeAttempt(
  _prev: SupportState,
  formData: FormData,
): Promise<SupportState> {
  const actor = await requireStaff();
  const attemptId = text(formData, "attemptId");
  const scope = await courseOfAttempt(attemptId);
  if (scope) await assertCourseStaff(actor, scope);

  const attempt = await prisma.supportAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt) return { status: "error", message: "Assessment not found." };
  if (attempt.status === "REVIEWED") {
    return { status: "error", message: "That assessment has already been written up." };
  }

  const arrangement = readArrangement(formData);
  if ("error" in arrangement) return { status: "error", message: arrangement.error };

  // Film that is already in stays in: switching a submitted video review to a
  // live assessment would silently discard the coach's submission.
  const status = attempt.status === "SUBMITTED" ? attempt.status : arrangement.status;

  await prisma.supportAttempt.update({
    where: { id: attemptId },
    data: {
      pathway: attempt.status === "SUBMITTED" ? attempt.pathway : arrangement.pathway,
      status,
      dueAt: arrangement.dueAt,
      venue: arrangement.venue,
    },
  });

  refreshCase(attempt.caseId);
  return { status: "ok", message: "Assessment updated." };
}

/** Drops an assessment that was arranged in error. */
export async function cancelAttempt(formData: FormData) {
  const actor = await requireStaff();
  const attemptId = text(formData, "attemptId");
  const scope = await courseOfAttempt(attemptId);
  if (scope) await assertCourseStaff(actor, scope);

  const attempt = await prisma.supportAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt || attempt.status === "REVIEWED") return;

  await prisma.supportAttempt.delete({ where: { id: attemptId } });
  refreshCase(attempt.caseId);
}

/* ---------------------------- Case settings ------------------------------- */

export async function updateCase(_prev: SupportState, formData: FormData): Promise<SupportState> {
  const actor = await requireStaff();
  const caseId = text(formData, "caseId");
  const scope = await courseOfCase(caseId);
  if (scope) await assertCourseStaff(actor, scope);

  const supportCase = await prisma.supportCase.findUnique({
    where: { id: caseId },
    include: { _count: { select: { attempts: true } } },
  });
  if (!supportCase) return { status: "error", message: "Case not found." };

  const allowed = Number(text(formData, "attemptsAllowed"));
  if (!Number.isInteger(allowed) || allowed < 1 || allowed > 5) {
    return { status: "error", message: "Assessments allowed has to be between 1 and 5." };
  }
  if (allowed < supportCase._count.attempts) {
    return {
      status: "error",
      message: `This coach has already had ${supportCase._count.attempts}. You can't allow fewer than that.`,
    };
  }

  await prisma.supportCase.update({
    where: { id: caseId },
    data: {
      educatorId: text(formData, "educatorId") || null,
      // Cleared when the field is emptied, which is how somebody takes a name
      // back off a case that has since been given to an account.
      educatorName: text(formData, "educatorName") || null,
      attemptsAllowed: allowed,
      reason: text(formData, "reason") || null,
      plan: text(formData, "plan") || null,
      // Null puts the coach back on the cohort's date. That is the useful
      // meaning of clearing it, and it is why the column is nullable rather
      // than copied down from the course when the case is opened.
      deadline: parseDay(formData, "deadline"),
    },
  });

  refreshCase(caseId);
  return { status: "ok", message: "Case updated." };
}

/* ------------------------------ Extensions -------------------------------- */

/**
 * Asks for a case's deadline to be moved.
 *
 * A request rather than an edit, because the answer usually comes from outside
 * this system and can take weeks. The deadline does not move now — it moves if
 * and when somebody records what came back.
 */
export async function requestExtension(
  _prev: SupportState,
  formData: FormData,
): Promise<SupportState> {
  const actor = await requireStaff();
  const caseId = text(formData, "caseId");
  const scope = await courseOfCase(caseId);
  if (!scope) return { status: "error", message: "Case not found." };
  await assertCourseStaff(actor, scope);

  const requestedUntil = parseDay(formData, "requestedUntil");
  if (!requestedUntil) {
    return { status: "error", message: "Say which date you're asking for." };
  }

  await prisma.supportExtension.create({
    data: {
      caseId,
      requestedUntil,
      reason: text(formData, "reason") || null,
      requestedById: actor.id,
    },
  });

  refreshCase(caseId);
  return { status: "ok", message: "Extension requested." };
}

/**
 * Records the answer.
 *
 * A grant carries its own date because the date given is not always the date
 * asked for, and it is the given one the case is then due by. A refusal keeps
 * the row: it is the reason the original deadline still stands.
 */
export async function decideExtension(
  _prev: SupportState,
  formData: FormData,
): Promise<SupportState> {
  const actor = await requireStaff();
  const extensionId = text(formData, "extensionId");
  const scope = await courseOfExtension(extensionId);
  if (!scope) return { status: "error", message: "Extension not found." };
  await assertCourseStaff(actor, scope);

  const extension = await prisma.supportExtension.findUnique({
    where: { id: extensionId },
    select: { id: true, caseId: true, requestedUntil: true },
  });
  if (!extension) return { status: "error", message: "Extension not found." };

  const status = text(formData, "status");
  if (status !== "GRANTED" && status !== "REFUSED") {
    return { status: "error", message: "Say whether it was granted or refused." };
  }

  // Only a grant carries a date, and it defaults to the date that was asked
  // for — the ordinary answer — rather than making somebody retype it.
  const grantedUntil = status === "GRANTED" ? (parseDay(formData, "grantedUntil") ?? extension.requestedUntil) : null;

  await prisma.supportExtension.update({
    where: { id: extensionId },
    data: {
      status,
      grantedUntil,
      decidedBy: text(formData, "decidedBy") || null,
      decidedAt: new Date(),
    },
  });

  refreshCase(extension.caseId);
  return {
    status: "ok",
    message:
      status === "GRANTED"
        ? "Extension granted — the deadline moves with it."
        : "Refused. The original deadline still stands.",
  };
}

/* ---------------------------- The activity log ---------------------------- */

const ACTIVITY_KINDS: SupportActivityKind[] = [
  "SUPPORT_OFFERED",
  "MEETING",
  "TRAINING_VISIT",
  "ACTION_PLAN",
  "VIDEO_CHASED",
  "VIDEO_RECEIVED",
  "UNAVAILABLE",
  "OUTCOME_SENT",
  "NOTE",
];

/**
 * Adds one dated entry to a case's history.
 *
 * `occurredAt` is the day the thing happened, not today: these are written up
 * afterwards, and a log that timestamps itself answers the wrong question.
 */
export async function logActivity(
  _prev: SupportState,
  formData: FormData,
): Promise<SupportState> {
  const actor = await requireStaff();
  const caseId = text(formData, "caseId");
  const scope = await courseOfCase(caseId);
  if (!scope) return { status: "error", message: "Case not found." };
  await assertCourseStaff(actor, scope);

  const kind = text(formData, "kind") as SupportActivityKind;
  if (!ACTIVITY_KINDS.includes(kind)) {
    return { status: "error", message: "Pick what kind of entry this is." };
  }

  const occurredAt = parseDay(formData, "occurredAt");
  if (!occurredAt) return { status: "error", message: "Say which day this happened." };

  const detail = text(formData, "detail");
  // A bare "NOTE" with nothing written in it records that somebody typed
  // nothing. Every other kind says something on its own.
  if (kind === "NOTE" && !detail) {
    return { status: "error", message: "Write the note before saving it." };
  }

  await prisma.supportActivity.create({
    data: { caseId, kind, occurredAt, detail: detail || null, recordedById: actor.id },
  });

  refreshCase(caseId);
  return { status: "ok", message: "Added to the history." };
}

/* ------------------------------- Review ----------------------------------- */

/**
 * Writes up an assessment: a mark against every criterion, the outcome, and the
 * feedback the coach reads.
 *
 * The outcome is checked against the marks rather than taken on trust. Every
 * criterion has to carry a mark, and a single "Not yet" rules out a successful
 * outcome — an educator who means to pass the coach has to move that mark and
 * own it. Recording a successful outcome closes the case and the course is
 * passed; "not yet" leaves the case open for whatever the educator arranges
 * next.
 */
export async function recordReview(
  _prev: SupportState,
  formData: FormData,
): Promise<SupportState> {
  const admin = await requireStaff();
  const attemptId = text(formData, "attemptId");
  const scope = await courseOfAttempt(attemptId);
  if (scope) await assertCourseStaff(admin, scope);

  const attempt = await prisma.supportAttempt.findUnique({
    where: { id: attemptId },
    include: {
      case: {
        include: {
          course: { select: { ratingThreshold: true } },
          attempts: { select: { id: true } },
        },
      },
    },
  });
  if (!attempt) return { status: "error", message: "Assessment not found." };
  if (attempt.status === "AWAITING_VIDEO") {
    return { status: "error", message: "The coach hasn't submitted their video yet." };
  }

  const threshold =
    attempt.case.course.ratingThreshold ?? DEFAULT_RATING_THRESHOLD;

  const marks = new Map<string, number | null>();
  for (const criterion of SUPPORT_CRITERIA) {
    const raw = Number(text(formData, `rating_${criterion.code}`));
    marks.set(criterion.code, MARKS.has(raw) ? raw : null);
  }

  const gate = reviewGate(marks, threshold);
  if (!gate.complete) {
    return {
      status: "error",
      message: `Rate every criterion — ${gate.missing.length} still blank.`,
    };
  }

  const outcome = text(formData, "outcome");
  if (outcome !== "SUCCESSFUL" && outcome !== "NOT_YET_SUCCESSFUL") {
    return { status: "error", message: "Choose an outcome." };
  }
  if (outcome === "SUCCESSFUL" && !gate.canPass) {
    return {
      status: "error",
      message:
        `These marks average ${gate.overall}, and the rubric puts anything below ${threshold} in ` +
        "post-course support. Move the marks or record it as not yet successful.",
    };
  }

  const feedback = text(formData, "feedback");
  if (!feedback) {
    return {
      status: "error",
      message: "Write the feedback. A coach being told they haven't passed is owed the reason.",
    };
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    for (const criterion of SUPPORT_CRITERIA) {
      const rating = marks.get(criterion.code)!;
      const comment = text(formData, `comment_${criterion.code}`) || null;
      await tx.supportRating.upsert({
        where: { attemptId_code: { attemptId, code: criterion.code } },
        create: { attemptId, code: criterion.code, rating, comment },
        update: { rating, comment },
      });
    }

    await tx.supportAttempt.update({
      where: { id: attemptId },
      data: {
        status: "REVIEWED",
        outcome,
        // Computed from the marks, never read from the form.
        rating: gate.overall,
        feedback,
        reviewedAt: now,
        reviewedById: admin.id,
        // A live observation is never "submitted" by the coach, so the moment
        // it was delivered is the moment it was booked for.
        submittedAt: attempt.submittedAt ?? attempt.dueAt ?? now,
      },
    });

    if (outcome === "SUCCESSFUL") {
      await tx.supportCase.update({
        where: { id: attempt.caseId },
        data: { status: "SUCCESSFUL", closedAt: now },
      });
      // The register is where "did they pass?" is answered, so a successful
      // reassessment writes back to it rather than living only on the case.
      await tx.enrollment.updateMany({
        where: { userId: attempt.case.userId, courseId: attempt.case.courseId },
        data: { outcome: "PASSED", rating: gate.overall },
      });
    }
  });

  refreshCase(attempt.caseId);
  revalidatePath("/grades");
  return {
    status: "ok",
    message:
      outcome === "SUCCESSFUL"
        ? "Recorded as successful — the case is closed and the coach can see it."
        : "Recorded. The case stays open for the next assessment.",
  };
}

/* ------------------------------- Closing ---------------------------------- */

export async function closeCase(_prev: SupportState, formData: FormData): Promise<SupportState> {
  const actor = await requireStaff();
  const caseId = text(formData, "caseId");
  const scope = await courseOfCase(caseId);
  if (scope) await assertCourseStaff(actor, scope);
  const status = text(formData, "status");

  if (status !== "UNSUCCESSFUL" && status !== "WITHDRAWN" && status !== "LAPSED") {
    return { status: "error", message: "Choose how this case is being closed." };
  }

  const note = text(formData, "closingNote");
  if (!note) return { status: "error", message: "Write a closing note." };

  const supportCase = await prisma.supportCase.findUnique({
    where: { id: caseId },
    include: { course: { select: { supportDeadline: true } }, extensions: true },
  });
  if (!supportCase) return { status: "error", message: "Case not found." };

  // Lapsing is a fact about the calendar, not a view anybody holds about the
  // coach, so it is checked here rather than taken from the form. The form only
  // offers it when the date has passed; this is what stops it being reachable
  // by any other route while an extension is still running.
  if (status === "LAPSED") {
    const deadline = deadlineInForce(supportCase);
    if (!deadline.date) {
      return {
        status: "error",
        message:
          "This case has no deadline, so it can't have run out of time. Set the cohort's date on " +
          "the course, or one for this coach, before closing it this way.",
      };
    }
    if (!isPastDeadline(deadline.date)) {
      return {
        status: "error",
        message:
          "The deadline hasn't passed yet, so this case hasn't lapsed. Close it another way, or " +
          "wait for the date.",
      };
    }
  }

  await prisma.$transaction(async (tx) => {
    // An assessment that was arranged and never happened is dropped. Film the
    // coach actually submitted is left alone — the case falling out of the
    // queue is enough, and deleting their work to tidy a list is not on.
    await tx.supportAttempt.deleteMany({
      where: { caseId, status: { in: ["SCHEDULED", "AWAITING_VIDEO"] } },
    });
    await tx.supportCase.update({
      where: { id: caseId },
      data: { status, closedAt: new Date(), closingNote: note },
    });
  });

  refreshCase(caseId);
  return { status: "ok", message: "Case closed." };
}

/** Puts a closed case back in play — a decision reversed, or one taken in error. */
export async function reopenCase(formData: FormData) {
  const actor = await requireStaff();
  const caseId = text(formData, "caseId");
  const scope = await courseOfCase(caseId);
  if (scope) await assertCourseStaff(actor, scope);

  await prisma.supportCase.update({
    where: { id: caseId },
    data: { status: "IN_PROGRESS", closedAt: null },
  });

  refreshCase(caseId);
}
