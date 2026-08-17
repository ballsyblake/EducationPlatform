import { EmptyState, PageHeader, StatTile } from "@/components/ui";
import { ASSESSOR_POOL_WHERE, requireCdu } from "@/lib/cda/access";
import { activeCycle } from "@/lib/cda/assessment";
import { prisma } from "@/lib/db";
import { displayName } from "@/lib/format";
import { AddClubAdminForm, ClubForm } from "./club-forms";
import { ClubRow, type ClubRowData } from "./club-row";
import { ImportClubsForm } from "./import-form";

export const metadata = { title: "Clubs" };

export default async function ClubsPage() {
  await requireCdu();
  const cycle = await activeCycle();

  const tiers = await prisma.tier.findMany({
    orderBy: { position: "asc" },
    select: { id: true, code: true, name: true },
  });
  const tierCodes = tiers.map((t) => t.code);
  const tierName = new Map(tiers.map((t) => [t.id, t.name]));

  // Everyone who can hold a line item, with how many clubs they already look
  // after — spreading a portfolio evenly is impossible from a list that doesn't
  // say who is already carrying what.
  const ambassadorPool = await prisma.user.findMany({
    where: { ...ASSESSOR_POOL_WHERE, active: true },
    select: {
      id: true,
      name: true,
      email: true,
      _count: { select: { ambassadorFor: true } },
    },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });
  const ambassadors = ambassadorPool.map((u) => ({
    id: u.id,
    name: displayName(u),
    clubs: u._count.ambassadorFor,
  }));

  const clubs = await prisma.club.findMany({
    include: {
      ambassadors: { include: { user: { select: { id: true, name: true, email: true } } } },
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
    assessmentTierId: c.tierId ?? "",
    assessmentTierName: c.tierId ? (tierName.get(c.tierId) ?? "") : "",
    ambassadorIds: c.ambassadors.map((a) => a.user.id),
    ambassadorNames: c.ambassadors.map((a) => displayName(a.user)),
    members: c.members.map((m) => ({
      id: m.user.id,
      name: displayName(m.user),
      email: m.user.email,
      active: m.user.active,
      lastSeenAt: m.user.sessions[0]?.lastSeenAt ?? null,
    })),
  }));

  const withoutAdmin = rows.filter((r) => r.active && r.members.length === 0).length;
  const withoutCda = rows.filter((r) => r.active && r.ambassadorIds.length === 0).length;

  return (
    <>
      <PageHeader
        title="Clubs"
        subtitle="Every affiliated club, and who administers it."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Clubs" value={rows.filter((r) => r.active).length} hint="Active" />
        <StatTile
          label="Without an administrator"
          value={withoutAdmin}
          tone={withoutAdmin > 0 ? "warn" : "good"}
          hint="Can't submit anything"
        />
        <StatTile
          label="Without a CDA"
          value={withoutCda}
          tone={withoutCda > 0 ? "warn" : "good"}
          hint="Nobody can assess them"
        />
        <StatTile label="Inactive" value={rows.filter((r) => !r.active).length} />
      </div>

      {/* Full width, not in the sidebar: the preview is the whole point of the
          two-step import, and thirty-seven rows of it are unreadable in a third
          of a column. Collapsed until asked for, so it doesn't crowd the page. */}
      <div className="mb-6">
        <ImportClubsForm tierCodes={tierCodes} />
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
                <ClubRow
                  key={club.id}
                  club={club}
                  tiers={tiers}
                  ambassadors={ambassadors}
                />
              ))}
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <div className="card card-pad">
            <h2 className="mb-4 font-semibold text-ink-900">Add a club</h2>
            <ClubForm tiers={tiers} />
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
