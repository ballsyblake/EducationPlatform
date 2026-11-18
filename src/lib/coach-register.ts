import "server-only";

import { prisma } from "@/lib/db";
import type { BDiplomaInterest, CoachingStatus } from "@prisma-client";

/**
 * Reading the coach register.
 *
 * The questions this exists to answer are the ones the spreadsheet held the
 * data for and could not be asked: how many coaches hold a C Diploma in Wide
 * Bay, whose licence expires this year, who is rated below the pass mark, who
 * has asked about the B Diploma and not been put on one. Each was a column in
 * the file and none of them was a filter.
 *
 * Separate from `coaches.ts`, which is the same word about a different thing.
 * That file answers "where is this coach up to on the course they are on" and
 * its row is an enrolment; this one answers "who are FQ's coaches" and its row
 * is a person. A coach on no course has no row there at all, and 1,648 of these
 * are on no course.
 */

export type RegisterRow = {
  userId: string;
  name: string | null;
  email: string;
  faNumber: string | null;
  club: string | null;
  /** Whether the club resolved to the affiliate list, or is only what was typed. */
  clubMatched: boolean;
  region: string | null;
  internalRating: number | null;
  ratingSource: string | null;
  coachingStatus: CoachingStatus;
  statusNote: string | null;
  bDiplomaInterest: BDiplomaInterest;
  bDiplomaInterestNote: string | null;
  qualifications: { name: string; completedAt: Date | null; expiresAt: Date | null }[];
  /** The soonest expiry they hold, for the column that sorts on it. */
  nextExpiry: Date | null;
  /** Courses this platform has run them through, which is usually none. */
  enrolments: number;
};

export type RegisterFilters = {
  query?: string;
  qualification?: string;
  region?: string;
  /** "rated", "unrated", or a rating as a string. */
  rating?: string;
  /** "expiring" for a licence lapsing inside twelve months. */
  expiry?: string;
  interest?: string;
};

export type RegisterSummary = {
  coaches: number;
  rated: number;
  withClub: number;
  unmatchedClubs: number;
  interested: number;
  expiringWithin12Months: number;
  byQualification: { name: string; count: number }[];
  byRegion: { region: string; count: number }[];
  /** The last import, so a stale register is visible rather than assumed. */
  lastImport: { source: string | null; at: Date } | null;
};

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * How many rows one page of the register is.
 *
 * There is a page at all because of what happens without one. Reading 1,648
 * records with their qualifications in one query makes Prisma load the nested
 * relation with an `IN` of every record id, and SQLite refuses it — "the query
 * parameter limit supported by your database is exceeded", which is a 500 on
 * the page rather than a slow one. The bound is on the query, not on the
 * render, so the filters have to narrow it in SQL.
 */
const PAGE = 500;

export type RegisterPage = {
  rows: RegisterRow[];
  /** How many coaches match, which is usually more than `rows` holds. */
  total: number;
  /** Whether the table is showing all of them. */
  complete: boolean;
};

/**
 * One page of the register, filtered.
 *
 * Every filter is a `where`, including the two that look like they want to be
 * done in memory. A coach matches the qualification filter by holding one with
 * that name and the expiry filter by holding one lapsing inside twelve months,
 * and `some` says both — which matters because filtering after the read would
 * mean reading everything first, and reading everything is the thing that does
 * not work.
 */
