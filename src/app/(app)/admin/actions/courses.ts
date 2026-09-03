"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deleteUpload, storeUpload, UploadError } from "@/lib/uploads";

export type ActionState = { status: "idle" | "ok" | "error"; message?: string };

/**
 * A course's pass mark on the rubric's 1-5 scale. Blank means the course isn't
 * rated at all, and nobody on it can fall short.
 */
function parsePassMark(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return { value: null as number | null };
  const mark = Number(raw);
  if (!Number.isFinite(mark) || mark < 1 || mark > 5 || mark * 2 !== Math.round(mark * 2)) {
    return { error: "The pass mark has to be between 1 and 5 in half steps, or blank." };
  }
  return { value: mark };
}

function parseDate(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

/* ------------------------------- Courses ---------------------------------- */

export async function createCourse(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { status: "error", message: "Give the course a title." };

  const passMark = parsePassMark(formData.get("ratingThreshold"));

  if (passMark.error) return { status: "error", message: passMark.error };

  const course = await prisma.course.create({
    data: {
      title,
      season: String(formData.get("season") ?? "").trim() || null,
      description: String(formData.get("description") ?? "").trim() || null,
      ratingThreshold: passMark.value,
      published: formData.get("published") === "on",
      authorId: admin.id,
    },
  });

  revalidatePath("/admin");
  redirect(`/admin/courses/${course.id}`);
}

export async function updateCourse(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("courseId"));

  const passMark = parsePassMark(formData.get("ratingThreshold"));

  // A date, read as that day rather than as an instant in the server's zone —
  // it decides whether a coach ran out of time. An unparseable value leaves the
  // date alone for the same reason the pass mark does: this form has no error
  // channel, and silently clearing a cohort's deadline would take every case on
  // it off the overdue list without telling anybody.
  const rawDeadline = String(formData.get("supportDeadline") ?? "").trim();
  const supportDeadline = rawDeadline === "" ? null : new Date(`${rawDeadline}T00:00:00Z`);
  const deadlineUsable =
    supportDeadline === null || !Number.isNaN(supportDeadline.getTime());

  await prisma.course.update({
    where: { id },
    data: {
      title: String(formData.get("title") ?? "").trim() || undefined,
      season: String(formData.get("season") ?? "").trim() || null,
      description: String(formData.get("description") ?? "").trim() || null,
      qualification: String(formData.get("qualification") ?? "").trim() || null,
      stream: String(formData.get("stream") ?? "").trim() || null,
      location: String(formData.get("location") ?? "").trim() || null,
      venue: String(formData.get("venue") ?? "").trim() || null,
      // A value the field rejects leaves the mark as it stands. This form posts
      // straight through without an error channel, and silently clearing a
      // course's pass mark because of a typo would take every coach on it out
      // of the referral list without anyone being told.
      ...(passMark.error ? {} : { ratingThreshold: passMark.value }),
      ...(deadlineUsable ? { supportDeadline } : {}),
      published: formData.get("published") === "on",
    },
  });

  revalidatePath(`/admin/courses/${id}`);
  revalidatePath("/admin");
  revalidatePath("/courses");
  revalidatePath("/admin/support");
  revalidatePath("/grades");
}

export async function deleteCourse(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("courseId"));
  await prisma.course.delete({ where: { id } });
  revalidatePath("/admin");
  redirect("/admin");
}

/* ------------------------------ Enrollment -------------------------------- */

export async function setEnrollment(formData: FormData) {
  await requireAdmin();
  const courseId = String(formData.get("courseId"));
  const userId = String(formData.get("userId"));
  const enrolled = formData.get("enrolled") === "true";

  // The add-a-coach picker starts on a disabled placeholder, and a form
  // submitted before anybody is chosen posts an empty id. Nothing to do rather
  // than a foreign-key error.
  if (!userId) return;

  if (enrolled) {
    await prisma.enrollment.upsert({
      where: { userId_courseId: { userId, courseId } },
      create: { userId, courseId },
      update: {},
    });
  } else {
    await prisma.enrollment.deleteMany({ where: { userId, courseId } });
  }

  revalidatePath(`/admin/courses/${courseId}`);
  revalidatePath("/admin/progress");
}

