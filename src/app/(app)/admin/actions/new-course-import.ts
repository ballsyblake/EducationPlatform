"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ensureDiplomaCoursework } from "@/lib/diploma-coursework";
import { applyImport, planNewCourseImport, type ImportPlan } from "@/lib/participants";

/**
 * Creating a cohort out of a Learning Centre export.
 *
 * The same two steps as importing onto a course that exists — preview, then
 * commit — except the preview also stands in for the course: nothing is written
 * until somebody has read who is in the file and agreed to the name the file
 * suggests. The fields come from the form rather than being re-derived here, so
 * what a person edited is what gets created.
 */
export type NewCourseImportState = {
  status: "idle" | "previewed" | "ok" | "error";
  message?: string;
  plan?: ImportPlan;
  /** Set once the cohort exists, so the page can link to it. */
  course?: { id: string; title: string };
};

const MAX_CHARS = 2_000_000;

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

export async function createCourseFromExport(
  _prev: NewCourseImportState,
  formData: FormData,
): Promise<NewCourseImportState> {
  await requireAdmin();

  const commit = formData.get("mode") === "commit";
  const text = String(formData.get("csv") ?? "");
  const title = field(formData, "title");
  const qualification = field(formData, "qualification") || null;

  if (!text.trim()) return { status: "error", message: "Choose an export, or paste one in." };
  if (text.length > MAX_CHARS) {
    return {
      status: "error",
      message: "That file is far larger than a participant export. Check it is the right one.",
    };
  }
  if (!title) return { status: "error", message: "Give the cohort a title." };

  // The title is what the register importer treats as a cohort's identity —
  // Course has no natural unique column — so two cohorts sharing one would make
  // the next import ambiguous rather than merely untidy.
  const clash = await prisma.course.findFirst({ where: { title }, select: { id: true } });
  if (clash) {
    return {
      status: "error",
      message: "A course with that title already exists. Rename this one, or import onto that course instead.",
    };
  }

  const plan = await planNewCourseImport({ title, qualification, firstDay: null }, text);
  if (plan.error) return { status: "error", message: plan.error, plan };

  if (!commit) {
    const { create, enroll, skip } = plan.counts;
    return {
      status: "previewed",
      message: `${plan.rows.length} row${plan.rows.length === 1 ? "" : "s"}: ${create} new account${
        create === 1 ? "" : "s"
      }, ${enroll} already have one, ${skip} skipped.`,
      plan,
    };
  }

  const passMark = Number(field(formData, "ratingThreshold"));
  const course = await prisma.course.create({
    data: {
      title,
      season: field(formData, "season") || null,
      qualification,
      stream: field(formData, "stream") || null,
      location: field(formData, "location") || null,
      ratingThreshold:
        Number.isFinite(passMark) && passMark >= 1 && passMark <= 5 && passMark * 2 === Math.round(passMark * 2)
          ? passMark
          : null,
      // Unpublished. A cohort imported from an export has no days, no team and
      // no coursework dates yet, and publishing it would put an empty course in
      // front of everybody enrolled on it.
      published: false,
    },
  });

  await ensureDiplomaCoursework(prisma, [course.id]);
  const result = await applyImport(course.id, text);

  revalidatePath("/admin");
  revalidatePath("/admin/cohorts");
  revalidatePath("/admin/coaches");
  revalidatePath(`/admin/courses/${course.id}`);

  return {
    status: "ok",
    message: `Created. ${result.created} account${result.created === 1 ? "" : "s"} created, ${
      result.enrolled
    } existing coach${result.enrolled === 1 ? "" : "es"} enrolled, ${result.skipped} skipped.`,
    plan,
    course: { id: course.id, title: course.title },
  };
}
