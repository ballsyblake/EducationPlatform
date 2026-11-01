import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { NewCourseForm } from "./new-course-form";

export const metadata = { title: "New course from an export" };

/**
 * Make a cohort out of a Learning Centre export.
 *
 * The other half of the participant import. FQ's exports arrive before the
 * cohort exists here, and typing the course in first and then importing onto it
 * is the same work done twice — the file already names the qualification, and
 * its file name names the stream and the venue.
 */
export default async function NewCourseFromExportPage() {
  await requireAdmin();

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={{ href: "/admin", label: "Manage" }}
        title="New course from an export"
        subtitle="Read a Learning Centre export, check what it says, and create the cohort with its roster on it."
      />

      <section className="card card-pad">
        <NewCourseForm />
      </section>
    </div>
  );
}
