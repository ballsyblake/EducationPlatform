/**
 * Takes Admin off the people an early run of the importer made admins.
 *
 *   npm run teams:demote                          # says what it would do
 *   npm run teams:demote -- --keep me@fq.com.au   # protect an address too
 *   npm run teams:demote -- --yes                 # does it
 *
 * The importer used to create every course team member as `ADMIN`, on the
 * reading that running a course is an administrative job. It isn't the one the
 * role means here: `ADMIN` is the whole program, and — until `User.cdu` was
 * split out — it silently carried the Club Development Unit with it, which is
 * every club's assessment and evidence. Nine course teams were loaded that way.
 *
 * The importer now creates them as `EDUCATOR`, but its update branch only
 * touches the name — deliberately, so re-importing a register never overwrites
 * a role somebody has since set on purpose. That leaves the people created by
 * the earlier runs as admins forever unless something goes and says otherwise.
 * This is that something, and it exists once rather than as a migration because
 * a migration cannot read `ADMIN_EMAILS` and would have no way to tell a real
 * admin from an accident.
 *
 * Who is touched: an `ADMIN` who sits on at least one course team and is *not*
 * in `ADMIN_EMAILS`. Everything else is left alone. A genuine program admin who
 * also runs a course is exactly the case that rule protects, which is why the
 * dry run prints every name and why `--yes` is required.
 *
 * `cdu` goes with the role. It is already inert on a non-admin — `isCdu()`
 * checks both — but leaving it set means promoting that person to admin one day
 * quietly hands them the Unit again, which is the trapdoor the grant was split
 * out to close.
 */
import "dotenv/config";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "../generated/prisma/client.ts";
import { createAdapter } from "../src/lib/adapter.ts";

export const DEMOTE_MARKER = "course-teams-demoted";

/**
 * Addresses this must never touch: `ADMIN_EMAILS`, plus anything named with
 * `--keep`.
 *
 * The flag exists because `ADMIN_EMAILS` is the list of accounts the bootstrap
 * *creates*, which is not always the list of people who are admins — somebody
 * promoted on the Staff page since is an admin nothing in the environment knows
 * about, and if they happen to run a course this would quietly take it off
 * them. The dry run is what surfaces that; this is what acts on it.
 */
function protectedEmails(extra: string[] = []): Set<string> {
  return new Set(
    [...(process.env.ADMIN_EMAILS ?? "").split(","), ...extra]
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export type DemotionCandidate = {
  id: string;
  email: string;
  name: string | null;
  teams: number;
  cdu: boolean;
};

/** Who would change, and who is deliberately left alone. */
export async function findCourseTeamAdmins(prisma: PrismaClient, extraKeep: string[] = []) {
  const keep = protectedEmails(extraKeep);

  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", courseStaffRoles: { some: {} } },
    select: {
      id: true,
      email: true,
      name: true,
      cdu: true,
      _count: { select: { courseStaffRoles: true } },
    },
    orderBy: { email: "asc" },
  });

  const rows = admins.map((a) => ({
    id: a.id,
    email: a.email,
    name: a.name,
    teams: a._count.courseStaffRoles,
    cdu: a.cdu,
  }));

  return {
    demote: rows.filter((r) => !keep.has(r.email.toLowerCase())),
    protected: rows.filter((r) => keep.has(r.email.toLowerCase())),
    /** True when ADMIN_EMAILS is unset, which makes the guard meaningless. */
    unguarded: keep.size === 0,
  };
}

export async function demoteCourseTeams(
  prisma: PrismaClient,
  opts: { dry?: boolean; keep?: string[] } = {},
) {
  const { demote, protected: kept, unguarded } = await findCourseTeamAdmins(prisma, opts.keep);

  for (const row of kept) {
    console.log(`[teams] keeping ${row.email} — protected.`);
  }

  if (unguarded) {
    // Not fatal on a machine with no environment file, but on a deployed host
    // it means the one guard against demoting the only admin is switched off.
    console.warn("[teams] ADMIN_EMAILS is not set — nothing is protected from this.");
  }

  if (demote.length === 0) {
    console.log("[teams] no course team members are admins. Nothing to do.");
    return { changed: 0, demote };
  }

  for (const row of demote) {
    console.log(
      `[teams] ${opts.dry ? "would demote" : "demoting"} ${row.email}` +
        ` (${row.name ?? "no name"}) — ${row.teams} team${row.teams === 1 ? "" : "s"}` +
        `${row.cdu ? ", and taking the Club Development Unit off them" : ""}`,
    );
  }

  if (opts.dry) {
    console.log(`[teams] dry run — ${demote.length} would change. Re-run with --yes.`);
    return { changed: 0, demote };
  }

  await prisma.user.updateMany({
    where: { id: { in: demote.map((r) => r.id) } },
    data: { role: "EDUCATOR", cdu: false },
  });

  console.log(`[teams] demoted ${demote.length} to Educator.`);
  return { changed: demote.length, demote };
}

async function main() {
  const dry = !process.argv.includes("--yes");

  // --keep a@b.com --keep c@d.com, or one comma-separated list. Both, because
  // whoever reaches for this will be reading a dry run and typing quickly.
  const keep: string[] = [];
  for (let i = 0; i < process.argv.length; i += 1) {
    if (process.argv[i] === "--keep" && process.argv[i + 1]) {
      keep.push(...process.argv[i + 1].split(","));
    }
  }

  const prisma = new PrismaClient({ adapter: createAdapter() });
  try {
    await demoteCourseTeams(prisma, { dry, keep });
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("[teams] failed:", error);
    process.exitCode = 1;
  });
}
