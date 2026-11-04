"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Badge, FormError, type Tone } from "@/components/ui";
import {
  awaitingJudgement,
  countVerdicts,
  VERDICT_LABEL,
  type RegisterCoach,
  type RegisterVerdict,
} from "@/lib/register-file";
import { reviewRegister, type RegisterReviewState } from "../actions/registers";

/**
 * Upload a register, read what it says, download the documents.
 *
 * The initial state lives here rather than beside the action: a `"use server"`
 * file may only export async functions, and exporting an object next to them
 * fails at module evaluation and takes the whole page down — see the trap in
 * `CLAUDE.md`.
 */
const initialState: RegisterReviewState = { status: "idle" };

const VERDICT_TONE: Record<RegisterVerdict, Tone> = {
  passed: "good",
  action_plan: "warn",
  incomplete: "info",
  unrated: "muted",
};

function Row({ coach }: { coach: RegisterCoach }) {
  return (
    <tr>
      <td className="px-4 py-2">
        <span className="font-medium text-ink-800">{coach.name}</span>
        {coach.track === "CATCH_UP" && (
          <span className="ml-2 text-xs text-ink-500">catch-up</span>
        )}
        {coach.club && <div className="text-xs text-ink-500">{coach.club}</div>}
      </td>
      <td className="px-3 py-2 tabular-nums">{coach.rating ?? "—"}</td>
      <td className="px-3 py-2 text-ink-600">{coach.outcome ?? "—"}</td>
      <td className="px-3 py-2 text-center tabular-nums">{coach.deliveries.length}</td>
      <td className="px-3 py-2">
        <Badge tone={VERDICT_TONE[coach.verdict]}>{VERDICT_LABEL[coach.verdict]}</Badge>
      </td>
      <td className="px-3 py-2 text-xs text-ink-500">{coach.reason}</td>
    </tr>
  );
}

export function RegisterForm() {
  const [state, formAction] = useActionState(reviewRegister, initialState);
  const [fileName, setFileName] = useState<string | null>(null);
  const register = state.register;
  const counts = register ? countVerdicts(register.coaches) : null;
  // Coaches the register has written up but not yet rated or signed off.
  const awaiting = register?.coaches.filter(awaitingJudgement).length ?? 0;

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-4">
        <div>
          <label className="label" htmlFor="register-file">
            Course register (.xlsx)
          </label>
          <input
            id="register-file"
            type="file"
            name="register"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="input"
            onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
          />
          <p className="mt-1 text-xs text-ink-500">
            The register itself, as it is kept — Course Info, Attendance and Assessment sheets.
            Nothing is saved: the file is read, and the documents are built from it.
            {fileName ? ` Chosen: ${fileName}.` : ""}
            {/*
              React 19 clears an uncontrolled input once the action settles and
              a file input cannot be refilled from script, so the box reads
              "no file chosen" the moment the table appears. It is not needed
              again — the downloads below are built from what was parsed — but
              an empty box over a full table looks like something went wrong.
            */}
            {register
              ? " The box clears once the register has been read; the downloads below come from what it parsed, so there is no need to choose it again."
              : ""}
          </p>
        </div>
        <FormError message={state.status === "error" ? state.message : null} />
        <SubmitButton pendingLabel="Reading the register…">Read the register</SubmitButton>
      </form>

      {register && counts && (
        <div className="space-y-5 border-t border-ink-200 pt-5">
          <div>
            <h2 className="text-lg font-semibold text-ink-900">
              {register.qualification ?? "Course"}
              {register.location ? ` — ${register.location}` : ""}
            </h2>
            <p className="text-sm text-ink-500">
              {[register.courseDates, register.sourceFile].filter(Boolean).join(" · ")} ·{" "}
              {register.coaches.length} coaches ·{" "}
              {register.staff.length
                ? register.staff.map((s) => s.name).join(", ")
                : "no staff named"}
            </p>
          </div>

          {register.warnings.map((warning) => (
            <p
              key={warning}
              className="rounded-lg bg-status-orange-bg px-3 py-2 text-sm text-status-orange-fg"
            >
              {warning}
            </p>
          ))}

          <p className="text-sm text-ink-600">
            Pass mark {register.passMark} on the register&rsquo;s 1&ndash;5 rating.{" "}
            <strong>{counts.action_plan}</strong> need an action plan,{" "}
            <strong>{counts.passed}</strong> passed, <strong>{counts.incomplete}</strong> are
            rated at the pass mark but not signed off, and <strong>{counts.unrated}</strong>{" "}
            have no rating. The last two groups get no document.
          </p>

          <div className="overflow-x-auto rounded-xl border border-ink-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-200 bg-ink-50 text-left text-xs font-semibold text-ink-700">
                  <th className="px-4 py-2">Coach</th>
                  <th className="px-3 py-2">Rating</th>
                  <th className="px-3 py-2">Register outcome</th>
                  <th className="px-3 py-2 text-center">Deliveries</th>
                  <th className="px-3 py-2">Gets</th>
                  <th className="px-3 py-2">Why</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-200">
                {register.coaches.map((coach) => (
                  <Row key={`${coach.track}-${coach.position}-${coach.name}`} coach={coach} />
                ))}
              </tbody>
            </table>
          </div>

          {/*
            The register travels back as the JSON it parsed to, so pressing a
            download button does not mean uploading fifty megabytes again. It is
            revalidated in the route.
          */}
          <form
            action="/admin/registers/export"
            method="post"
            encType="multipart/form-data"
            className="flex flex-wrap items-center gap-3"
          >
            <input type="hidden" name="register" value={JSON.stringify(register)} />
            <button
              type="submit"
              name="kind"
              value="all"
              className="btn-primary"
              disabled={!counts.action_plan && !counts.passed}
            >
              Download {counts.action_plan + counts.passed === 1
                ? "the one document"
                : `all ${counts.action_plan + counts.passed} documents`}
            </button>
            <button
              type="submit"
              name="kind"
              value="action-plans"
              className="btn-secondary"
              disabled={!counts.action_plan}
            >
              Action plans only ({counts.action_plan})
            </button>
            <button
              type="submit"
              name="kind"
              value="feedback"
              className="btn-secondary"
              disabled={!counts.passed}
            >
              Feedback only ({counts.passed})
            </button>
            {/*
              Mid-course, the Rating and Outcome columns are empty and nobody is
              either passed or failed, so the two buttons above come out at
              zero while every delivery on the register is written up. These are
              the documents the CETs make the judgement on.
            */}
            {awaiting > 0 && (
              <button type="submit" name="kind" value="awaiting" className="btn-secondary">
                Not yet judged ({awaiting})
              </button>
            )}
          </form>
          <p className="text-xs text-ink-500">
            A zip of Word files, one per coach, plus a summary of the table above. The six-area
            rubric and the total out of 18 come out blank for the CETs to tick: no 2026 register
            carries a rubric score, and nothing here converts the 1&ndash;5 rating into one.
          </p>
        </div>
      )}
    </div>
  );
}
