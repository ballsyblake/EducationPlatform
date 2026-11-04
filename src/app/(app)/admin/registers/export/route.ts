import { assessmentPlanDocx, docxFilename, planFilename } from "@/lib/assessment-plan-docx";
import { requireAdmin } from "@/lib/auth";
import { parsedRegisterSchema } from "@/lib/register-schema";
import {
  awaitingJudgement,
  VERDICT_LABEL,
  type ParsedRegister,
  type RegisterCoach,
} from "@/lib/register-file";
import { writeZip, type ZipFile } from "@/lib/zip";

/**
 * A cohort's action plans and feedback letters, as a zip of Word files.
 *
 * One file per coach rather than one document with thirty-five pages, because
 * these go out individually: the action plan is what a coach is sent when they
 * are referred to post-course support, and the feedback letter is what they are
 * sent when they pass. A single bundle would have to be split by hand before
 * the first one could be emailed.
 *
 * `requireAdmin`, not `requireStaff`. A register is a whole cohort's
 * assessments and the comments column carries the coach education team's
 * working notes; an educator on one course has no business with the lot.
 *
 * The register arrives as the JSON the review page parsed, not as the workbook
 * again — see the note in `actions/registers.ts`. It is validated before use.
 */

const CONTENT_TYPE = "application/zip";

/** The classification, as a file somebody can keep beside the documents. */
function summaryCsv(register: ParsedRegister) {
  const esc = (value: string | number | null) => {
    const s = value === null ? "" : String(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [
    [
      "Position",
      "Coach",
      "Track",
      "Club",
      "Rating",
      "Register outcome",
      "Attendance met",
      "Journal",
      "Deliveries assessed",
      "Classification",
      "Why",
      "Document",
    ],
    ...register.coaches.map((coach) => [
      coach.position,
      coach.name,
      coach.track === "CATCH_UP" ? "Catch-up" : "Main",
      coach.club,
      coach.rating,
      coach.outcome,
      coach.attendanceMet === null ? "" : coach.attendanceMet ? "Yes" : "No",
      coach.journal === null ? "" : coach.journal ? "Yes" : "No",
      coach.deliveries.length,
      VERDICT_LABEL[coach.verdict],
      coach.reason,
      coach.verdict === "action_plan"
        ? "Action plan"
        : coach.verdict === "passed"
          ? "Feedback"
          : "None",
    ]),
  ];
  // A BOM, because this is opened in Excel on Windows and the coach names carry
  // apostrophes and accents that CP-1252 renders as mojibake without one.
  return Buffer.from(`﻿${rows.map((r) => r.map(esc).join(",")).join("\r\n")}\r\n`, "utf8");
}

async function docxFor(
  coach: RegisterCoach,
  register: ParsedRegister,
  kind: "action plan" | "feedback",
  folder: string,
): Promise<ZipFile> {
  return {
    name: `${folder}/${planFilename(coach, kind)}`,
    data: await assessmentPlanDocx([coach], register, kind),
  };
}


export async function POST(request: Request) {
  await requireAdmin();

  const form = await request.formData();
  const raw = String(form.get("register") ?? "");
  const want = String(form.get("kind") ?? "all");

  let parsed;
  try {
    parsed = parsedRegisterSchema.safeParse(JSON.parse(raw));
  } catch {
    return new Response("That register could not be read. Upload it again.", { status: 400 });
  }
  if (!parsed.success) {
    return new Response("That register could not be read. Upload it again.", { status: 400 });
  }
  const register = parsed.data;

  // "all" is the two signed-off groups. The not-yet-classified group is asked
  // for on its own, because thirty documents nobody has judged yet mixed in
  // with the letters that are ready to send is how one goes out early.
  const files: ZipFile[] = [];
  for (const coach of register.coaches) {
    if (want === "awaiting") {
      if (awaitingJudgement(coach)) {
        files.push(await docxFor(coach, register, "action plan", "to-be-assessed"));
      }
      continue;
    }
    if (coach.verdict === "action_plan" && want !== "feedback") {
      files.push(await docxFor(coach, register, "action plan", "action-plans"));
    }
    if (coach.verdict === "passed" && want !== "action-plans") {
      files.push(await docxFor(coach, register, "feedback", "feedback"));
    }
  }

  if (!files.length) {
    return new Response(
      "Nothing to export: no coach on that register falls into the group you asked for.",
      { status: 422 },
    );
  }

  // The summary travels with the documents. Somebody circulating thirty of
  // these needs to be able to say why each coach got the one they got, months
  // later, without the register in front of them.
  files.push({ name: "summary.csv", data: summaryCsv(register) });

  const stem = docxFilename(
    [register.qualification, register.location].filter(Boolean).join(" ") || "register",
    want === "feedback"
      ? "feedback"
      : want === "action-plans"
        ? "action plans"
        : want === "awaiting"
          ? "to be assessed"
          : "assessments",
  ).replace(/\.docx$/, ".zip");

  return new Response(new Uint8Array(writeZip(files)), {
    headers: {
      "Content-Type": CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="assessments.zip"; filename*=UTF-8''${encodeURIComponent(stem)}`,
      "Cache-Control": "no-store",
    },
  });
}
