import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { Badge, PageHeader } from "@/components/ui";
import { staffCourseIds } from "@/lib/access";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  DELIVERY_AREAS,
  DELIVERY_LEVELS,
  MAX_DELIVERY_POINTS,
  outcomeFor,
  thresholdsFor,
  totalPoints,
} from "@/lib/delivery-rubric";
import { displayName, formatDate } from "@/lib/format";
import { DEFAULT_RATING_THRESHOLD } from "@/lib/support-rubric";
import { AssessmentForm, CourseRatingForm, type DeliveryEntry } from "./assessment-form";

export const metadata = { title: "Delivery assessment" };

/** The numbering the action plan is written with, taken back off for editing. */
function planSteps(actionPlan: string | null) {
  if (!actionPlan) return [];
  return actionPlan
    .split("\n")
    .map((line) => line.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter(Boolean);
}

/**
 * The assessment of one coach's delivery — Football Australia's own form.
 *
 * This is where "Write up →" on the grading queue goes. It used to go to the
 * course's assessor page, which is a register with a roll on it and twenty-five
 * names to open; an educator who had just watched one coach deliver arrived at
 * the paperwork for everybody else. This page is one coach, one session, laid
 * out the way the C Diploma assessment form is laid out: who watched, when and
 * what, the rubric, the evidence, the action plan, the outcome.
 *
 * It writes the same `PracticalDelivery` the course page writes, through the
 * same action, so a delivery scored here shows on the register, on the course
 * page and on the coach's own record without anything being kept in step by
 * hand.
 */
export default async function DeliveryAssessmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ enrollmentId: string }>;
  searchParams: Promise<{ delivery?: string }>;
}) {
  const user = await requireStaff();
  const { enrollmentId } = await params;
  const { delivery: openDeliveryId } = await searchParams;

  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      user: true,
      course: { include: { staff: { orderBy: { position: "asc" } } } },
      deliveries: {
        orderBy: { deliveryNo: "asc" },
        include: { scores: true },
      },
    },
  });

  // 404 rather than 403: an educator who isn't on this course has no business
  // learning that this enrolment exists.
  const scope = await staffCourseIds(user);
  if (!enrollment || (scope !== null && !scope.includes(enrollment.courseId))) notFound();

  const coach = {
    id: enrollment.id,
    name: displayName(enrollment.user),
    email: enrollment.user.email,
    photoId: enrollment.user.photoId,
    rating: enrollment.rating,
    outcome: enrollment.outcome,
    comments: enrollment.registerComments,
  };

  const deliveries: DeliveryEntry[] = enrollment.deliveries.map((d) => ({
    id: d.id,
    deliveryNo: d.deliveryNo,
    assessor: d.assessor,
    block: d.block,
    session: d.session,
    component: d.component,
    topic: d.topic,
    deliveredOn: d.deliveredOn ? d.deliveredOn.toISOString().slice(0, 10) : null,
    comment: d.comment,
    actions: planSteps(d.actionPlan),
    rating: d.rating,
    scores: Object.fromEntries(d.scores.map((s) => [s.code, s.score])),
  }));

  // Which delivery the form opens on: the one asked for, otherwise a blank one.
  // Arriving from the queue means a session was just watched, and defaulting to
  // the last write-up would have an assessor correcting March's session when
  // they meant to write up today's.
  const open = openDeliveryId ? deliveries.find((d) => d.id === openDeliveryId) : undefined;
  if (openDeliveryId && !open) notFound();

  const thresholds = thresholdsFor(enrollment.course);
  const ratingThreshold = enrollment.course.ratingThreshold ?? DEFAULT_RATING_THRESHOLD;

  // Who a delivery can be written up as: the course team as the register names
  // them, and the person signed in — who may be standing in for somebody.
  const me = displayName(user);
  const assessors = [...new Set([me, ...enrollment.course.staff.map((s) => s.name)])];

  return (
    <>
      <PageHeader
        breadcrumb={{ href: "/educator/grading", label: "Grading" }}
        title={coach.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{enrollment.course.title}</span>
            {enrollment.clubName && <span>· {enrollment.clubName}</span>}
            {enrollment.track === "CATCH_UP" && <span>· catching up</span>}
          </span>
        }
        action={
          <Link
            href={`/admin/courses/${enrollment.courseId}/assess`}
            className="btn-secondary btn-sm"
          >
            The whole course →
          </Link>
        }
      />

      {/* The form's own header block, as the assessment form prints it: the
          coach's name across the top, and the facts about the session under it. */}
      <div className="card mb-6 overflow-hidden">
        <div className="flex items-center gap-3 border-b border-ink-200 bg-ink-50 px-5 py-4">
          <Avatar user={coach} size="md" />
          <div className="min-w-0">
            <p className="headline text-lg text-ink-900">{coach.name}</p>
            <p className="text-xs tracking-[0.08em] text-ink-500 uppercase">Coach</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge tone={deliveries.length ? "ok" : "muted"}>
              {deliveries.length} deliver{deliveries.length === 1 ? "y" : "ies"} on record
            </Badge>
          </div>
        </div>

        <div className="px-5 py-4">
          <p className="text-sm text-ink-500">
            {open
              ? `Correcting delivery ${open.deliveryNo}. What you save replaces it on the register.`
              : `A new write-up. Everything you save here is on ${coach.name.split(" ")[0]}'s record, the course register and their own course page.`}
          </p>
        </div>
      </div>

      {/* The rating guide, as the form prints it above the scoresheet. Rendered
          from the rubric rather than typed out, so the guide an assessor reads
          and the scores the form accepts cannot drift apart. */}
      <section className="mb-6">
        <h2 className="section-title mb-2">Assessment rating guide</h2>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50 text-left">
                <th className="px-4 py-2 font-semibold text-ink-700">Score</th>
                <th className="px-4 py-2 font-semibold text-ink-700">Level</th>
                <th className="px-4 py-2 font-semibold text-ink-700">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-200">
              {DELIVERY_LEVELS.map((level) => (
                <tr key={level.score}>
                  <td className="px-4 py-2 font-semibold text-ink-900">{level.score}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-ink-700">{level.label}</td>
                  <td className="px-4 py-2 text-ink-600">{level.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-ink-200 bg-ink-50 px-4 py-3 text-xs text-ink-600">
            Six areas, {MAX_DELIVERY_POINTS} points in all, scored on a best fit of what the
            session showed — not averaged across the areas.{" "}
            {thresholds.level
              ? `A ${thresholds.level} Diploma needs ${thresholds.competent} to be competent, and ${thresholds.highlyCompetent} for highly competent.`
              : `Nothing on this course names its diploma, so the C Diploma's lines are being
                 applied: ${thresholds.competent} to be competent, ${thresholds.highlyCompetent} for highly competent.`}
          </div>
        </div>
      </section>

      <AssessmentForm
        coach={coach}
        delivery={open}
        assessors={assessors}
        defaultAssessor={me}
        thresholds={{
          competent: thresholds.competent,
          highlyCompetent: thresholds.highlyCompetent,
        }}
      />

      <section className="mt-10">
        <h2 className="mb-1 text-lg font-semibold text-ink-900">The course&apos;s word on this coach</h2>
        <p className="mb-3 text-sm text-ink-500">
          Separate from the session above, and the other half of what this queue is counting. The
          course rating is a judgement across everything {coach.name.split(" ")[0]} delivered
          rather than a total of their sessions, it moves the outcome on the register with it, and
          it is set at the end of the course.
        </p>
        <CourseRatingForm coach={coach} threshold={ratingThreshold} />
      </section>

      {deliveries.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-1 text-lg font-semibold text-ink-900">Already on the record</h2>
          <p className="mb-3 text-sm text-ink-500">
            Open one to correct it. Everything here is {coach.name.split(" ")[0]}&apos;s to read on
            their own course page.
          </p>
          <div className="card divide-y divide-ink-200">
            {deliveries.map((entry) => {
              const scored = totalPoints(new Map(Object.entries(entry.scores)));
              const outcome = scored.complete
                ? outcomeFor(scored.points, thresholds)
                : null;
              return (
                <Link
                  key={entry.id}
                  href={`/educator/grading/${coach.id}?delivery=${entry.id}`}
                  className={`flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-ink-50 ${
                    open?.id === entry.id ? "bg-ink-50" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink-900">
                      Delivery {entry.deliveryNo}
                      {entry.topic ? ` — ${entry.topic}` : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {[
                        entry.deliveredOn && formatDate(new Date(`${entry.deliveredOn}T12:00:00Z`)),
                        entry.block,
                        entry.session,
                        entry.component,
                        entry.assessor && `by ${entry.assessor}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {scored.scored > 0 && (
                      <Badge tone={outcome?.tone ?? "muted"}>
                        {scored.points} / {MAX_DELIVERY_POINTS}
                        {outcome ? ` · ${outcome.label}` : ` · ${scored.scored} of ${DELIVERY_AREAS.length} areas`}
                      </Badge>
                    )}
                    {entry.rating !== null && <Badge>{entry.rating.toFixed(1)} on the register</Badge>}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
