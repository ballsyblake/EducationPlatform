import "server-only";

import { notFound } from "next/navigation";
import { isAdmin } from "@/lib/auth";
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
    },
  });
  if (!upload) return null;
  if (isAdmin(user)) return upload;

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

  return null;
}
