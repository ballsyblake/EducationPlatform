"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Badge, FormError, FormSuccess, type Tone } from "@/components/ui";
import {
  importParticipants,
  type ParticipantImportState,
} from "../../../actions/participants";
import type { RowPlan, RowPlanKind } from "@/lib/participants";

const initialState: ParticipantImportState = { status: "idle" };

const KIND: Record<RowPlanKind, { label: string; tone: Tone }> = {
  create: { label: "New account", tone: "ok" },
  enroll: { label: "Enrol", tone: "ok" },
  update: { label: "Update", tone: "muted" },
  unchanged: { label: "Already right", tone: "good" },
  skip: { label: "Skipped", tone: "bad" },
};

/**
 * Choose an export, read it, import it.
 *
 * The file's text is held in state rather than left in the file input, for two
 * reasons. React 19 resets an uncontrolled form once an action settles, so the
 * chosen file would be gone the moment the preview came back — and a file input
 * cannot be refilled from script, so "preview then import" would mean choosing
 * the file twice. Reading it here also means paste works, which is what a
 * Windows machine with the export open in Excel actually has to hand.
 */
export function ImportForm({ courseId, hasDays }: { courseId: string; hasDays: boolean }) {
  const [state, formAction] = useActionState(importParticipants, initialState);
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [showText, setShowText] = useState(false);

  const plan = state.plan;
  // A preview of *this* text. Changing the file after a preview must not leave
  // an Import button that would commit something nobody has looked at.
  const previewed = state.status === "previewed" && !!plan;
  const rows = plan?.rows ?? [];
  // Nothing to write is not an import. A re-run of an export that is already
  // loaded previews as all-unchanged, and offering "Import 0 rows" invites
  // somebody to press a button that does nothing and wonder what it did.
  const writes = plan ? plan.counts.create + plan.counts.enroll + plan.counts.update : 0;
  const lineCount = csv.trim() ? csv.trim().split(/\r\n|\r|\n/).length - 1 : 0;

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setCsv(await file.text());
  }

  return (
    <div className="space-y-5">
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="courseId" value={courseId} />
        <input type="hidden" name="csv" value={csv} />

        <div>
          <label className="label" htmlFor="participants-file">
            Participant export (.csv)
          </label>
          <input
            id="participants-file"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => void onFile(e.target.files?.[0])}
            className="block w-full text-sm text-ink-600 file:mr-3 file:rounded-lg file:border-0 file:bg-ink-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink-700 hover:file:bg-ink-200"
          />
          <p className="hint">
            Straight out of the FA learning system — Status, Username, First and Last Name,
            External System Id, Email. Extra columns are ignored, so an event with its own
            prerequisite questions imports the same way.{" "}
            <button
              type="button"
              onClick={() => setShowText((v) => !v)}
              className="font-medium text-maroon-700 hover:underline"
            >
              {showText ? "Hide the text" : "Or paste it instead"}
            </button>
          </p>
        </div>

        {(showText || (csv && !fileName)) && (
          <div>
            <label className="label" htmlFor="participants-text">
              CSV
            </label>
            <textarea
              id="participants-text"
              rows={6}
              value={csv}
              onChange={(e) => {
                setCsv(e.target.value);
                setFileName(null);
              }}
              placeholder='"Status","Username","First Name",…'
              className="input font-mono text-xs"
            />
          </div>
        )}

        {csv.trim() && (
          <p className="text-xs text-ink-500">
            {fileName ? `${fileName} — ` : ""}
            {lineCount} row{lineCount === 1 ? "" : "s"} below the heading.
          </p>
        )}

        <FormError message={state.status === "error" ? state.message : null} />
        <FormSuccess message={state.status === "ok" ? state.message : null} />
        {previewed && (
          <p className="text-sm text-ink-700">
            {state.message}
            {writes === 0 && " Nothing to import — this export is already on the register."}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <SubmitButton
            name="mode"
            value="preview"
            className="btn-secondary"
            pendingLabel="Reading…"
            disabled={!csv.trim()}
          >
            {previewed ? "Read it again" : "Preview"}
          </SubmitButton>
          {previewed && writes > 0 && (
            <SubmitButton
              name="mode"
              value="commit"
              pendingLabel="Importing…"
              confirm={`Import ${plan.counts.create + plan.counts.enroll} coach${
                plan.counts.create + plan.counts.enroll === 1 ? "" : "es"
              } onto this course?`}
            >
              Import {writes} row{writes === 1 ? "" : "s"}
            </SubmitButton>
          )}
        </div>
      </form>

      {plan && !plan.error && (
        <div className="space-y-4 border-t border-ink-200 pt-5">
          {plan.droppedColumns.length > 0 && (
            <p className="text-xs text-ink-500">
              Read but not stored: {plan.droppedColumns.join(", ")}. Nothing in the app has a
              place for them.
            </p>
          )}
          {plan.unknownColumns.length > 0 && (
            <p className="text-xs text-ink-500">
              Columns ignored: {plan.unknownColumns.map((c) => truncate(c)).join("; ")}.
            </p>
          )}
          {!hasDays && (
            <p className="text-xs text-ink-500">
              This cohort has no days on its register yet, so nobody&rsquo;s age can be worked
              out from their date of birth. Add the days and import again to fill them in.
            </p>
          )}

          {rows.length > 0 && <PlanTable rows={rows} />}

          {plan.unmatchedEnrolments.length > 0 && (
            <div>
              <p className="section-title mb-1">On the register, not in the file</p>
              <p className="mb-2 text-xs text-ink-500">
                Left exactly as they are. An import never takes somebody off a register.
              </p>
              <ul className="text-sm text-ink-700">
                {plan.unmatchedEnrolments.map((row) => (
                  <li key={row.email}>
                    {row.name ?? row.email}{" "}
                    <span className="text-ink-500">{row.name ? row.email : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function truncate(text: string, at = 60) {
  return text.length > at ? `${text.slice(0, at)}…` : text;
}

function PlanTable({ rows }: { rows: RowPlan[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-500">
            <th className="py-2 pr-3 font-medium">Line</th>
            <th className="py-2 pr-3 font-medium">Name</th>
            <th className="py-2 pr-3 font-medium">Email</th>
            <th className="py-2 pr-3 font-medium">FA number</th>
            <th className="py-2 pr-3 font-medium">Age</th>
            <th className="py-2 font-medium">What happens</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-200">
          {rows.map((row) => (
            <tr key={row.line} className="align-top">
              <td className="py-2 pr-3 text-xs text-ink-500">{row.line}</td>
              <td className="py-2 pr-3 font-medium text-ink-900">{row.name ?? "—"}</td>
              <td className="py-2 pr-3 text-ink-600">{row.email ?? "—"}</td>
              <td className="py-2 pr-3 text-ink-600">{row.externalId ?? "—"}</td>
              <td className="py-2 pr-3 text-ink-600">{row.ageAtCourse ?? "—"}</td>
              <td className="py-2">
                <Badge tone={KIND[row.kind].tone}>{KIND[row.kind].label}</Badge>
                {row.matchedBy === "externalId" && (
                  <span className="ml-2 text-xs text-ink-500">matched on FA number</span>
                )}
                {(row.problems.length > 0 || row.notes.length > 0) && (
                  <ul className="mt-1 space-y-0.5 text-xs">
                    {row.problems.map((problem) => (
                      <li key={problem} className="text-red-700">
                        {problem}
                      </li>
                    ))}
                    {row.notes.map((note) => (
                      <li key={note} className="text-ink-500">
                        {note}
                      </li>
                    ))}
                  </ul>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
