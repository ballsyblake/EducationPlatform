import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { RegisterForm } from "./register-form";

export const metadata = { title: "Action plans from a register" };

/**
 * Action plans and feedback letters, out of a course register.
 *
 * The documents FQ send every coach at the end of a course, which until now
 * were typed one at a time from the register that already holds every word of
 * them: the assessor, the block, the topic, the write-up and the three action
 * steps per delivery are all in the Assessment sheet, and the pass/fail split
 * is in the Attendance sheet's Outcome column.
 *
 * Read-only on purpose. The register is parsed, classified and turned into
 * documents, and nothing is written to the database — importing a register
 * loads real coaches' records and is a separate, deliberate step.
 */
export default async function RegistersPage() {
  await requireAdmin();

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={{ href: "/admin", label: "Manage" }}
        title="Action plans from a register"
        subtitle="Upload a course register, check who needs an action plan and who passed, and download a document for each of them."
      />

      <section className="card card-pad">
        <RegisterForm />
      </section>
    </div>
  );
}
