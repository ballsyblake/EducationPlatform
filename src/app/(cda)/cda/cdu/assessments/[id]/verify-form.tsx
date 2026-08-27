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
  /** What the club's recorded data computes to, for checks that compute. */
  shieldMetDerived: Shield | null;
  overrideReason: string | null;
  /** Why the computation fell short of each higher level. */
  derivedFailures: { shield: Shield; met: boolean; failures: string[] }[];
  clubDeclared: boolean | null;
  clubNote: string | null;
  verdict: "PENDING" | "PASS" | "FAIL" | "ON_NOTICE";
  /** Whether this club was already on notice for this standard last season. */
  onNoticeLastCycle: boolean;
  adminNote: string;
  evidence: { id: string; filename: string }[];
};

export function VerifyForm({ item, locked }: { item: VerifyItem; locked: boolean }) {
  const [state, formAction] = useActionState(verifyNonNegotiable, initialState);
  const [verdict, setVerdict] = useState(item.verdict);
  const [note, setNote] = useState(item.adminNote);
  const [level, setLevel] = useState<Shield | "">(item.shieldMet ?? item.shieldMetDerived ?? "");
  const [override, setOverride] = useState(item.overrideReason ?? "");

  const threshold = item.kind === "SHIELD_THRESHOLD";
  // A departure from the computation is the only thing that needs justifying.
  // Agreeing with it needs nothing, which is what keeps the common case fast.
  const departing =
    threshold &&
    (verdict === "PASS" || verdict === "ON_NOTICE") &&
    item.shieldMetDerived !== null &&
    level !== item.shieldMetDerived;

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
          {item.shieldMetDerived !== null && (
            <div className="mt-2 rounded-lg bg-ink-50 px-3 py-2">
              <p className="flex flex-wrap items-center gap-2 text-xs text-ink-700">
                <span className="font-medium">The club&apos;s recorded structure computes to</span>
                <ShieldBadge shield={item.shieldMetDerived} size="sm" short />
              </p>
              {item.derivedFailures
                .filter((c) => !c.met)
                .map((c) => (
                  <p key={c.shield} className="mt-1 text-xs text-ink-600">
                    <span className="font-medium">{c.shield}:</span> {c.failures.join(" ")}
                  </p>
                ))}
            </div>
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
            tone={
              item.verdict === "PASS"
                ? "good"
                : item.verdict === "FAIL"
                  ? "bad"
                  : item.verdict === "ON_NOTICE"
                    ? "warn"
                    : "muted"
            }
          >
            {item.verdict === "PENDING"
              ? "Not verified"
              : item.verdict === "ON_NOTICE"
                ? "On notice"
                : item.verdict}
          </Badge>
          {threshold &&
            (item.verdict === "PASS" || item.verdict === "ON_NOTICE") &&
            (item.shieldMet && item.shieldMet !== "NONE" ? (
              <div className="mt-1.5 flex items-center justify-end gap-1.5">
                <ShieldBadge shield={item.shieldMet} size="sm" />
                <span className="text-xs text-ink-500">standard met</span>
              </div>
            ) : (
              <p className="mt-1.5 text-xs text-ink-500">No standard met</p>
            ))}
          {item.overrideReason && (
            <p className="mt-1 max-w-56 text-xs text-maroon-700">
              Overridden: {item.overrideReason}
            </p>
          )}
        </div>
      </div>

      {!locked && (
        <div className="mt-3 space-y-3 border-t border-ink-200 pt-3">
          <fieldset>
            <legend className="label">Verdict</legend>
            <div className="flex flex-wrap gap-3">
              {((threshold
                ? (["PENDING", "PASS", "ON_NOTICE", "FAIL"] as const)
                : (["PENDING", "PASS", "FAIL"] as const)) as readonly VerifyItem["verdict"][]).map(
                (v) => (
                  <label key={v} className="flex items-center gap-2 text-sm text-ink-700">
                    <input
                      type="radio"
                      name="verdict"
                      value={v}
                      className="h-4 w-4 accent-maroon-600"
                      disabled={v === "ON_NOTICE" && item.onNoticeLastCycle}
                      checked={verdict === v}
                      onChange={() => {
                        setVerdict(v);
                        // The server clears the level on anything that doesn't
                        // keep one, so the control has to clear too. Leaving
                        // Silver selected under "Not verified" would show a cap
                        // that isn't there.
                        if (v !== "PASS" && v !== "ON_NOTICE") setLevel("");
                      }}
                    />
                    {v === "PENDING"
                      ? "Not verified"
                      : v === "PASS"
                        ? threshold
                          ? "Standard met"
                          : "Pass"
                        : v === "ON_NOTICE"
                          ? "On notice"
                          : threshold
                            ? "Met no standard"
                            : "Fail"}
                  </label>
                ),
              )}
            </div>
          </fieldset>

          {item.onNoticeLastCycle && (
            <p className="rounded-lg bg-status-orange-bg px-3 py-2 text-xs text-status-orange-fg">
              This club was on notice for this standard last season. FQ allows that once — a second
              is repeated non-compliance, so the only verdicts left are met or not met.
            </p>
          )}
          {verdict === "ON_NOTICE" && !item.onNoticeLastCycle && (
            <p className="rounded-lg bg-status-orange-bg px-3 py-2 text-xs text-status-orange-fg">
              The club keeps the standard below this season and has until the next assessment to
              meet it. One notice a year, and not the same standard twice.
            </p>
          )}

          {threshold && (verdict === "PASS" || verdict === "ON_NOTICE") && (
            <>
            <input type="hidden" name="shieldMet" value={level} />
            {departing && (
              <div>
                <label className="label" htmlFor={`override-${item.id}`}>
                  Why you&apos;re departing from the computed level{" "}
                  <span className="font-normal text-ink-400">(required)</span>
                </label>
                <textarea
                  id={`override-${item.id}`}
                  name="overrideReason"
                  rows={2}
                  className="input"
                  value={override}
                  onChange={(e) => setOverride(e.target.value)}
                  placeholder="What the recorded structure doesn't capture."
                />
              </div>
            )}
            {!departing && <input type="hidden" name="overrideReason" value="" />}
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
                {verdict === "FAIL" || verdict === "ON_NOTICE"
                  ? "(required — the club sees this)"
                  : "(the club sees this)"}
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
