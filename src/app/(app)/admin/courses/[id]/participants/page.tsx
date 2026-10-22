import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ImportForm } from "./import-form";

export const metadata = { title: "Import participants" };

/**
 * Enrol a cohort from the FA learning system's participant export.
 *
 * Admin only, and a page of its own rather than a form on the course page: an
 * import is a thing somebody does once per cohort with a file in front of them,
 * and it has a preview to read before it writes anything.
 */
export default async function ImportParticipantsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const course = await prisma.course.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      season: true,
      days: { select: { id: true }, take: 1 },
      _count: { select: { enrollments: true } },
    },
  });
  if (!course) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={{ href: `/admin/courses/${course.id}`, label: "Course settings" }}
        title="Import participants"
        subtitle={`${course.title}${course.season ? ` · ${course.season}` : ""} — ${
          course._count.enrollments
        } on the register now`}
        action={
          <Link href={`/admin/courses/${course.id}/register`} className="btn-secondary btn-sm">
            Register
          </Link>
        }
      />

      <section className="card card-pad">
        <ImportForm courseId={course.id} hasDays={course.days.length > 0} />
      </section>
    </div>
  );
}
