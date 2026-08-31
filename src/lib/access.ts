import "server-only";

import { notFound } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { visibleEvidenceFor } from "@/lib/cda/access";
import { prisma } from "@/lib/db";
import type { User } from "@prisma-client";

/**
 * Admins see every course; coaches only see published courses they're enrolled
 * in. Anything else is a 404 rather than a 403, so the app never reveals that a
 * course exists to someone who isn't on its roster.
 */
export async function requireCourseAccess(user: User, courseId: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) notFound();

  if (isAdmin(user)) return course;

  const enrolled = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId: user.id, courseId } },
  });
  if (!enrolled || !course.published) notFound();

  return course;
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