export async function enrollAllCoaches(formData: FormData) {
  await requireAdmin();
  const courseId = String(formData.get("courseId"));
  // SQLite has no `skipDuplicates`, so filter against the roster we already have.
  const [coaches, existing] = await Promise.all([
    prisma.user.findMany({ where: { role: "COACH", active: true }, select: { id: true } }),
    prisma.enrollment.findMany({ where: { courseId }, select: { userId: true } }),
  ]);

  const enrolled = new Set(existing.map((e) => e.userId));
  const missing = coaches.filter((c) => !enrolled.has(c.id));

  if (missing.length) {
    await prisma.enrollment.createMany({
      data: missing.map((c) => ({ courseId, userId: c.id })),
    });
  }

  revalidatePath(`/admin/courses/${courseId}`);
}

/* ------------------------------- Materials -------------------------------- */

export async function addMaterial(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const courseId = String(formData.get("courseId"));
  const title = String(formData.get("title") ?? "").trim();
  const kind = String(formData.get("kind") ?? "FILE");
  const url = String(formData.get("url") ?? "").trim();
  const file = formData.get("file");

  if (!title) return { status: "error", message: "Give the material a title." };

  if (kind === "FILE") {
    if (!(file instanceof File) || file.size === 0) {
      return { status: "error", message: "Choose a file to upload." };
    }
    try {
      const upload = await storeUpload(file);
      await prisma.material.create({
        data: {
          courseId,
          title,
          description: String(formData.get("description") ?? "").trim() || null,
          kind: "FILE",
          uploadId: upload.id,
          position: await nextMaterialPosition(courseId),
        },
      });
    } catch (error) {
      return {
        status: "error",
        message: error instanceof UploadError ? error.message : "That file couldn't be uploaded.",
      };
    }
  } else {
    if (!/^https?:\/\//i.test(url)) {
      return { status: "error", message: "Enter a full URL starting with http:// or https://" };
    }
    await prisma.material.create({
      data: {
        courseId,
        title,
        description: String(formData.get("description") ?? "").trim() || null,
        kind: kind === "VIDEO" ? "VIDEO" : "LINK",
        url,
        position: await nextMaterialPosition(courseId),
      },
    });
  }

  revalidatePath(`/admin/courses/${courseId}`);
  revalidatePath(`/courses/${courseId}`);
  return { status: "ok", message: `"${title}" added to the library.` };
}

