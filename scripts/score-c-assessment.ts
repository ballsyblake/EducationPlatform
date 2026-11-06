/**
 * One C Diploma assessment form, with the six-area scores filled in.
 *
 *   npm run assessment:score -- <register.xlsx> "<coach name>" \
 *     --scores 2,1.5,2,1.5,2,2 [--outcome competent|not-yet] [--out <file>]
 *
 * The register carries no rubric score — `/admin/registers` exports the form
 * with the table blank for that reason, and that is still what the bundle
 * does. But FQ do settle scores, after the course closes and by email: the
 * document this was written for came out of a coach asking what he had
 * scored, the CET who ran his practical replying with six numbers, and the
 * State Technical Director agreeing them. There was no way to get those six
 * numbers onto the form without typing them into Word afterwards.
 *
 * So the scores are an argument, not something read or derived. Nobody passes
 * them from the app, on purpose: a score is a person's judgement and this
 * makes somebody type it.
 *
 * The outcome follows from the total rather than being asked for, because FA's
 * guide says what nine points means — see `outcomeFor` in `delivery-rubric.ts`.
 * The covering paragraph is the one thing that does not, because the register's
 * own verdict is about the whole course and these six numbers are about the
 * practical; `--outcome` says which paragraph to print when they disagree, and
 * defaults to what the total says.
 */

import { readFileSync, writeFileSync } from "node:fs";

import { assessmentPlanDocx, planFilename } from "@/lib/assessment-plan-docx";
import { AREA_CODES, DELIVERY_AREAS, outcomeFor, thresholdsFor } from "@/lib/delivery-rubric";
import { readRegister } from "@/lib/register-file";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function flag(argv: string[], name: string) {
  const i = argv.indexOf(`--${name}`);
  return i < 0 ? null : (argv[i + 1] ?? null);
}

async function main() {
  const argv = process.argv.slice(2);
  const positional = argv.filter((a, i) => !a.startsWith("--") && !argv[i - 1]?.startsWith("--"));
  const [path, who] = positional;
  if (!path || !who) fail("Usage: score-c-assessment <register.xlsx> \"<coach name>\" --scores a,b,c,d,e,f");

  const raw = flag(argv, "scores");
  if (!raw) fail("--scores is required: six numbers, 0 to 3, in the order " + AREA_CODES.join(", "));
  const numbers = raw.split(",").map((v) => Number(v.trim()));
  if (numbers.length !== DELIVERY_AREAS.length || numbers.some((n) => !(n >= 0 && n <= 3))) {
    fail(`--scores needs ${DELIVERY_AREAS.length} numbers between 0 and 3, in the order ${AREA_CODES.join(", ")}`);
  }

  const file = readFileSync(path);
  const register = readRegister(file, path.split("/").pop() ?? path);
  const coach = register.coaches.find(
    (c) => c.name.toLowerCase() === who.toLowerCase().trim(),
  );
  if (!coach) {
    fail(`No coach called ${who} on that register. It has: ${register.coaches.map((c) => c.name).join(", ")}`);
  }

  const scores = Object.fromEntries(DELIVERY_AREAS.map((area, i) => [area.code, numbers[i]]));
  const total = numbers.reduce((sum, n) => sum + n, 0);
  const thresholds = thresholdsFor({
    qualification: register.qualification,
    title: register.courseTitle,
  });
  const outcome = outcomeFor(total, thresholds);

  // Half points are FQ's, not FA's: their grid has four boxes and nothing
  // between them, so a 1.5 ticks no box and is written out beside the row
  // instead. Worth saying out loud rather than leaving somebody to notice it
  // on the printed form.
  const halves = numbers.filter((n) => !Number.isInteger(n)).length;
  console.log(`${coach.name}: ${numbers.join(", ")} = ${total}/18 — ${outcome.label}`);
  if (halves) console.log(`${halves} half score(s): written beside the row, no box ticked.`);

  const asked = flag(argv, "outcome");
  const competent = asked === null ? outcome.competent : asked !== "not-yet";
  const kind = competent ? "feedback" : "action plan";
  // The covering paragraph branches on the register's verdict, which is about
  // the whole course and was settled before these scores existed.
  coach.verdict = competent ? "passed" : "action_plan";
  coach.reason = `Scored ${total}/18 on the practical by the CETs.`;

  const out = flag(argv, "out") ?? planFilename(coach, kind, register);
  writeFileSync(out, await assessmentPlanDocx([coach], register, kind, { [coach.name]: { scores } }));
  console.log(`Wrote ${out}`);
}

void main();
