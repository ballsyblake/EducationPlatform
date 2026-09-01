import "server-only";

import { notFound, redirect } from "next/navigation";
import { homePathFor, isAdmin, isStaff } from "@/lib/auth";
import { visibleEvidenceFor } from "@/lib/cda/access";
import { prisma } from "@/lib/db";
import type { User } from "@prisma-client";

/**
 * Admins see every course; educators see the ones they are rostered onto;
 * coaches only see published courses they're enrolled in. Anything else is a
 * 404 rather than a 403, so the app never reveals that a course exists to
 * someone who isn't on its roster.
 */
export async function requireCourseAccess(user: User, courseId: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) notFound();

  if (isAdmin(user)) return course;

  if (isStaff(user)) {
    const rostered = await prisma.courseStaff.findFirst({
      where: { courseId, userId: user.id },
      select: { id: true },
    });
    if (rostered) return course;
    // Falls through: an educator can also be enrolled on a course as a coach,
    // and being on somebody else's roster is not a reason to lose that.
  }

  const enrolled = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId: user.id, courseId } },
  });
  if (!enrolled || !course.published) notFound();

  return course;
}

/**
 * The courses this account may act on as staff, or `null` for "every course".
 *
 * Null rather than a list of every id, because the two mean different things to
 * a query: an admin's scope is the absence of a filter, and materialising it as
 * ids would turn every page into a query that silently breaks the day somebody
 * adds a course. Callers spread it — `where: { ...courseScope(ids) }`.
 */
export async function staffCourseIds(user: Pick<User, "id" | "role">): Promise<string[] | null> {
  if (isAdmin(user)) return null;
  if (!isStaff(user)) return [];

  const seats = await prisma.courseStaff.findMany({
    where: { userId: user.id },
    select: { courseId: true },
  });
  return [...new Set(seats.map((s) => s.courseId))];
}

/** A Prisma `where` fragment for a course id column, given that scope. */
export function courseScope(ids: string[] | null, column = "courseId") {
  return ids === null ? {} : { [column]: { in: ids } };
}

/**
 * Acting on one course as staff: an admin anywhere, an educator where they are
 * rostered.
 *
 * Every action that writes to a register, a grade, a rating or a support case
 * goes through this. `requireStaff` alone is not enough — it says the actor is
 * staff somewhere, which is not the same as staff *here*, and the difference is
 * the whole point of the role.
 */
export async function isCourseStaff(user: User, courseId: string): Promise<boolean> {
  if (isAdmin(user)) return true;
  if (!isStaff(user)) return false;
  const rostered = await prisma.courseStaff.findFirst({
    where: { courseId, userId: user.id },
    select: { id: true },
  });
  return Boolean(rostered);
}

/**
 * The same, as a gate.
 *
 * Redirects rather than returning an error, matching `requireAdmin`: an actor
 * who is not staff on this course did not make a mistake worth explaining to
 * them, and a message that says "you may not touch this course" confirms the
 * course exists.
 */
export async function assertCourseStaff(user: User, courseId: string): Promise<void> {
  if (!(await isCourseStaff(user, courseId))) redirect(homePathFor(user));
}

/** True when the user may read a stored file. */
export async function canAccessUpload(user: User, uploadId: string) {
  const upload = await prisma.upload.findUnique({
    where: { id: uploadId },
    include: {
      material: { select: { courseId: true } },
      submissionFileOf: { select: { userId: true, assignment: { select: { courseId: true } } } },
      supportAttemptOf: { select: { case: { select: { userId: true } } } },
      staffCertificateOf: { select: { assessmentId: true } },
      nonNegotiableProofOf: { select: { assessmentId: true } },
      photoOf: { select: { id: true } },
    },
  });
  if (!upload) return null;
  if (isAdmin(user)) return upload;

  // A coach's photo: theirs, and coach-education staff's — who are admins and
  // returned above. Checked first and returning outright, so it can never fall
  // through to a rule written for a different kind of file: a club
  // administrator or an assessor has no business with a coach's likeness, and
  // one coach has none with another's.
  if (upload.photoOf) {
    return upload.photoOf.id === user.id ? upload : null;
  }

  // Course material: readable by anyone enrolled in that course.
  if (upload.material) {
    const enrolled = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: user.id, courseId: upload.material.courseId } },
    });
    return enrolled ? upload : null;
  }

  // Submission attachment: readable by its author only.
  if (upload.submissionFileOf) {
    return upload.submissionFileOf.userId === user.id ? upload : null;
  }

  // Post-course support: the session plan a coach attached to a delivery being
  // reassessed. Theirs and their educator's — and every educator is an admin,
  // who returned above.
  if (upload.supportAttemptOf) {
    return upload.supportAttemptOf.case.userId === user.id ? upload : null;
  }

  // CDA evidence — a staff qualification certificate or a Non-Negotiable
  // attachment. Both are readable by the club that uploaded it and by an
  // assessor assigned to that assessment; an assessor who has since been
  // unassigned loses access along with everything else about the club.
  const assessmentId =
    upload.staffCertificateOf?.assessmentId ?? upload.nonNegotiableProofOf?.assessmentId;

  if (assessmentId) {
    if (user.role === "ASSESSOR") {
      // A Non-Negotiable attachment is never an assessor's to read: they don't
      // score Non-Negotiables, the Unit verifies them. Checked before anything
      // else, so the file can't be fetched by URL after being taken off the
      // page.
      if (upload.nonNegotiableProofOf) return null;

      const assessment = await prisma.clubAssessment.findUnique({
        where: { id: assessmentId },
        select: { poolId: true, clubId: true },
      });
      if (!assessment?.poolId) return null;

      // Three conditions, matching the page this file is reached from: the club
      // is in their portfolio, they hold a line item in its pool, and that item
      // is one the staff register is evidence for. A qualification certificate
      // carries somebody's name and credentials, so an assessor whose items
      // don't turn on the register has no reason to open one.
      const [ambassador, holds] = await Promise.all([
        prisma.clubAmbassador.findUnique({
          where: { clubId_userId: { clubId: assessment.clubId, userId: user.id } },
          select: { id: true },
        }),
        visibleEvidenceFor(user.id, assessment.poolId),
      ]);
      return ambassador && holds.has("STAFF") ? upload : null;
    }

    if (user.role === "CLUB") {
      const assessment = await prisma.clubAssessment.findUnique({
        where: { id: assessmentId },
        select: { clubId: true },
      });
      if (!assessment) return null;
      const membership = await prisma.clubMembership.findUnique({
        where: { userId_clubId: { userId: user.id, clubId: assessment.clubId } },
      });
      return membership ? upload : null;
    }

    return null;
  }

  return null;
}
