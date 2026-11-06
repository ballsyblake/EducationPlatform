"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Badge, FormError, FormSuccess, type Tone } from "@/components/ui";
import type { CoachPlan, CoachPlanKind } from "@/lib/coach-db";
import { importCoachDb, type CoachDbImportState } from "../actions/coach-db";

/**
 * Choose the workbook, read it, look at the plan, import it.
 *
 * The initial state lives here rather than beside the action: a `"use server"`
 * file may only export async functions, and exporting an object next to them
 * fails at module evaluation and takes the whole page down — see the trap in
 * `CLAUDE.md`.
 */
const initialState: CoachDbImportState = { status: "idle" };

const KIND_LABEL: Record<CoachPlanKind, string> = {
  create: "New account",
  attach: "Add a record",
  update: "Update",
  unchanged: "Already right",
  skip: "Skipped",
};

const KIND_TONE: Record<CoachPlanKind, Tone> = {
  create: "good",
  attach: "info",
  update: "warn",
  unchanged: "muted",
  skip: "bad",
};

const ORDER: CoachPlanKind[] = ["skip", "update", "attach", "create", "unchanged"];

function Row({ row }: { row: CoachPlan }) {
  return (
    <tr className="align-top">
      <td className="px-4 py-2">
        <span className="font-medium text-ink-800">{row.name ?? "—"}</span>
        <div className="text-xs text-ink-500">
          {row.email ?? "no address"}
          {row.faNumber ? ` · fa.${row.faNumber}` : ""}
          {row.accountEmail ? ` · account is ${row.accountEmail}` : ""}
        </div>
      </td>
      <td className="px-3 py-2">
        <Badge tone={KIND_TONE[row.kind]}>{KIND_LABEL[row.kind]}</Badge>
      </td>
      <td className="px-3 py-2 text-xs text-ink-600">
        {row.club ?? "—"}
        {row.clubMatch === "none" && row.club && (
          <span className="ml-1 text-status-orange-fg">unmatched</span>
        )}
      </td>
      <td className="px-3 py-2 tabular-nums">{row.rating ?? "—"}</td>
      <td className="px-3 py-2 text-center tabular-nums">{row.qualifications}</td>
      <td className="px-3 py-2 text-xs text-ink-600">
        {row.problems.map((p) => (
          <div key={p} className="text-maroon-700">
            {p}
          </div>
        ))}
        {row.changes.map((c) => (
          <div key={c.field}>
            <span className="text-ink-500">{c.field}:</span> {c.from} → {c.to}
          </div>
        ))}
        {row.notes.map((n) => (
          <div key={n} className="text-ink-500">
            {n}
          </div>
        ))}
      </td>
    </tr>
  );
}

