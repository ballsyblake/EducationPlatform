"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { applyCoachDbImport, planCoachDbImport, type ImportPlan } from "@/lib/coach-db";
import { CoachDbError, parseCoachDb, type ParsedCoachDb } from "@/lib/coach-db-file";
import { parsedCoachDbSchema } from "@/lib/coach-db-schema";

/**
 * Importing FQ's coach database workbook into the coach register.
 *
 * Two steps in one action: read the file and show what it would do, then the
 * same button pressed again with the plan in front of you. The workbook goes up
 * once and what travels back for the second step is the JSON it parsed to —
 * three megabytes of spreadsheet is a long upload to repeat for no new
 * information, and the file input cannot be refilled from script anyway once
 * React has reset the form.
 *
 * Admin only, like every other account question. An educator marks the
 * register of a course they are on; who FQ holds a qualification for is the
 * program's.
 *
 * This is the only route that writes the register. There is deliberately no
 * script and nothing at boot: the workbook is 1,676 real coaches with real
 * addresses, and loading it is a decision somebody takes on purpose, in front
 * of a plan that says what it is about to do.
 */
export type CoachDbImportState = {
  status: "idle" | "previewed" | "ok" | "error";
  message?: string;
  plan?: ImportPlan;
  /** The parsed workbook, for the commit that follows a preview. */
  parsed?: ParsedCoachDb;
};

/**
 * The ceiling on the workbook.
 *
 * Modest next to the register upload's 80 MB, because nothing in this file is
 * a photograph: the real one is 3 MB for eight sheets and 16,000 rows. A file
 * an order of magnitude past that is the wrong file.
 */
const MAX_BYTES = 40 * 1024 * 1024;

export async function importCoachDb(
  _prev: CoachDbImportState,
  formData: FormData,
): Promise<CoachDbImportState> {
  await requireAdmin();

  const commit = formData.get("mode") === "commit";
  const payload = formData.get("parsed");

  // The commit path: the workbook is already read, and what comes back is the
  // parse of it. Re-validated rather than trusted — it has been through a
  // browser, which makes it input.
  if (commit) {
    if (typeof payload !== "string" || !payload) {
      return { status: "error", message: "Read the workbook again before importing." };
    }
    let parsed: ParsedCoachDb;
    try {
      parsed = parsedCoachDbSchema.parse(JSON.parse(payload));
    } catch {
      return {
        status: "error",
        message: "That is not a workbook this page read. Choose the file and read it again.",
      };
    }

    const result = await applyCoachDbImport(parsed);

    revalidatePath("/admin/coach-db");
    revalidatePath("/admin/coaches");
    revalidatePath("/admin");

    return {
      status: "ok",
      message: [
        `${result.created} account${result.created === 1 ? "" : "s"} created`,
        `${result.attached} record${result.attached === 1 ? "" : "s"} added to an existing account`,
        `${result.updated} updated`,
        `${result.unchanged} already right`,
        `${result.skipped} skipped`,
        `${result.affiliates} club${result.affiliates === 1 ? "" : "s"} and ${
          result.qualifications
        } qualification${result.qualifications === 1 ? "" : "s"} refreshed`,
      ].join(", ") + ".",
      plan: await planCoachDbImport(parsed),
      parsed,
    };
  }

  const file = formData.get("workbook");
  if (!(file instanceof File) || !file.size) {
    return { status: "error", message: "Choose the coach database workbook (.xlsx)." };
  }
  if (file.size > MAX_BYTES) {
    return {
      status: "error",
      message: `That file is ${Math.round(file.size / 1024 / 1024)} MB. The limit is ${
        MAX_BYTES / 1024 / 1024
      } MB — check it is the coach database and not a course register.`,
    };
  }

  let parsed: ParsedCoachDb;
  try {
    parsed = parseCoachDb(Buffer.from(await file.arrayBuffer()), file.name);
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof CoachDbError
          ? error.message
          : "That workbook could not be read. Check it is the coach database.",
    };
  }

  const plan = await planCoachDbImport(parsed);
  if (plan.error) return { status: "error", message: plan.error, plan };

  const { create, attach, update, unchanged, skip } = plan.counts;
  return {
    status: "previewed",
    message: `${plan.rows.length} coaches on the sheet: ${create} new account${
      create === 1 ? "" : "s"
    }, ${attach} to add a record to, ${update} to update, ${unchanged} already right, ${skip} skipped.`,
    plan,
    parsed,
  };
}
