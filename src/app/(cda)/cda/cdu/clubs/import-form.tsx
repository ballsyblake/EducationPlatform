"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Badge, FormError, FormSuccess } from "@/components/ui";
import { TEMPLATE_CSV, TEMPLATE_HEADER } from "@/lib/cda/club-import";
import {
  commitClubImport,
  previewClubImport,
  type ImportCommitState,
  type ImportPreviewState,
} from "../actions";

const previewInitial: ImportPreviewState = { status: "idle" };
const commitInitial: ImportCommitState = { status: "idle" };

/**
 * Bulk club import, in two steps.
 *
 * Preview first, always. Thirty-seven clubs is well past what anyone can undo by
 * hand, and the two things most likely to go wrong in a pasted spreadsheet — a
 * shifted column and a duplicate club — are both invisible until you see the
 * parsed rows laid out.
 */
export function ImportClubsForm({ tierCodes }: { tierCodes: string[] }) {
  // Opened by the preview and the commit alike, so a result is never hidden
  // behind a collapsed disclosure the operator has to remember to reopen.
  const [expanded, setExpanded] = useState(false);
  const [preview, previewAction] = useActionState(
    async (prev: ImportPreviewState, formData: FormData) => {
      const result = await previewClubImport(prev, formData);
      setExpanded(true);
      return result;
    },
    previewInitial,
  );
  const [commit, commitAction] = useActionState(
    async (prev: ImportCommitState, formData: FormData) => {
      const result = await commitClubImport(prev, formData);
      setExpanded(true);
      return result;
    },
    commitInitial,
  );
  const [csv, setCsv] = useState("");
  const [open, setOpen] = useState(false);

  const plan = preview.plan;
  const done = commit.status === "ok" || (commit.invites?.length ?? 0) > 0;

  if (done) {
    return (
      <div className="card card-pad space-y-3">
        <h2 className="font-semibold text-ink-900">Import complete</h2>
        {commit.status === "ok" ? (
          <FormSuccess message={commit.message} />
        ) : (
          <FormError message={commit.message} />
        )}

        {commit.invites && commit.invites.length > 0 && (
          <>
            <p className="text-sm text-ink-700">
              Sign&#8209;in links for the {commit.invites.length} administrator
              {commit.invites.length === 1 ? "" : "s"} created. Each works once.{" "}
              <strong>Copy them now</strong> — they aren&apos;t shown again, and a new one
              can&apos;t be issued while these are live.
            </p>

            <textarea
              readOnly
              rows={Math.min(commit.invites.length + 1, 12)}
              className="input font-mono text-xs"
              aria-label="Sign-in links to hand out"
              value={commit.invites
                .map((i) => `${i.club}\t${i.name}\t${i.email}\t${i.url}`)
                .join("\n")}
            />

            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() =>
                navigator.clipboard?.writeText(
                  commit.invites!.map((i) => `${i.club}\t${i.name}\t${i.email}\t${i.url}`).join("\n"),
                )
              }
            >
              Copy all links
            </button>
            <p className="text-xs text-ink-500">
              Tab&#8209;separated, so it pastes straight into a spreadsheet for a mail merge.
            </p>
          </>
        )}

        {/* A reload rather than a state reset, so the club list below is the
            list as it now stands rather than the one from before the import. */}
        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={() => window.location.reload()}
        >
          Import another file
        </button>
      </div>
    );
  }

  return (
    <details
      className="card card-pad"
      open={expanded}
      onToggle={(e) => setExpanded((e.target as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer font-semibold text-ink-900">
        Import clubs from a spreadsheet
      </summary>

      <div className="mt-3 space-y-3">
        <p className="text-sm text-ink-600">
          Paste rows including the header. Existing clubs are updated rather than duplicated, so a
          corrected file can be pasted again.
        </p>

      <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
        <summary className="cursor-pointer text-sm font-medium text-maroon-700">
          Which columns?
        </summary>
        <div className="mt-2 space-y-2 text-xs text-ink-600">
          <p>
            Only <code className="font-mono">name</code> is required. Column order doesn&apos;t
            matter and unrecognised columns are ignored. Copy the cells straight out of Excel or
            save as CSV &mdash; tabs, commas and semicolons all work.
          </p>
          <p className="font-mono break-all text-ink-700">{TEMPLATE_HEADER}</p>
          <p>
            <code className="font-mono">assessment_tier</code> decides which line items the club is
            assessed on &mdash; {tierCodes.join(" or ")}. Leave it blank and the club is assessed on
            the first tier&apos;s items.
          </p>
          <p>
            Give <code className="font-mono">admin_email</code> and the club&apos;s administrator
            account is created in the same pass, with its sign&#8209;in link returned at the end.
          </p>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => setCsv(TEMPLATE_CSV)}
          >
            Fill in an example
          </button>
        </div>
      </details>

      <form action={previewAction} className="space-y-2">
        <textarea
          name="csv"
          rows={8}
          className="input font-mono text-xs"
          placeholder={TEMPLATE_HEADER + "\nBrisbane City FC,Brisbane Metro,NPL,T1,…"}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          aria-label="Club rows to import"
        />
        {preview.status === "error" && <FormError message={preview.message} />}
        <SubmitButton className="btn-secondary btn-sm" pendingLabel="Reading…">
          Preview import
        </SubmitButton>
      </form>

      {plan && (
        <div className="space-y-3 border-t border-ink-200 pt-3">
          <div className="flex flex-wrap gap-2">
            <Badge tone={plan.counts.create > 0 ? "good" : "muted"}>
              {plan.counts.create} to add
            </Badge>
            <Badge tone={plan.counts.update > 0 ? "info" : "muted"}>
              {plan.counts.update} to update
            </Badge>
            <Badge tone={plan.counts.admins > 0 ? "info" : "muted"}>
              {plan.counts.admins} administrator{plan.counts.admins === 1 ? "" : "s"}
            </Badge>
            {plan.problems.length > 0 && (
              <Badge tone="bad">{plan.problems.length} skipped</Badge>
            )}
          </div>

          {plan.notes.length > 0 && (
            <ul className="space-y-1">
              {plan.notes.map((n) => (
                <li key={n} className="text-xs text-ink-600">
                  {n}
                </li>
              ))}
            </ul>
          )}

          {plan.unknownColumns.length > 0 && (
            <p className="text-xs text-ink-500">
              Ignored columns: {plan.unknownColumns.join(", ")}. Check for a typo if one of those
              was meant to import.
            </p>
          )}

          {plan.problems.length > 0 && (
            <ul className="space-y-1">
              {plan.problems.map((p) => (
                <li key={`${p.line}-${p.message}`} className="text-xs text-maroon-700">
                  Line {p.line}: {p.message}
                </li>
              ))}
            </ul>
          )}

          <div className="max-h-72 overflow-y-auto rounded border border-ink-200">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-ink-50">
                <tr className="text-left">
                  <th className="px-2 py-1.5 font-semibold text-ink-500">Club</th>
                  <th className="px-2 py-1.5 font-semibold text-ink-500">Zone</th>
                  <th className="px-2 py-1.5 font-semibold text-ink-500">Tier</th>
                  <th className="px-2 py-1.5 font-semibold text-ink-500">Administrator</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {plan.plans.map((p) => (
                  <tr key={p.row.line}>
                    <td className="px-2 py-1.5">
                      <span className="font-medium text-ink-900">{p.row.name}</span>{" "}
                      <Badge tone={p.club === "create" ? "good" : "info"}>{p.club}</Badge>
                      {p.warnings.map((w) => (
                        <span key={w} className="block text-ink-500">
                          {w}
                        </span>
                      ))}
                    </td>
                    <td className="px-2 py-1.5 text-ink-600">{p.row.zone || "—"}</td>
                    <td className="px-2 py-1.5 text-ink-600">
                      {p.row.tier || "—"}
                      {p.row.assessmentTier && (
                        <span className="ml-1 font-mono text-ink-500">{p.row.assessmentTier}</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-ink-600">
                      {p.row.adminEmail ? (
                        <>
                          {p.row.adminEmail}{" "}
                          {p.admin === "exists" && <Badge tone="muted">has an account</Badge>}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form action={commitAction}>
            <input type="hidden" name="csv" value={preview.csv ?? ""} />
            {commit.status === "error" && <FormError message={commit.message} />}
            <SubmitButton
              className="btn-primary w-full"
              pendingLabel="Importing…"
              confirm={`Import ${plan.counts.create} new and ${plan.counts.update} updated club${
                plan.counts.create + plan.counts.update === 1 ? "" : "s"
              }?`}
            >
              Import {plan.plans.length} club{plan.plans.length === 1 ? "" : "s"}
            </SubmitButton>
          </form>
        </div>
      )}
      </div>
    </details>
  );
}
