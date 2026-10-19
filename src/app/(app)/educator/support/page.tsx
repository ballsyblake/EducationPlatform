import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/avatar";
import { Badge, EmptyState, PageHeader, StatTile } from "@/components/ui";
import { staffCourseIds } from "@/lib/access";
import { requireStaff } from "@/lib/auth";
import { getSupportWork, inBucket, type SupportItem } from "@/lib/educator";
import { displayName, formatDate } from "@/lib/format";
import { PATHWAY_LABEL } from "@/lib/support-rubric";

export const metadata = { title: "Post-course support" };

/** The deadline badge, which every row carries because every case has a clock. */
function Deadline({ item }: { item: SupportItem }) {
  if (!item.deadline) return <Badge tone="muted">No deadline</Badge>;
  if (item.overdue) {
    const over = Math.abs(item.daysLeft ?? 0);
    return (
      <Badge tone="bad">
        {over} day{over === 1 ? "" : "s"} over
      </Badge>
    );
  }
  return (
    <Badge tone={item.daysLeft !== null && item.daysLeft <= 30 ? "warn" : "muted"}>
      Due {formatDate(item.deadline)}
    </Badge>
  );
}

function CaseRow({ item, detail }: { item: SupportItem; detail?: ReactNode }) {
  const { case: c } = item;
  return (
    <Link
      href={`/admin/support/${c.id}`}
      className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-ink-50"
    >
      <div className="flex min-w-0 items-center gap-3">
        <Avatar user={c.user} size="sm" />
        <div className="min-w-0">
          <p className="font-semibold text-ink-900">{displayName(c.user)}</p>
          <p className="mt-0.5 text-xs text-ink-500">
            {c.course.title}
            {item.attempt ? ` · ${PATHWAY_LABEL[item.attempt.pathway]}` : ""}
          </p>
          {detail && <p className="mt-1 text-sm text-ink-600">{detail}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Deadline item={item} />
        <span className="text-sm font-medium whitespace-nowrap text-maroon-700">Open →</span>
      </div>
    </Link>
  );
}

function Section({
  title,
  blurb,
  items,
  empty,
  row,
}: {
  title: string;
  blurb: string;
  items: SupportItem[];
  empty: string;
  row: (item: SupportItem) => ReactNode;
}) {
  return (
    <section className="mb-10">
      <h2 className="mb-1 text-lg font-semibold text-ink-900">{title}</h2>
      <p className="mb-3 text-sm text-ink-500">{blurb}</p>
      {items.length ? (
        <div className="card divide-y divide-ink-200">{items.map(row)}</div>
      ) : (
        <EmptyState title="Nothing here" description={empty} />
      )}
    </section>
  );
}

/**
 * An educator's post-course support: the coaches they have to go and see, and
 * the film waiting on them.
 *
 * Four piles, in the order they get dealt with, and the arranging itself still
 * happens on the case — which holds the forms, the rubric and the history. The
 * desk at `/admin/support` keeps the program's half of this: referrals,
 * extensions, closed cases and who hasn't passed. An educator needs none of
 * that to do the next thing.
 */
export default async function EducatorSupportPage() {
  const user = await requireStaff();
  const scope = await staffCourseIds(user);
  const items = await getSupportWork(scope);

  const toReview = inBucket(items, "to_review");
  const toSchedule = inBucket(items, "to_schedule");
  const toBook = inBucket(items, "to_book");
  const toChase = inBucket(items, "to_chase");
  const arranged = inBucket(items, "arranged");
  const pastDeadline = items.filter((i) => i.overdue).length;

  return (
    <>
      <PageHeader
        title="Post-course support"
        subtitle="Coaches on your courses being reassessed on a session they deliver — live, or on film."
      />

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatTile
          label="Waiting on you"
          value={toReview.length}
          tone={toReview.length ? "warn" : "good"}
          hint="Film in, or a write-up owed"
        />
        <StatTile
          label="To put a date on"
          value={toSchedule.length}
          tone={toSchedule.length ? "warn" : "good"}
          hint="They've told you when"
        />
        <StatTile
          label="To reach out to"
          value={toBook.length}
          tone={toBook.length ? "warn" : "good"}
          hint="No availability yet"
        />
        <StatTile
          label="Film overdue"
          value={toChase.length}
          tone={toChase.length ? "bad" : "good"}
          hint="Coaches to chase"
        />
        <StatTile
          label="Past the deadline"
          value={pastDeadline}
          tone={pastDeadline ? "bad" : "good"}
          hint={pastDeadline ? "Out of time, still open" : "Nobody is out of time"}
        />
      </div>

      <Section
        title="Waiting on you"
        blurb="Film that has come in, and observations you have been out to and not yet written up. Open the case to rate the delivery against the rubric."
        items={toReview}
        empty="Film lands here as soon as a coach submits it, and an observation the day after you were due to see it."
        row={(item) => (
          <CaseRow
            key={item.case.id}
            item={item}
            detail={
              item.attempt?.pathway === "VIDEO_REVIEW"
                ? `Film submitted ${formatDate(item.attempt.submittedAt)}`
                : `Observed ${formatDate(item.attempt?.dueAt)}${
                    item.attempt?.venue ? ` at ${item.attempt.venue}` : ""
                  }`
            }
          />
        )}
      />

      <Section
        title="A date to set"
        blurb="They have told us when a visit suits. Open the case and book the live assessment, or send them a date for their film."
        items={toSchedule}
        empty="Nobody is waiting on a date."
        row={(item) => (
          <CaseRow
            key={item.case.id}
            item={item}
            detail={
              [item.case.availabilityDay, item.case.availabilityTime].filter(Boolean).join(" · ") ||
              "Availability given, no detail"
            }
          />
        )}
      />

      <Section
        title="To reach out to"
        blurb="No availability on file, so there is nothing to book against yet. Ring them, agree a session you can get to, then set the date on the case."
        items={toBook}
        empty="Every open case has either a date or somebody's availability."
        row={(item) => (
          <CaseRow key={item.case.id} item={item} detail="Hasn't said when a visit suits" />
        )}
      />

      <Section
        title="Film overdue"
        blurb="They were asked for film and the date has gone. Nobody else is going to ask them for it — and if the session can't be filmed, a live assessment can be booked instead."
        items={toChase}
        empty="No film is overdue."
        row={(item) => (
          <CaseRow
            key={item.case.id}
            item={item}
            detail={`Film was due ${formatDate(item.attempt?.dueAt)}`}
          />
        )}
      />

      <Section
        title="Arranged"
        blurb="Booked, or waiting on the coach's film. Nothing to do until the date comes round."
        items={arranged}
        empty="Nothing is booked at the moment."
        row={(item) => (
          <CaseRow
            key={item.case.id}
            item={item}
            detail={
              item.attempt?.status === "AWAITING_VIDEO"
                ? `Film due ${formatDate(item.attempt.dueAt)}`
                : `${formatDate(item.attempt?.dueAt)}${
                    item.attempt?.venue ? ` at ${item.attempt.venue}` : ""
                  }`
            }
          />
        )}
      />
    </>
  );
}
