"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Badge, FormError } from "@/components/ui";
import { verifyNonNegotiable, type CduFormState } from "../../actions";

const initialState: CduFormState = { status: "idle" };

export type VerifyItem = {
  id: string;
  code: string;
  title: string;
  description: string;
  evidenceHint: string | null;
  clubDeclared: boolean | null;
  clubNote: string | null;
  verdict: "PENDING" | "PASS" | "FAIL";
  adminNote: string;
  evidence: { id: string; filename: string }[];
};

export function VerifyForm({ item, locked }: { item: VerifyItem; locked: boolean }) {
  const [state, formAction] = useActionState(verifyNonNegotiable, initialState);
  const [verdict, setVerdict] = useState(item.verdict);
  const [note, setNote] = useState(item.adminNote);

  return (
    <form action={formAction} className="px-5 py-4">
      <input type="hidden" name="resultId" value={item.id} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="section-title">{item.code}</span>
            {item.clubDeclared === null ? (
              <Badge tone="warn">Club hasn&apos;t answered</Badge>
            ) : item.clubDeclared ? (
              <Badge tone="muted">Club says yes</Badge>
            ) : (
              <Badge tone="bad">Club says not yet</Badge>
            )}
          </div>
          <h3 className="mt-1 font-semibold text-ink-900">{item.title}</h3>
          <p className="mt-1 text-sm text-ink-600">{item.description}</p>
          {item.evidenceHint && (
            <p className="mt-1 text-xs text-ink-500">
              <span className="font-medium">Expected evidence:</span> {item.evidenceHint}
            </p>
          )}
          {item.clubNote && (
            <p className="mt-2 rounded bg-ink-50 px-3 py-2 text-sm text-ink-700">
              <span className="font-medium">Club note:</span> {item.clubNote}
            </p>
          )}
          {item.evidence.length > 0 && (
            <p className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="text-ink-500">Attached:</span>
              {item.evidence.map((e) => (
                <a
                  key={e.id}
                  href={`/api/files/${e.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-maroon-700 underline"
                >
                  {e.filename}
                </a>
              ))}
            </p>
          )}
        </div>

        <div className="shrink-0">
          <Badge
            tone={item.verdict === "PASS" ? "good" : item.verdict === "FAIL" ? "bad" : "muted"}
          >
            {item.verdict === "PENDING" ? "Not verified" : item.verdict}
          </Badge>
        </div>
      </div>

      {!locked && (
        <div className="mt-3 space-y-3 border-t border-ink-200 pt-3">
          <fieldset>
            <legend className="label">Verdict</legend>
            <div className="flex flex-wrap gap-3">
              {(["PENDING", "PASS", "FAIL"] as const).map((v) => (
                <label key={v} className="flex items-center gap-2 text-sm text-ink-700">
                  <input
                    type="radio"
                    name="verdict"
                    value={v}
                    className="h-4 w-4 accent-maroon-600"
                    checked={verdict === v}
                    onChange={() => setVerdict(v)}
                  />
                  {v === "PENDING" ? "Not verified" : v === "PASS" ? "Pass" : "Fail"}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label className="label" htmlFor={`note-${item.id}`}>
              Note{" "}
              <span className="font-normal text-ink-400">
                {verdict === "FAIL" ? "(required — the club sees this)" : "(the club sees this)"}
              </span>
            </label>
            <textarea
              id={`note-${item.id}`}
              name="adminNote"
              rows={2}
              className="input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                verdict === "FAIL"
                  ? "What was missing, and what the club needs to produce."
                  : "Optional context for the club."
              }
            />
          </div>

          {state.status === "error" && <FormError message={state.message} />}

          <SubmitButton className="btn-secondary btn-sm" pendingLabel="Saving…">
            Record verdict
          </SubmitButton>
        </div>
      )}
    </form>
  );
}
