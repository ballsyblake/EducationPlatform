import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { STAFF_ROLE_ORDER, STAFF_ROLE_SPECS } from "@/lib/cda/rubric";
import { prisma } from "@/lib/db";
import { clubContext } from "../club-context";
import { StaffForm } from "./staff-form";
import { StaffRow, type StaffRowData } from "./staff-row";

export const metadata = { title: "Staff register" };

function toDateInput(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : "";
}

export default async function StaffPage() {
  const { club, assessment, checklist } = await clubContext();

  if (!club || !assessment || !checklist) {
    return <EmptyState title="No assessment open" description="Nothing to enter yet." />;
  }

  const qualifications = await prisma.qualification.findMany({
    where: { active: true },
    orderBy: [{ stream: "asc" }, { position: "asc" }],
    select: { id: true, label: true, stream: true },
  });

  const rows: StaffRowData[] = assessment.staff.map((s) => ({
    id: s.id,
    name: s.name,
    email: s.email ?? "",
    staffRole: s.staffRole,
    qualificationId: s.qualificationId ?? "",
    qualificationLabel: s.qualification?.label ?? null,
    yearsExperience: String(s.yearsExperience),
    employment: s.employment,
    gender: s.gender,
    blueCard: s.blueCard,
    blueCardExpiry: toDateInput(s.blueCardExpiry),
    notes: s.notes ?? "",
    certificates: s.certificates.map((c) => ({ id: c.id, filename: c.filename })),
  }));

  // Grouped by role, in the rubric's own order, so the roles that carry the
  // most weight sit at the top and a gap in one is obvious at a glance.
  const byRole = STAFF_ROLE_ORDER.map((role) => ({
    role,
    spec: STAFF_ROLE_SPECS[role],
    staff: rows.filter((r) => r.staffRole === role),
  }));

  return (
    <>
      <PageHeader
        title="Technical staff register"
        subtitle="Everyone in a technical role at your club, and the qualifications they hold."
        breadcrumb={{ href: "/cda/club", label: "Club overview" }}
      />

      {!checklist.editable && (
        <div className="mb-6 card card-pad">
          <p className="text-sm text-ink-700">
            Your submission is closed, so the register is read-only. Contact the Club Development
            Unit if something needs correcting.
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="space-y-6">
          {rows.length === 0 && (
            <EmptyState
              title="No staff entered yet"
              description="Add everyone in a technical role — coaches, goalkeeping coaches, your Technical Director and program leads."
            />
          )}

          {byRole.map(
            ({ role, spec, staff }) =>
              staff.length > 0 && (
                <div key={role}>
                  <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="section-title">{spec.label}</h2>
                    <p className="text-xs text-ink-400">
                      {staff.length} entered
                      {staff.length > spec.counted &&
                        ` · best ${spec.counted} count towards the rating`}
                    </p>
                  </div>
                  <div className="card divide-y divide-ink-200">
                    {staff.map((s) => (
                      <StaffRow
                        key={s.id}
                        staff={s}
                        qualifications={qualifications}
                        editable={checklist.editable}
                      />
                    ))}
                  </div>
                </div>
              ),
          )}
        </section>

        <aside className="space-y-4">
          {checklist.editable && (
            <div className="card card-pad">
              <h2 className="mb-4 font-semibold text-ink-900">Add a staff member</h2>
              <StaffForm qualifications={qualifications} compact />
            </div>
          )}

          <div className="card card-pad">
            <h2 className="mb-2 font-semibold text-ink-900">Roles we look for</h2>
            <p className="mb-3 text-sm text-ink-600">
              A role with nobody in it counts as zero for the Technical Qualifications domain, so
              it&apos;s worth entering everyone — including volunteers.
            </p>
            <ul className="space-y-1.5 text-sm">
              {STAFF_ROLE_ORDER.map((role) => {
                const filled = rows.filter((r) => r.staffRole === role).length;
                return (
                  <li key={role} className="flex items-center justify-between gap-2">
                    <span className={filled ? "text-ink-700" : "text-ink-500"}>
                      {STAFF_ROLE_SPECS[role].label}
                    </span>
                    {filled ? (
                      <span className="text-xs text-ink-500">{filled}</span>
                    ) : (
                      <Badge tone="muted">None</Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>
      </div>
    </>
  );
}
