"use server";

import { revalidatePath } from "next/cache";
import { assertCourseStaff } from "@/lib/access";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { footageSource, MAX_AT_SECONDS, parseTimecode } from "@/lib/footage";

export type FootageState = { status: "idle" | "ok" | "error"; message?: string };

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

/**
 * The course a piece of footage belongs to, by way of the delivery it is film
 * of and the enrolment that delivery is on.
 *
 * Every action here goes through this before it writes. `requireStaff` says the
 * actor is staff somewhere, which is not the same as staff on the course whose
 * coach is about to be given feedback — the distinction every write in this
 * directory turns on.
 */
async function courseOfFootage(footageId: string) {
  const footage = await prisma.deliveryFootage.findUnique({
    where: { id: footageId },
    select: {
      id: true,
      delivery: { select: { id: true, enrollment: { select: { courseId: true } } } },
    },
  });
  if (!footage) return null;
  return { footage, courseId: footage.delivery.enrollment.courseId };
}

/**
 * Posts film of a delivery for the coach to watch back.
 *
 * The URL is checked for being something a player can do anything with, rather
 * than only for being a URL. An educator who pastes a Google Drive *viewer*
 * link gets told here, where they can fix it, instead of the coach finding a
 * dead embed a week later — and "keep it anyway" is still offered, because a
 * link a coach can open is better than no film even when it can't be seeked.
 */
export async function addFootage(
  _prev: FootageState,
  formData: FormData,
): Promise<FootageState> {
  const actor = await requireStaff();

  const deliveryId = text(formData, "deliveryId");
  const delivery = await prisma.practicalDelivery.findUnique({
    where: { id: deliveryId },
    select: { id: true, enrollment: { select: { courseId: true } } },
  });
  if (!delivery) return { status: "error", message: "That delivery isn't on this coach's record." };
  await assertCourseStaff(actor, delivery.enrollment.courseId);

  const url = text(formData, "url");
  if (!url) {
    return { status: "error", message: "Paste the link to the film." };
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { status: "error", message: "That isn't a link. It should start with https://" };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { status: "error", message: "The link has to be an http or https address." };
  }

  const source = footageSource(url);
  if (source.kind === "unknown" && text(formData, "anyway") !== "1") {
    return {
      status: "error",
      message:
        "That link isn't YouTube, Vimeo or a direct video file, so notes won't be able to jump to a moment in it. " +
        "Tick 'keep it anyway' to post it as a plain link.",
    };
  }

  await prisma.deliveryFootage.create({
    data: {
      deliveryId: delivery.id,
      title: text(formData, "title") || null,
      url: parsed.toString(),
      postedById: actor.id,
    },
  });

  revalidateFor(delivery.enrollment.courseId);
  return { status: "ok", message: "Film posted. The coach can see it on their course page." };
}

/** Takes the film off the record, and its notes with it. */
export async function removeFootage(
  _prev: FootageState,
  formData: FormData,
): Promise<FootageState> {
  const actor = await requireStaff();

  const found = await courseOfFootage(text(formData, "footageId"));
  if (!found) return { status: "error", message: "That film is already gone." };
  await assertCourseStaff(actor, found.courseId);

  await prisma.deliveryFootage.delete({ where: { id: found.footage.id } });

  revalidateFor(found.courseId);
  return { status: "ok", message: "Film removed." };
}

/**
 * Pins a note to a moment, or corrects one already pinned.
 *
 * The timecode is typed rather than captured from the player: the educator
 * writing this up is as likely to be working from a notepad they filled on the
 * grass as scrubbing the video, and a form that only accepts "wherever the
 * playhead is" is useless to the first of those. `parseTimecode` takes both
 * `1:07` and a bare second count.
 */
export async function saveNote(_prev: FootageState, formData: FormData): Promise<FootageState> {
  const actor = await requireStaff();

  const found = await courseOfFootage(text(formData, "footageId"));
  if (!found) return { status: "error", message: "That film isn't on this coach's record." };
  await assertCourseStaff(actor, found.courseId);

  const at = parseTimecode(text(formData, "at"));
  if (at === null) {
    return {
      status: "error",
      message: "Write the moment as minutes and seconds — 1:07, or 1:02:30 for a long recording.",
    };
  }
  if (at > MAX_AT_SECONDS) {
    return { status: "error", message: "That is past the longest recording this will take." };
  }

  const body = text(formData, "body");
  if (!body) {
    return { status: "error", message: "Write the note — the timecode on its own says nothing." };
  }

  const noteId = text(formData, "noteId");
  if (noteId) {
    // Checked against this film rather than trusted: a note id off a form must
    // not be able to rewrite feedback on somebody else's delivery.
    const existing = await prisma.footageNote.findUnique({
      where: { id: noteId },
      select: { id: true, footageId: true },
    });
    if (!existing || existing.footageId !== found.footage.id) {
      return { status: "error", message: "That note isn't on this film." };
    }
    await prisma.footageNote.update({ where: { id: noteId }, data: { atSeconds: at, body } });
  } else {
    await prisma.footageNote.create({
      data: { footageId: found.footage.id, atSeconds: at, body, authorId: actor.id },
    });
  }

  revalidateFor(found.courseId);
  return { status: "ok", message: noteId ? "Note updated." : "Note pinned." };
}

/** Unpins a note. The film and the rest of its notes stay. */
export async function removeNote(_prev: FootageState, formData: FormData): Promise<FootageState> {
  const actor = await requireStaff();

  const note = await prisma.footageNote.findUnique({
    where: { id: text(formData, "noteId") },
    select: {
      id: true,
      footage: { select: { delivery: { select: { enrollment: { select: { courseId: true } } } } } },
    },
  });
  if (!note) return { status: "error", message: "That note is already gone." };
  const courseId = note.footage.delivery.enrollment.courseId;
  await assertCourseStaff(actor, courseId);

  await prisma.footageNote.delete({ where: { id: note.id } });

  revalidateFor(courseId);
  return { status: "ok", message: "Note removed." };
}

/** The assessor's page, the register it feeds, and the coach's own page. */
function revalidateFor(courseId: string) {
  revalidatePath(`/admin/courses/${courseId}/assess`);
  revalidatePath(`/admin/courses/${courseId}/register`);
  revalidatePath(`/courses/${courseId}`);
}
