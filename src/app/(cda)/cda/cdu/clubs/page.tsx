import { EmptyState, PageHeader, StatTile } from "@/components/ui";
import { requireCdu } from "@/lib/cda/access";
import { activeCycle } from "@/lib/cda/assessment";
import { prisma } from "@/lib/db";
import { displayName } from "@/lib/format";
import { AddClubAdminForm, ClubForm } from "./club-forms";
import { ClubRow, type ClubRowData } from "./club-row";

export const metadata = { title: "Clubs" };

export default async function ClubsPage() {
  await requireCdu();
  const cycle = await activeCycle();

  const clubs = await prisma.club.findMany({
    include: {
      members: {
        include: {
          user: {
            include: {
              sessions: { select: { lastSeenAt: true }, orderBy: { lastSeenAt: "desc" }, take: 1 },
            },
          },
        },
      },
      assessments: cycle
        ? { where: { cycleId: cycle.id }, select: { id: true } }
        : { select: { id: true }, take: 0 },
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  const rows: ClubRowData[] = clubs.map((c) => ({
    id: c.id,
    name: c.name,
    zone: c.zone ?? "",
    tier: c.tier ?? "",
    contactName: c.contactName ?? "",
    contactEmail: c.contactEmail ?? "",
    active: c.active,
    assessmentId: c.assessments[0]?.id ?? null,
    members: c.members.map((m) => ({
      id: m.user.id,
      name: displayName(m.user),
      email: m.user.email,
      active: m.user.active,
      lastSeenAt: m.user.sessions[0]?.lastSeenAt ?? null,
    })),
  }));

  const withoutAdmin = rows.filter((r) => r.active && r.members.length === 0).length;

  return (
    <>
      <PageHeader
        title="Clubs"
        subtitle="Every affiliated club, and who administers it."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile label="Clubs" value={rows.filter((r) => r.active).length} hint="Active" />
        <StatTile
          label="Without an administrator"
          value={withoutAdmin}
          tone={withoutAdmin > 0 ? "warn" : "good"}
          hint="Can't submit anything"
        />
        <StatTile label="Inactive" value={rows.filter((r) => !r.active).length} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section>
          {rows.length === 0 ? (
            <EmptyState
              title="No clubs yet"
              description="Add the first affiliated club to start a cycle."
            />
          ) : (
            <div className="card divide-y divide-ink-200">
              {rows.map((club) => (
                <ClubRow key={club.id} club={club} />
              ))}
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <div className="card card-pad">
            <h2 className="mb-4 font-semibold text-ink-900">Add a club</h2>
            <ClubForm />
            {cycle && (
              <p className="hint mt-3">
                New clubs join {cycle.name} straight away and can start entering data.
              </p>
            )}
          </div>

          <div className="card card-pad">
            <h2 className="mb-4 font-semibold text-ink-900">Add a club administrator</h2>
            <AddClubAdminForm clubs={rows.filter((r) => r.active).map((r) => ({ id: r.id, name: r.name }))} />
          </div>
        </aside>
      </div>
    </>
  );
}
