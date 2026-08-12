import { EmptyState, PageHeader } from "@/components/ui";
import { loadStructure } from "@/lib/cda/assessment";
import { clubContext } from "../club-context";
import { StructureForm } from "./structure-form";

export const metadata = { title: "Club structure" };

/**
 * The club's organisational structure — NN7's raw material.
 *
 * Unlike the rest of the club's submission this one is scored the moment it is
 * entered, and the club is shown the result. That is deliberate: the standard is
 * a published rule rather than an assessor's opinion, so there is nothing to
 * protect by hiding it, and a club that can see "Gold needs a Head of Individual
 * Development" in March can appoint one before the season starts. Every other
 * score in the portal stays hidden until release, because every other score is a
 * judgement.
 */
export default async function ClubStructurePage() {
  const { assessment, checklist } = await clubContext();

  if (!assessment || !checklist) {
    return <EmptyState title="No assessment open" description="Nothing to record yet." />;
  }

  const { roles, result, configured } = await loadStructure(assessment.id);

  return (
    <>
      <PageHeader
        title="Club structure"
        subtitle="The organisational functions Football Queensland assesses for NN7."
        breadcrumb={{ href: "/cda/club", label: "Club overview" }}
      />

      <div className="mb-6 card card-pad space-y-2 text-sm text-ink-700">
        <p>
          NN7 is a <strong>shield-based threshold</strong>: it doesn&apos;t decide whether your club
          is eligible, it sets the highest shield your club can be awarded. Football Queensland is
          introducing the full structure over four years, so the number of functions required rises
          each season.
        </p>
        <p className="text-ink-500">
          Record who holds each function and, where it applies, their coaching qualification. FQ
          counts enrolment in a B Diploma as holding one. Submit your position descriptions and
          team roster alongside this.
        </p>
      </div>

      <StructureForm
        roles={roles}
        result={result}
        configured={configured}
        editable={checklist.editable}
      />
    </>
  );
}
