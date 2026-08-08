import { EmptyState, PageHeader } from "@/components/ui";
import { METRIC_SPECS } from "@/lib/cda/rubric";
import { clubContext } from "../club-context";
import { MetricsForm, type MetricValues } from "./metrics-form";

export const metadata = { title: "Participation" };

export default async function ParticipationPage() {
  const { assessment, checklist } = await clubContext();

  if (!assessment || !checklist) {
    return <EmptyState title="No assessment open" description="Nothing to enter yet." />;
  }

  const byKey = new Map(assessment.metrics.map((m) => [m.key, m]));

  const initial: MetricValues = Object.fromEntries(
    METRIC_SPECS.map((spec) => {
      const row = byKey.get(spec.key);
      return [
        spec.key,
        {
          value: row?.value === null || row?.value === undefined ? "" : String(row.value),
          prior:
            row?.priorValue === null || row?.priorValue === undefined ? "" : String(row.priorValue),
        },
      ];
    }),
  );

  return (
    <>
      <PageHeader
        title="Participation figures"
        subtitle="Your registration and retention numbers for this cycle and the last."
        breadcrumb={{ href: "/cda/club", label: "Club overview" }}
      />

      <div className="mb-6 card card-pad">
        <p className="text-sm text-ink-700">
          These figures don&apos;t score on their own — they&apos;re the evidence your assessor
          reads when scoring the Outcomes criteria. Take them from PlayFootball where you can, and
          leave a field blank rather than guessing.
        </p>
      </div>

      <MetricsForm initial={initial} editable={checklist.editable} />
    </>
  );
}