export async function listRegister(
  filters: RegisterFilters = {},
  take = PAGE,
): Promise<RegisterPage> {
  const query = filters.query?.trim();
  const horizon = new Date(Date.now() + YEAR_MS);

  const where = {
    ...(filters.region ? { region: filters.region } : {}),
    ...(filters.rating === "rated" ? { internalRating: { not: null } } : {}),
    ...(filters.rating === "unrated" ? { internalRating: null } : {}),
    ...(filters.rating && !["rated", "unrated"].includes(filters.rating)
      ? { internalRating: Number(filters.rating) }
      : {}),
    ...(filters.interest === "yes" ? { bDiplomaInterest: "YES" as const } : {}),
    ...(filters.interest === "not_asked" ? { bDiplomaInterest: "NOT_ASKED" as const } : {}),
    // Both qualification conditions on one `some` rather than two, so a filter
    // for an expiring B Diploma means one B Diploma that is expiring, not a B
    // Diploma and separately something else lapsing.
    ...(filters.qualification || filters.expiry === "expiring"
      ? {
          qualifications: {
            some: {
              ...(filters.qualification ? { name: filters.qualification } : {}),
              ...(filters.expiry === "expiring" ? { expiresAt: { lte: horizon } } : {}),
            },
          },
        }
      : {}),
    ...(query
      ? {
          user: {
            OR: [
              { name: { contains: query } },
              { email: { contains: query } },
              { faNumber: { contains: query } },
            ],
          },
        }
      : {}),
  };

  const [total, records] = await Promise.all([
    prisma.coachRecord.count({ where }),
    prisma.coachRecord.findMany({
      where,
      take,
      // On the account's name, because the row is a person. Nulls sort last so
      // a record with no name does not head the table.
      orderBy: [{ user: { name: "asc" } }, { user: { email: "asc" } }],
      select: {
        internalRating: true,
        ratingSource: true,
        clubName: true,
        affiliateId: true,
        region: true,
        coachingStatus: true,
        statusNote: true,
        bDiplomaInterest: true,
        bDiplomaInterestNote: true,
        affiliate: { select: { name: true } },
        qualifications: {
          orderBy: { name: "asc" },
          select: { name: true, completedAt: true, expiresAt: true },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            faNumber: true,
            _count: { select: { enrollments: true } },
          },
        },
      },
    }),
  ]);

  const rows: RegisterRow[] = records.map((r) => {
    const expiries = r.qualifications
      .map((q) => q.expiresAt)
      .filter((d): d is Date => !!d)
      .sort((a, b) => a.getTime() - b.getTime());
    return {
      userId: r.user.id,
      name: r.user.name,
      email: r.user.email,
      faNumber: r.user.faNumber,
      // The affiliate's spelling where it matched, because that is the one FQ
      // publish; what was typed where it did not, because that is all there is.
      club: r.affiliate?.name ?? r.clubName,
      clubMatched: !!r.affiliateId,
      region: r.region,
      internalRating: r.internalRating,
      ratingSource: r.ratingSource,
      coachingStatus: r.coachingStatus,
      statusNote: r.statusNote,
      bDiplomaInterest: r.bDiplomaInterest,
      bDiplomaInterestNote: r.bDiplomaInterestNote,
      qualifications: r.qualifications,
      nextExpiry: expiries[0] ?? null,
      enrolments: r.user._count.enrollments,
    };
  });

  return { rows, total, complete: rows.length === total };
}

/** The counts above the table, and the values its filters offer. */
export async function registerSummary(): Promise<RegisterSummary> {
  const horizon = new Date(Date.now() + YEAR_MS);

  const [coaches, rated, withClub, unmatchedClubs, interested, expiring, quals, regions, latest] =
    await Promise.all([
      prisma.coachRecord.count(),
      prisma.coachRecord.count({ where: { internalRating: { not: null } } }),
      prisma.coachRecord.count({ where: { affiliateId: { not: null } } }),
      prisma.coachRecord.count({ where: { affiliateId: null, clubName: { not: null } } }),
      prisma.coachRecord.count({ where: { bDiplomaInterest: "YES" } }),
      // Distinct coaches, not licences: somebody with three lapsing in the
      // same year is one person to write to.
      prisma.coachRecord.count({
        where: { qualifications: { some: { expiresAt: { lte: horizon } } } },
      }),
      prisma.coachQualification.groupBy({
        by: ["name"],
        _count: { name: true },
        orderBy: { _count: { name: "desc" } },
      }),
      prisma.coachRecord.groupBy({
        by: ["region"],
        where: { region: { not: null } },
        _count: { region: true },
        orderBy: { _count: { region: "desc" } },
      }),
      prisma.coachRecord.findFirst({
        orderBy: { importedAt: "desc" },
        select: { source: true, importedAt: true },
      }),
    ]);

  return {
    coaches,
    rated,
    withClub,
    unmatchedClubs,
    interested,
    expiringWithin12Months: expiring,
    byQualification: quals.map((q) => ({ name: q.name, count: q._count.name })),
    byRegion: regions
      .filter((r) => r.region)
      .map((r) => ({ region: r.region!, count: r._count.region })),
    lastImport: latest ? { source: latest.source, at: latest.importedAt } : null,
  };
}
