"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FormError, FormSuccess } from "@/components/ui";
import { setClubLogo, type CduFormState } from "../actions";

const initial: CduFormState = { status: "idle" };

/**
 * The club's crest, as it will appear on the rating document.
 *
 * Shown at roughly the size it prints rather than as a thumbnail, because the
 * failure this is most likely to produce is a crest that looks fine in a list
 * and illegible on the cover of the document a club receives.
 */
export function ClubLogoForm({ clubId, name, logoId }: { clubId: string; name: string; logoId: string | null }) {
  const [state, formAction] = useActionState(setClubLogo, initial);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-4">
      <input type="hidden" name="clubId" value={clubId} />

      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded border border-ink-200 bg-white">
        {logoId ? (
          // eslint-disable-next-line @next/next/no-img-element -- user upload, arbitrary dimensions
          <img
            src={`/api/files/${logoId}`}
            alt={`${name} crest`}
            className="max-h-[72px] max-w-[72px] object-contain"
          />
        ) : (
          <span className="text-center text-[10px] leading-tight text-ink-400">No crest</span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <label className="block text-sm font-medium text-ink-800">
          Crest
          <input
            type="file"
            name="logo"
            accept="image/*"
            className="mt-1 block w-full text-sm text-ink-700 file:mr-3 file:rounded file:border-0 file:bg-ink-100 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-ink-200"
          />
        </label>
        <p className="mt-1 text-xs text-ink-500">
          Printed on the cover of the club&apos;s rating document and beside its shield. A
          transparent PNG sits best on the maroon covers.
        </p>
      </div>

      <SubmitButton className="btn-secondary btn-sm" pendingLabel="Uploading…">
        {logoId ? "Replace crest" : "Upload crest"}
      </SubmitButton>

      <div className="w-full space-y-2">
        {state.status === "error" && <FormError message={state.message} />}
        {state.status === "ok" && <FormSuccess message={state.message} />}
      </div>
    </form>
  );
}
