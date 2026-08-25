import Link from "next/link";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { displayName, formatDateTime, relativeDue } from "@/lib/format";
import { getSupportCasesForCoach } from "@/lib/support";
import { openAttempt, PATHWAY_LABEL, stageOf } from "@/lib/support-rubric";

export const metadata = { title: "Support" };

export default async function SupportIndexPage() {
  const user = await requireUser();
  const cases = await getSupportCasesForCoach(user.id);

  return (
    <>
      <PageHeader
        title="Post-course support"
        subtitle="Coursework shows what you know. This shows what you do with it on the grass."
      />

      {cases.length ? (
        <div className="space-y-4">
          {cases.map((supportCase) => {
            const stage = stageOf(supportCase);
            const current = openAttempt(supportCase.attempts);
            return (
              <Link
                key={supportCase.id}
                href={`/support/${supportCase.id}`}
                className="card card-pad block hover:shadow-md"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-ink-500">{supportCase.course.title}</p>
                    <p className="font-semibold text-ink-900">
                      {current
                        ? `${PATHWAY_LABEL[current.pathway]} — assessment ${current.attemptNo}`
                        : "Support case"}
                    </p>
                    <p className="mt-1 text-sm text-ink-600">{stage.next}</p>
                  </div>
                  <Badge tone={stage.tone}>{stage.label}</Badge>
                </div>

                {current?.dueAt && supportCase.status === "IN_PROGRESS" && (
                  <p className="mt-3 text-xs text-ink-500">
                    {current.pathway === "LIVE_ASSESSMENT" ? "Session" : "Video due"}{" "}
                    {formatDateTime(current.dueAt)} · {relativeDue(current.dueAt).text}
                    {current.venue ? ` · ${current.venue}` : ""}
                  </p>
                )}

                {supportCase.educator && (
                  <p className="mt-1 text-xs text-ink-500">
                    Your educator: {displayName(supportCase.educator)} ·{" "}
                    {supportCase.educator.email}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="Nothing here — which is good news"
          description="Post-course support is arranged when coursework alone hasn't shown the standard. If you're ever referred, everything you need lands on this page."
          action={
            <Link href="/dashboard" className="btn-secondary btn-sm">
              Back to your dashboard
            </Link>
          }
        />
      )}
    </>
  );
}