export function CoachDbImportForm() {
  const [state, formAction] = useActionState(importCoachDb, initialState);
  const [fileName, setFileName] = useState<string | null>(null);
  const plan = state.plan;
  const parsed = state.parsed;
  const previewed = state.status === "previewed" && !!plan && !!parsed;
  // Nothing to write is not an import. A re-run of a workbook already loaded
  // previews as all-unchanged, and offering "Import 0 coaches" invites
  // somebody to press a button that does nothing and wonder what it did.
  const writes = plan ? plan.counts.create + plan.counts.attach + plan.counts.update : 0;

  // The interesting rows first. 1,648 of 1,676 are "already right" on a
  // re-import, and a table that leads with them is a table nobody scrolls.
  const rows = plan
    ? [...plan.rows].sort(
        (a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.line - b.line,
      )
    : [];
  const shown = rows.filter((r) => r.kind !== "unchanged").slice(0, 300);

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-4">
        {/*
          The parse travels back rather than the file. React 19 clears an
          uncontrolled input once the action settles and a file input cannot be
          refilled from script, so without this the Import button would have
          nothing to import and the workbook would have to be chosen twice.
        */}
        {parsed && <input type="hidden" name="parsed" value={JSON.stringify(parsed)} />}

        <div>
          <label className="label" htmlFor="coach-db-file">
            Coach database (.xlsx)
          </label>
          <input
            id="coach-db-file"
            type="file"
            name="workbook"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="input"
            onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
          />
          <p className="mt-1 text-xs text-ink-500">
            The workbook as it is kept — the <code>main</code> sheet, the FALC export, the FQ Data
            ratings, the affiliate list and the B Diploma expressions of interest. Other tabs are
            listed below and read from only where it says so.
            {fileName ? ` Chosen: ${fileName}.` : ""}
            {previewed
              ? " The box clears once the workbook has been read; the import below uses what it parsed, so there is no need to choose it again."
              : ""}
          </p>
        </div>

        <FormError message={state.status === "error" ? state.message : null} />
        <FormSuccess message={state.status === "ok" ? state.message : null} />
        {previewed && (
          <p className="text-sm text-ink-700">
            {state.message}
            {writes === 0 && " Nothing to import — the register already matches this workbook."}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <SubmitButton
            name="mode"
            value="preview"
            className="btn-secondary"
            pendingLabel="Reading the workbook…"
          >
            {plan ? "Read it again" : "Read the workbook"}
          </SubmitButton>
          {previewed && writes > 0 && (
            <SubmitButton
              name="mode"
              value="commit"
              pendingLabel="Importing…"
              confirm={`Import ${writes} coach${writes === 1 ? "" : "es"} into the register? ${
                plan.counts.create
              } account${plan.counts.create === 1 ? "" : "s"} would be created.`}
            >
              Import {writes} coach{writes === 1 ? "" : "es"}
            </SubmitButton>
          )}
        </div>
      </form>

      {plan && !plan.error && (
        <div className="space-y-5 border-t border-ink-200 pt-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {ORDER.map((kind) => (
              <div key={kind} className="card card-pad">
                <p className="text-xs text-ink-500">{KIND_LABEL[kind]}</p>
                <p className="text-xl font-semibold tabular-nums text-ink-900">
                  {plan.counts[kind]}
                </p>
              </div>
            ))}
          </div>

          <p className="text-sm text-ink-700">
            {plan.ratings.total} coach{plan.ratings.total === 1 ? "" : "es"} carry an internal
            rating — {plan.ratings.new} the register does not hold yet
            {plan.ratings.changed ? `, ${plan.ratings.changed} that would change` : ""}.{" "}
            {plan.affiliates.create} club{plan.affiliates.create === 1 ? "" : "s"} to add,{" "}
            {plan.affiliates.update} to update, of {plan.affiliates.total} on the affiliate list.
          </p>

          {plan.warnings.map((warning) => (
            <p
              key={warning}
              className="rounded-lg bg-status-orange-bg px-3 py-2 text-sm text-status-orange-fg"
            >
              {warning}
            </p>
          ))}

          {plan.skippedSheets.length > 0 && (
            <div className="card card-pad">
              <h3 className="text-sm font-semibold text-ink-900">Sheets this does not read</h3>
              <dl className="mt-2 space-y-2 text-xs text-ink-600">
                {plan.skippedSheets.map((sheet) => (
                  <div key={sheet.name}>
                    <dt className="font-medium text-ink-800">
                      {sheet.name} — {sheet.rows} rows
                    </dt>
                    <dd>{sheet.reason}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {plan.absent.length > 0 && (
            <div className="card card-pad">
              <h3 className="text-sm font-semibold text-ink-900">
                On the register, not in this workbook
              </h3>
              <p className="mt-1 text-xs text-ink-600">
                {plan.absent.length} coach{plan.absent.length === 1 ? "" : "es"}. Left exactly as
                they are — a row deleted from a spreadsheet is not somebody&rsquo;s record being
                withdrawn, and this import never removes one.
              </p>
              <ul className="mt-2 space-y-0.5 text-xs text-ink-600">
                {plan.absent.slice(0, 40).map((coach) => (
                  <li key={coach.email}>
                    {coach.name ?? coach.email}
                    {coach.rating !== null && (
                      <span className="text-status-orange-fg"> · rated {coach.rating}</span>
                    )}
                  </li>
                ))}
              </ul>
              {plan.absent.length > 40 && (
                <p className="mt-1 text-xs text-ink-500">
                  and {plan.absent.length - 40} more.
                </p>
              )}
            </div>
          )}

          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink-900">
              What the workbook would do
            </h3>
            {shown.length ? (
              <div className="card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-500">
                    <tr>
                      <th className="px-4 py-2 font-medium">Coach</th>
                      <th className="px-3 py-2 font-medium">Plan</th>
                      <th className="px-3 py-2 font-medium">Club</th>
                      <th className="px-3 py-2 font-medium">Rating</th>
                      <th className="px-3 py-2 font-medium">Quals</th>
                      <th className="px-3 py-2 font-medium">Changes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-200">
                    {shown.map((row) => (
                      <Row key={row.line} row={row} />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-ink-500">
                Every coach in the workbook already matches the register.
              </p>
            )}
            {rows.length - rows.filter((r) => r.kind === "unchanged").length > shown.length && (
              <p className="mt-2 text-xs text-ink-500">
                Showing the first {shown.length} rows that would change. The{" "}
                {plan.counts.unchanged} already right are not listed.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
