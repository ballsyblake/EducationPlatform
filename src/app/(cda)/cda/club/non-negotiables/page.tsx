import { EmptyState, PageHeader, StatTile } from "@/components/ui";
import { clubContext } from "../club-context";
import { Declaration, type DeclarationData } from "./declaration";

export const metadata = { title: "Non-Negotiables" };

export default async function NonNegotiablesPage() {
  const { assessment, checklist } = await clubContext();

  if (!assessment || !checklist) {
    return <EmptyState title="No assessment open" description="Nothing to declare yet." />;
  }

  const items: DeclarationData[] = assessment.nonNegotiables.map((r) => ({
    id: r.id,
    code: r.nonNegotiable.code,
    title: r.nonNegotiable.title,
    description: r.nonNegotiable.description,
    evidenceHint: r.nonNegotiable.evidenceHint,
    kind: r.nonNegotiable.kind,
    format: r.nonNegotiable.format,
    shieldGuidance: r.nonNegotiable.shieldGuidance,
    // Only once verified. Before that the field is empty anyway, but showing a
    // level the CDU is still working on would read as a decision.
    shieldMet: r.verdict === "PASS" ? r.shieldMet : null,
    declared: r.clubDeclared,
    note: r.clubNote ?? "",
    verdict: r.verdict,
    // A club sees the CDU's note only once a verdict has actually been
    // recorded — a working note on a check still being looked at isn't a
    // finding, and showing it as one would have clubs responding to decisions
    // nobody has made.
    adminNote: r.verdict === "PENDING" ? null : r.adminNote,
    evidence: r.evidence.map((e) => ({ id: e.id, filename: e.filename })),
  }));

  const answered = items.filter((i) => i.declared !== null).length;
  const gates = items.filter((i) => i.kind !== "SHIELD_THRESHOLD");
  const thresholds = items.filter((i) => i.kind === "SHIELD_THRESHOLD");
  const failed = gates.filter((i) => i.verdict === "FAIL").length;

  return (
    <>
      <PageHeader
        title="Non-Negotiables"
        subtitle={`${gates.length} must be met before any shield can be awarded; ${thresholds.length} set the level you can reach.`}
        breadcrumb={{ href: "/cda/club", label: "Club overview" }}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Answered"
          value={`${answered}/${items.length}`}
          tone={answered === items.length ? "good" : "warn"}
        />
        <StatTile
          label="Verified pass"
          value={items.filter((i) => i.verdict === "PASS").length}
          tone="good"
        />
        <StatTile
          label="Not met"
          value={failed}
          tone={failed > 0 ? "bad" : "muted"}
          hint={failed > 0 ? "No shield can be awarded" : undefined}
        />
      </div>

      <div className="mb-6 card card-pad space-y-2 text-sm text-ink-700">
        <p>
          Answer each one honestly — Football Queensland verifies every answer, and a declaration
          that doesn&apos;t hold up costs more than a &quot;not yet&quot; would have.
        </p>
        <p>
          The first {gates.length} decide whether your club is eligible for a rating at all: while
          any one of them is missing or incomplete, no shield can be confirmed whatever your club
          scores. The last {thresholds.length} work differently — they set a different standard for
          each shield level, and they cap the shield you can be awarded rather than making you
          ineligible. Football Queensland is phasing those standards in over four years.
        </p>
      </div>

      <div className="space-y-4">
        {items.map((item) => (
          <Declaration key={item.id} item={item} editable={checklist.editable} />
        ))}
      </div>
    </>
  );
}
