"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Badge, FormError, FormSuccess } from "@/components/ui";
import { declareNonNegotiable, type ClubFormState } from "../actions";

const initialState: ClubFormState = { status: "idle" };

export type DeclarationData = {
  id: string;
  code: string;
  title: string;
  description: string;
  evidenceHint: string | null;
  declared: boolean | null;
  note: string;
  verdict: "PENDING" | "PASS" | "FAIL";
  adminNote: string | null;
  evidence: { id: string; filename: string }[];
};

export function Declaration({ item, editable }: { item: DeclarationData; editable: boolean }) {
  const [state, formAction] = useActionState(declareNonNegotiable, initialState);

  // Controlled, so a rejected save doesn't discard the note they just wrote.
  const [declared, setDeclared] = useState(
    item.declared === null ? "" : item.declared ? "yes" : "no",
  );
  const [note, setNote] = useState(item.note);

  return (
    <div className="card card-pad">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="section-title">{item.code}</span>
            {item.verdict === "PASS" && <Badge tone="good">Verified — pass</Badge>}
            {item.verdict === "FAIL" && <Badge tone="bad">Verified — fail</Badge>}
            {item.verdict === "PENDING" && declared !== "" && (
              <Badge tone="muted">Awaiting FQ verification</Badge>
            )}
            {declared === "" && <Badge tone="warn">Not answered</Badge>}
          </div>
          <h3 className="mt-1 font-semibold text-ink-900">{item.title}</h3>
          <p className="mt-1 text-sm text-ink-600">{item.description}</p>
          {item.evidenceHint && (
            <p className="mt-2 text-xs text-ink-500">
              <span className="font-medium">Evidence:</span> {item.evidenceHint}
            </p>
          )}
        </div>
      </div>

      {item.adminNote && (
        <div className="mt-3 rounded-lg bg-maroon-50 px-3 py-2">
          <p className="text-xs font-semibold tracking-wide text-maroon-800 uppercase">
            Football Queensland
          </p>
          <p className="mt-0.5 text-sm text-maroon-800">{item.adminNote}</p>
        </div>
      )}

      {item.evidence.length > 0 && (
        <p className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="text-ink-500">Attached:</span>
          {item.evidence.map((e) => (
            <a
              key={e.id}
              href={`/api/files/${e.id}`}
              target="_blank"
              rel="noreferrer"
              className="text-maroon-700 underline hover:text-maroon-800"
            >
              {e.filename}
            </a>
          ))}
        </p>
      )}

      {editable ? (
        <form action={formAction} className="mt-4 space-y-3 border-t border-ink-200 pt-4">
          <input type="hidden" name="resultId" value={item.id} />

          <fieldset>
            <legend className="label">Does your club meet this?</legend>
            <div className="flex gap-4">
              {[
                { value: "yes", label: "Yes" },
                { value: "no", label: "Not yet" },
              ].map((option) => (
                <label key={option.value} className="flex items-center gap-2 text-sm text-ink-700">
                  <input
                    type="radio"
                    name="declared"
                    value={option.value}
                    className="h-4 w-4 accent-maroon-600"
                    checked={declared === option.value}
                    onChange={(e) => setDeclared(e.target.value)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label className="label" htmlFor={`note-${item.id}`}>
              Note <span className="font-normal text-ink-400">(optional)</span>
            </label>
            <textarea
              id={`note-${item.id}`}
              name="clubNote"
              rows={2}
              className="input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Where the evidence is held, or what you're still working on."
            />
          </div>

          <div>
            <label className="label" htmlFor={`evidence-${item.id}`}>
              Attach evidence <span className="font-normal text-ink-400">(optional)</span>
            </label>
            <input
              id={`evidence-${item.id}`}
              name="evidence"
              type="file"
              className="input"
              accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
            />
          </div>

          {state.status === "error" && <FormError message={state.message} />}
          {state.status === "ok" && <FormSuccess message={state.message} />}

          <SubmitButton className="btn-secondary btn-sm" pendingLabel="Saving…">
            Save answer
          </SubmitButton>
        </form>
      ) : (
        <div className="mt-4 border-t border-ink-200 pt-4">
          <p className="text-sm text-ink-700">
            <span className="font-medium">Your declaration:</span>{" "}
            {item.declared === null ? "Not answered" : item.declared ? "Yes" : "Not yet"}
          </p>
          {item.note && <p className="mt-1 prose-note">{item.note}</p>}
        </div>
      )}
    </div>
  );
}
