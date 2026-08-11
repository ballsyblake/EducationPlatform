"use client";

import { useActionState, useState } from "react";
import { ShieldBadge } from "@/components/cda/shield";
import { SubmitButton } from "@/components/submit-button";
import { Badge, FormError } from "@/components/ui";
import { SHIELD_LABELS } from "@/lib/cda/rubric";
import { THRESHOLD_LEVELS } from "@/lib/cda/scoring";
import { verifyNonNegotiable, type CduFormState } from "../../actions";
import type { Shield } from "@prisma-client";

const initialState: CduFormState = { status: "idle" };

export type VerifyItem = {
  id: string;
  code: string;
  title: string;
  description: string;
  evidenceHint: string | null;
  /** Thresholds are recorded as a level met, not as pass or fail. */
  kind: "GATE" | "SHIELD_THRESHOLD";
  format: string | null;
  shieldGuidance: string | null;
  shieldMet: Shield | null;
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
  const [level, setLevel] = useState<Shield | "">(item.shieldMet ?? "");

  const threshold = item.kind === "SHIELD_THRESHOLD";

  return (
    <form action={formAction} className="px-5 py-4">
      <input type="hidden" name="resultId" value={item.id} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="section-title">{item.code}</span>
            <Badge tone={threshold ? "info" : "muted"}>
              {threshold ? "Caps the shield" : "Blocks the shield"}
            </Badge>
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
          {item.format && (
            <p className="mt-1 text-xs text-ink-500">
              <span className="font-medium">Format:</span> {item.format}
            </p>
          )}
          {item.shieldGuidance && (
            <p className="mt-1 text-xs text-ink-500">
              <span className="font-medium">Standard:</span> {item.shieldGuidance}
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

        <div className="shrink-0 text-right">
          <Badge
            tone={item.verdict === "PASS" ? "good" : item.verdict === "FAIL" ? "bad" : "muted"}
          >
            {item.verdict === "PENDING" ? "Not verified" : item.verdict}
          </Badge>
          {threshold &&
            item.verdict === "PASS" &&
            (item.shieldMet && item.shieldMet !== "NONE" ? (
              <div className="mt-1.5 flex items-center justify-end gap-1.5">
                <ShieldBadge shield={item.shieldMet} size="sm" />
                <span className="text-xs text-ink-500">standard met</span>
              </div>
            ) : (
              <p className="mt-1.5 text-xs text-ink-500">No standard met</p>
            ))}
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
                    onChange={() => {
                      setVerdict(v);
                      // The server clears the level on anything but a pass, so
                      // the control has to clear too. Leaving Silver selected
                      // under "Not verified" would show a cap that isn't there.
                      if (v !== "PASS") setLevel("");
                    }}
                  />
                  {v === "PENDING"
                    ? "Not verified"
                    : v === "PASS"
                      ? threshold
                        ? "Standard met"
                        : "Pass"
                      : threshold
                        ? "Met no standard"
                        : "Fail"}
                </label>
              ))}
            </div>
          </fieldset>

          {threshold && verdict === "PASS" && (
            <>
            <input type="hidden" name="shieldMet" value={level} />
            <fieldset>
              <legend className="label">
                Highest standard met{" "}
                <span className="font-normal text-ink-400">
                  (caps the shield — the club can&apos;t be awarded above this)
                </span>
              </legend>
              <div className="flex flex-wrap gap-2">
                {THRESHOLD_LEVELS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={level === s}
                    onClick={() => setLevel(s)}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                      level === s
                        ? "border-maroon-600 bg-maroon-600 text-white"
                        : "border-ink-300 bg-white text-ink-700 hover:bg-ink-100"
                    }`}
                  >
                    {s === "NONE" ? "None" : SHIELD_LABELS[s]}
                  </button>
                ))}
              </div>
            </fieldset>
            </>
          )}

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
