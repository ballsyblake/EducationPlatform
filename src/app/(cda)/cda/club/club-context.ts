import "server-only";

import { clubCanEdit, currentClub, requireClubUser } from "@/lib/cda/access";
import { activeCycle, ensureAssessment } from "@/lib/cda/assessment";
import { METRIC_SPECS } from "@/lib/cda/rubric";
import { prisma } from "@/lib/db";

/**
 * Everything a club administrator's page needs, in one query set.
 *
 * The assessment row is created on first visit rather than by a batch job, so
 * a club added to the system mid-cycle can start work immediately instead of
 * waiting for the CDU to notice.
 */
export async function clubContext() {
  const user = await requireClubUser();
  const club = await currentClub(user.id);
  const cycle = await activeCycle();

  if (!club || !cycle) return { user, club, cycle, assessment: null, checklist: null } as const;

  await ensureAssessment(club.id, cycle.id);

  const assessment = await prisma.clubAssessment.findUniqueOrThrow({
    where: { clubId_cycleId: { clubId: club.id, cycleId: cycle.id } },
    include: {
      staff: { include: { qualification: true, certificates: true }, orderBy: { name: "asc" } },
      // Retired checks are dropped: a club shouldn't be asked to declare
      // against something FQ has withdrawn, and counting one would leave the
      // checklist permanently short of complete.
      nonNegotiables: {
        where: { nonNegotiable: { active: true } },
        include: { nonNegotiable: true, evidence: true },
        orderBy: { nonNegotiable: { position: "asc" } },
      },
      metrics: true,
      structure: true,
    },
  });

  const declared = assessment.nonNegotiables.filter((n) => n.clubDeclared !== null).length;
  const metricsFilled = assessment.metrics.filter((m) => m.value !== null).length;
  const editable = clubCanEdit(assessment.status);

  const checklist = {
    editable,
    staff: {
      done: assessment.staff.length > 0,
      count: assessment.staff.length,
      // Surfaced separately because it's the one gap a club can fix in a minute
      // and the one that costs them most in the Technical domain.
      missingBlueCards: assessment.staff.filter((s) => !s.blueCard).length,
    },
    nonNegotiables: {
      done: declared === assessment.nonNegotiables.length,
      declared,
      total: assessment.nonNegotiables.length,
    },
    // Counted as done once anything at all is recorded. A club with no Head of
    // Junior has a legitimately incomplete structure and should still be able
    // to submit — what it must not do is submit having never opened the page,
    // because an unrecorded structure computes to NONE and caps the shield at
    // nothing for a reason nobody chose.
    structure: {
      done: assessment.structure.some((e) => e.status !== "ABSENT"),
      filled: assessment.structure.filter((e) => e.status !== "ABSENT").length,
    },
    participation: {
      done: metricsFilled === METRIC_SPECS.length,
      filled: metricsFilled,
      total: METRIC_SPECS.length,
    },
    submitted: !editable,
  };

  return { user, club, cycle, assessment, checklist } as const;
}

export type ClubContext = Awaited<ReturnType<typeof clubContext>>;
