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
  const failed = items.filter((i) => i.verdict === "FAIL").length;

  return (
    <>
      <PageHeader
        title="Non-Negotiables"
        subtitle="All nine must be met before any shield can be awarded."
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

      <div className="mb-6 card card-pad">
        <p className="text-sm text-ink-700">
          These nine checks decide whether your club is eligible for a rating at all. Answer each
          one honestly — Football Queensland verifies every answer, and a declaration that
          doesn&apos;t hold up costs more than a &quot;not yet&quot; would have.
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
