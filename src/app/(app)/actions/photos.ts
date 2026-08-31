"use server";

import { revalidatePath } from "next/cache";
import { isStaff, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deleteUpload, formatBytes, MAX_PHOTO_BYTES, storeUpload, UploadError } from "@/lib/uploads";

export type PhotoState = { status: "idle" | "ok" | "error"; message?: string };

/**
 * Who may set or remove a coach's photo: coach-education staff, and the coach
 * themselves.
 *
 * Staff because the photo is taken on the day, on the touchline, by the
 * educator running the course — asking twenty-five coaches to upload one
 * beforehand is asking for a register with four photos on it. The coach
 * themselves because it is their likeness, and somebody who wants a different
 * picture of themselves, or none, should not have to ask.
 */
async function requirePhotoRights(userId: string) {
  const actor = await requireUser();
  // Any coach education staff, not just an admin: the educator standing in
  // front of the coach is the one who takes the photo, and they are usually
  // not an admin. Not scoped to a course — a face is a face, and an educator
  // meeting a coach at a catch-up on somebody else's register still needs to
  // be able to add one.
  if (!isStaff(actor) && actor.id !== userId) return null;
  return actor;
}

/** Everywhere a face is shown. Cheap to revalidate, easy to miss one. */
function revalidateFaces() {
  revalidatePath("/admin/coaches");
  revalidatePath("/admin/support");
  revalidatePath("/admin/courses", "layout");
  revalidatePath("/account");
}

export async function setCoachPhoto(_prev: PhotoState, formData: FormData): Promise<PhotoState> {
  const userId = String(formData.get("userId") ?? "").trim();
  const actor = await requirePhotoRights(userId);
  if (!actor) return { status: "error", message: "That isn't yours to change." };

  const subject = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, photoId: true },
  });
  if (!subject) return { status: "error", message: "Account not found." };

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Choose a photo first." };
  }
  if (!file.type.startsWith("image/")) {
    return { status: "error", message: "A photo has to be an image." };
  }
  if (file.size > MAX_PHOTO_BYTES) {
    // The browser shrinks the picture before sending it, so this is a client
    // that didn't rather than a coach who stood too far back.
    return {
      status: "error",
      message: `That's ${formatBytes(file.size)}, and a photo has to come in under ${formatBytes(
        MAX_PHOTO_BYTES,
      )}. Try again from a browser that can resize it.`,
    };
  }

  try {
    const upload = await storeUpload(file);
    await prisma.user.update({ where: { id: userId }, data: { photoId: upload.id } });

    // One current photo, not an album. The old one goes once the new one is
    // pointed at, and the order matters: nothing is deleted until there is
    // something to show in its place.
    if (subject.photoId) await deleteUpload(subject.photoId);
  } catch (error) {
    if (error instanceof UploadError) return { status: "error", message: error.message };
    throw error;
  }

  revalidateFaces();
  return { status: "ok", message: "Photo saved." };
}

export async function removeCoachPhoto(_prev: PhotoState, formData: FormData): Promise<PhotoState> {
  const userId = String(formData.get("userId") ?? "").trim();
  const actor = await requirePhotoRights(userId);
  if (!actor) return { status: "error", message: "That isn't yours to change." };

  const subject = await prisma.user.findUnique({
    where: { id: userId },
    select: { photoId: true },
  });
  if (!subject?.photoId) return { status: "error", message: "There's no photo to remove." };

  // Unpointed first, then deleted: a photo that has been removed should stop
  // being shown even if the delete fails.
  await prisma.user.update({ where: { id: userId }, data: { photoId: null } });
  await deleteUpload(subject.photoId);

  revalidateFaces();
  return { status: "ok", message: "Photo removed." };
}