async function nextMaterialPosition(courseId: string) {
  const last = await prisma.material.findFirst({
    where: { courseId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  return (last?.position ?? -1) + 1;
}

export async function deleteMaterial(formData: FormData) {
  await requireAdmin();
  const materialId = String(formData.get("materialId"));
  const courseId = String(formData.get("courseId"));

  const material = await prisma.material.findUnique({ where: { id: materialId } });
  await prisma.material.delete({ where: { id: materialId } });
  if (material?.uploadId) await deleteUpload(material.uploadId);

  revalidatePath(`/admin/courses/${courseId}`);
  revalidatePath(`/courses/${courseId}`);
}

/* ------------------------------ Assignments ------------------------------- */

export async function saveAssignment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const courseId = String(formData.get("courseId"));
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { status: "error", message: "Give the assignment a title." };

  const points = Number(formData.get("points") ?? 100);
  const allowText = formData.get("allowText") === "on";
  const allowFiles = formData.get("allowFiles") === "on";

  if (!allowText && !allowFiles) {
    return { status: "error", message: "Allow a written response, file uploads, or both." };
  }

  const data = {
    title,
    instructions: String(formData.get("instructions") ?? "").trim() || null,
    points: Number.isFinite(points) && points > 0 ? Math.round(points) : 100,
    dueAt: parseDate(formData.get("dueAt")),
    allowText,
    allowFiles,
    published: formData.get("published") === "on",
  };

  if (assignmentId) {
    await prisma.assignment.update({ where: { id: assignmentId }, data });
  } else {
    await prisma.assignment.create({ data: { ...data, courseId } });
  }

  revalidatePath(`/admin/courses/${courseId}`);
  revalidatePath(`/courses/${courseId}`);
  return { status: "ok", message: assignmentId ? "Assignment updated." : `"${title}" posted.` };
}

export async function deleteAssignment(formData: FormData) {
  await requireAdmin();
  const assignmentId = String(formData.get("assignmentId"));
  const courseId = String(formData.get("courseId"));
  await prisma.assignment.delete({ where: { id: assignmentId } });
  revalidatePath(`/admin/courses/${courseId}`);
}

/* --------------------------------- Quizzes -------------------------------- */

export async function saveQuiz(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const courseId = String(formData.get("courseId"));
  const quizId = String(formData.get("quizId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { status: "error", message: "Give the quiz a title." };

  const rawAttempts = String(formData.get("maxAttempts") ?? "1").trim();
  const maxAttempts = rawAttempts === "" || rawAttempts === "0" ? null : Number(rawAttempts);

  const data = {
    title,
    description: String(formData.get("description") ?? "").trim() || null,
    dueAt: parseDate(formData.get("dueAt")),
    maxAttempts: maxAttempts && Number.isFinite(maxAttempts) ? Math.round(maxAttempts) : null,
    published: formData.get("published") === "on",
  };

  if (quizId) {
    await prisma.quiz.update({ where: { id: quizId }, data });
    revalidatePath(`/admin/courses/${courseId}/quizzes/${quizId}`);
  } else {
    const quiz = await prisma.quiz.create({ data: { ...data, courseId } });
    revalidatePath(`/admin/courses/${courseId}`);
    redirect(`/admin/courses/${courseId}/quizzes/${quiz.id}`);
  }

  revalidatePath(`/admin/courses/${courseId}`);
  revalidatePath(`/courses/${courseId}`);
  return { status: "ok", message: "Quiz updated." };
}

export async function deleteQuiz(formData: FormData) {
  await requireAdmin();
  const quizId = String(formData.get("quizId"));
  const courseId = String(formData.get("courseId"));
  await prisma.quiz.delete({ where: { id: quizId } });
  revalidatePath(`/admin/courses/${courseId}`);
  redirect(`/admin/courses/${courseId}`);
}

/* ------------------------------- Questions -------------------------------- */

export async function addQuestion(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const quizId = String(formData.get("quizId"));
  const courseId = String(formData.get("courseId"));
  const prompt = String(formData.get("prompt") ?? "").trim();
  const kind = String(formData.get("kind") ?? "MULTIPLE_CHOICE");
  const points = Math.max(1, Math.round(Number(formData.get("points") ?? 1) || 1));
  const rationale = String(formData.get("rationale") ?? "").trim() || null;

  if (!prompt) return { status: "error", message: "Write the question prompt." };

  const last = await prisma.question.findFirst({
    where: { quizId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const position = (last?.position ?? -1) + 1;

  if (kind === "SHORT_ANSWER") {
    await prisma.question.create({
      data: { quizId, prompt, kind: "SHORT_ANSWER", points, position, rationale },
    });
  } else if (kind === "TRUE_FALSE") {
    const correct = String(formData.get("correctBool") ?? "true");
    await prisma.question.create({
      data: {
        quizId,
        prompt,
        kind: "TRUE_FALSE",
        points,
        position,
        rationale,
        choices: {
          create: [
            { text: "True", isCorrect: correct === "true", position: 0 },
            { text: "False", isCorrect: correct === "false", position: 1 },
          ],
        },
      },
    });
  } else {
    const options = [0, 1, 2, 3]
      .map((i) => String(formData.get(`choice_${i}`) ?? "").trim())
      .map((text, index) => ({ text, index }))
      .filter((c) => c.text.length > 0);

    if (options.length < 2) {
      return { status: "error", message: "Multiple-choice questions need at least two options." };
    }

    const correctIndex = Number(formData.get("correctChoice") ?? 0);
    if (!options.some((o) => o.index === correctIndex)) {
      return { status: "error", message: "Mark which option is correct." };
    }

    await prisma.question.create({
      data: {
        quizId,
        prompt,
        kind: "MULTIPLE_CHOICE",
        points,
        position,
        rationale,
        choices: {
          create: options.map((option, order) => ({
            text: option.text,
            isCorrect: option.index === correctIndex,
            position: order,
          })),
        },
      },
    });
  }

  revalidatePath(`/admin/courses/${courseId}/quizzes/${quizId}`);
  return { status: "ok", message: "Question added." };
}

export async function deleteQuestion(formData: FormData) {
  await requireAdmin();
  const questionId = String(formData.get("questionId"));
  const quizId = String(formData.get("quizId"));
  const courseId = String(formData.get("courseId"));
  await prisma.question.delete({ where: { id: questionId } });
  revalidatePath(`/admin/courses/${courseId}/quizzes/${quizId}`);
}
