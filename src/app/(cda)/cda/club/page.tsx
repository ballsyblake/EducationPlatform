import Link from "next/link";
import { ShieldBadge } from "@/components/cda/shield";
import { Badge, EmptyState, PageHeader, ProgressBar, StatTile } from "@/components/ui";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { clubContext } from "./club-context";
import { SubmitPanel } from "./submit-panel";

export const metadata = { title: "Club overview" };

const STATUS_COPY: Record<string, { label: string; blurb: string }> = {
  NOT_STARTED: {
    label: "Not started",
    blurb: "Work through the checklist below, then submit to Football Queensland.",
  },
  IN_PROGRESS: {
    label: "In progress",
    blurb: "Keep going — nothing is sent to Football Queensland until you submit.",
  },
  SUBMITTED: {
    label: "Submitted",
    blurb: "Your submission is with Football Queensland and is waiting to be assessed.",
  },
  IN_ASSESSMENT: {
    label: "Being assessed",
    blurb: "FQ assessors are reviewing your club. You'll be notified when the rating is released.",
  },
  RECONCILING: {
    label: "Under review",
    blurb: "Assessment is complete and the Club Development Unit is finalising your result.",
  },
  LOCKED: {
    label: "Finalised",
    blurb: "Your result is finalised and will be released shortly.",
  },
  PUBLISHED: {
    label: "Released",
    blurb: "Your rating for this cycle is available.",
  },
};

export default async function ClubOverviewPage() {
  const { club, cycle, assessment, checklist } = await clubContext();

  if (!club) {
    return (
      <EmptyState
        title="No club linked to your account"
        description="Your account hasn't been linked to a club yet. Contact the Football Queensland Club Development Unit and they'll connect it."
      />
    );
  }

  if (!cycle || !assessment || !checklist) {
    return (
      <EmptyState
        title="No assessment cycle is open"
        description="Football Queensland hasn't opened an assessment cycle yet. You'll be able to start once they do."
      />
    );
  }

  const status = STATUS_COPY[assessment.status] ?? STATUS_COPY.NOT_STARTED;

  // The previous cycle's result, so a club sees where they're coming from
  // rather than a rating with no context.
  const previous = await prisma.clubAssessment.findFirst({
    where: { clubId: club.id, status: "PUBLISHED", cycleId: { not: cycle.id } },
    include: { cycle: true },
    orderBy: { cycle: { year: "desc" } },
  });

  const steps = [
    {
      href: "/cda/club/staff",
      title: "Technical staff register",
      done: checklist.staff.done,
      detail: checklist.staff.count
        ? `${checklist.staff.count} staff entered` +
          (checklist.staff.missingBlueCards
            ? ` · ${checklist.staff.missingBlueCards} without a Blue Card recorded`
            : "")
        : "Nobody entered yet",
      warn: checklist.staff.missingBlueCards > 0,
    },
    {
      href: "/cda/club/non-negotiables",
      title: "Non-Negotiables",
      done: checklist.nonNegotiables.done,
      detail: `${checklist.nonNegotiables.declared} of ${checklist.nonNegotiables.total} answered`,
      warn: false,
    },
    {
      href: "/cda/club/participation",
      title: "Participation figures",
      done: checklist.participation.done,
      detail: `${checklist.participation.filled} of ${checklist.participation.total} entered`,
      warn: false,
    },
  ];

  const completed = steps.filter((s) => s.done).length;

  return (
    <>
      <PageHeader
        title={club.name}
        subtitle={
          <>
            {[club.zone, club.tier].filter(Boolean).join(" · ")} — {cycle.name}
          </>
        }
        action={<Badge tone={assessment.status === "PUBLISHED" ? "good" : "info"}>{status.label}</Badge>}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Submission"
          value={`${completed}/${steps.length}`}
          hint={checklist.submitted ? "Submitted — no further edits" : "Sections complete"}
          tone={completed === steps.length ? "good" : "warn"}
        />
        <StatTile label="Staff on register" value={checklist.staff.count} hint="Technical roles declared" />
        <StatTile
          label="Previous rating"
          value={
            previous ? (
              <ShieldBadge shield={previous.eligible ? (previous.finalShield ?? "NONE") : null} />
            ) : (
              "—"
            )
          }
          hint={previous ? `${previous.cycle.name}` : "No published history"}
        />
      </div>

      <div className="mb-6 card card-pad">
        <p className="text-sm text-ink-700">{status.blurb}</p>
        {assessment.clubSubmittedAt && (
          <p className="mt-1 text-xs text-ink-500">
            Submitted {formatDate(assessment.clubSubmittedAt)}
          </p>
        )}
        {assessment.status === "PUBLISHED" && (
          <Link href="/cda/club/rating" className="btn-primary btn-sm mt-3">
            View our rating
          </Link>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section>
          <h2 className="section-title mb-3">Submission checklist</h2>
          <div className="card divide-y divide-ink-200">
            {steps.map((step) => (
              <Link
                key={step.href}
                href={step.href}
                className="flex items-center gap-4 px-5 py-4 hover:bg-ink-50"
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    step.done ? "bg-status-green-bg text-status-green-fg" : "bg-ink-100 text-ink-500"
                  }`}
                  aria-hidden="true"
                >
                  {step.done ? "✓" : "•"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-ink-900">{step.title}</span>
                  <span className="block text-xs text-ink-500">{step.detail}</span>
                </span>
                {step.warn && <Badge tone="warn">Check</Badge>}
                <span className="text-ink-400" aria-hidden="true">
                  →
                </span>
              </Link>
            ))}
          </div>

          <div className="mt-4">
            <ProgressBar value={(completed / steps.length) * 100} />
          </div>
        </section>

        <aside className="space-y-4">
          <SubmitPanel
            canSubmit={checklist.editable}
            ready={checklist.nonNegotiables.done && checklist.staff.done}
            outstanding={checklist.nonNegotiables.total - checklist.nonNegotiables.declared}
          />

          <div className="card card-pad">
            <h2 className="mb-2 font-semibold text-ink-900">How the rating works</h2>
            <p className="text-sm text-ink-600">
              Football Queensland assesses your club across four areas: your technical staff&apos;s
              qualifications, your planning documents, the delivery your coaches are observed
              giving, and the outcomes your programs produce.
            </p>
            <p className="mt-2 text-sm text-ink-600">
              Alongside that sit {checklist.nonNegotiables.total} Non-Negotiables. Most are pass or
              fail — falling short of one means no shield for the cycle, whatever the rest of the
              assessment says. The shield-based ones instead set a standard for each level, and cap
              the shield you can be awarded rather than ruling you out.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
