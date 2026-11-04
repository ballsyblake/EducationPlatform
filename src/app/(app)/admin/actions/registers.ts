"use server";

import { requireAdmin } from "@/lib/auth";
import {
  countVerdicts,
  readRegister,
  RegisterError,
  XlsxError,
  type ParsedRegister,
} from "@/lib/register-file";

/**
 * Reading a course register for export.
 *
 * One step, not two: the file is read, and what came out of it is shown. The
 * exports are then built from the *parsed* register, which travels back to the
 * download route in the form, so the workbook is only ever uploaded once — one
 * of FQ's B Diploma registers is 52 MB, almost all of it embedded photographs,
 * and uploading it again to press Download would be a minute of somebody's
 * afternoon for no new information.
 *
 * Nothing is written. No coach is created, no enrolment touched, no rating
 * stored. Loading real people's records into the platform is the import
 * script's job and a decision somebody takes on purpose — see the data notes in
 * `CLAUDE.md`. This reads a register and hands back documents.
 */

export type RegisterReviewState = {
  status: "idle" | "ok" | "error";
  message?: string;
  register?: ParsedRegister;
};

/**
 * The ceiling on a register.
 *
 * Generous because the registers are enormous for a silly reason: twenty-nine
 * embedded JPEGs of coaches behind a row of `#VALUE!`. 52 MB is the largest
 * seen, and the parser never inflates the photographs, so the cost of a big one
 * is the upload rather than the read.
 */
const MAX_REGISTER_BYTES = 80 * 1024 * 1024;

export async function reviewRegister(
  _prev: RegisterReviewState,
  formData: FormData,
): Promise<RegisterReviewState> {
  await requireAdmin();

  const file = formData.get("register");
  if (!(file instanceof File) || !file.size) {
    return { status: "error", message: "Choose a course register (.xlsx)." };
  }
  if (file.size > MAX_REGISTER_BYTES) {
    return {
      status: "error",
      message: `That file is ${Math.round(file.size / 1024 / 1024)} MB. The limit is ${
        MAX_REGISTER_BYTES / 1024 / 1024
      } MB — check it is a register and not a folder of film.`,
    };
  }

  let register: ParsedRegister;
  try {
    register = readRegister(Buffer.from(await file.arrayBuffer()), file.name);
  } catch (error) {
    if (error instanceof RegisterError || error instanceof XlsxError) {
      return { status: "error", message: error.message };
    }
    throw error;
  }

  const counts = countVerdicts(register.coaches);
  return {
    status: "ok",
    message:
      `${register.coaches.length} coaches: ${counts.passed} passed, ` +
      `${counts.action_plan} need an action plan, ` +
      `${counts.incomplete} not signed off, ${counts.unrated} not rated.`,
    register,
  };
}
