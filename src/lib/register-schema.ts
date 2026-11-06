import { z } from "zod";

import type { ParsedRegister } from "@/lib/register-file";

/**
 * A parsed register, validated on the way back in.
 *
 * The register is read once, on upload, and the result travels to the download
 * route in a hidden field rather than the 52 MB workbook being uploaded a
 * second time. That makes it client-supplied data on the way back, so it is
 * parsed rather than trusted — not because there is an injection to be had
 * (everything here ends up as text inside a Word file the same admin
 * downloads) but because a hand-edited field would otherwise surface as a
 * `TypeError` in a route handler instead of a sentence on a page.
 *
 * Kept beside `register-file.ts` and checked against it by the assignment at
 * the foot of this file: if a field is added to `ParsedRegister` and not to the
 * schema, that line stops compiling.
 */

const delivery = z.object({
  deliveryNo: z.number().int(),
  assessor: z.string().nullable(),
  block: z.string().nullable(),
  component: z.string().nullable(),
  topic: z.string().nullable(),
  comment: z.string().nullable(),
  actions: z.array(z.string()),
  rating: z.number().nullable(),
  level: z.enum(["NYC", "C", "HC"]).nullable(),
});

const verdict = z.enum(["passed", "action_plan", "incomplete", "unrated"]);

const coach = z.object({
  position: z.number().int(),
  firstName: z.string(),
  lastName: z.string(),
  name: z.string(),
  track: z.enum(["MAIN", "CATCH_UP"]),
  club: z.string().nullable(),
  rating: z.number().nullable(),
  outcome: z.string().nullable(),
  readiness: z.string().nullable(),
  comments: z.string().nullable(),
  attendanceMet: z.boolean().nullable(),
  journal: z.boolean().nullable(),
  deliveries: z.array(delivery),
  assessmentComment: z.string().nullable(),
  verdict,
  reason: z.string(),
});

export const parsedRegisterSchema = z.object({
  qualification: z.string().nullable(),
  stream: z.string().nullable(),
  location: z.string().nullable(),
  courseTitle: z.string(),
  courseDates: z.string().nullable(),
  staff: z.array(z.object({ role: z.string(), name: z.string() })),
  coaches: z.array(coach).min(1),
  passMark: z.number(),
  sourceFile: z.string(),
  warnings: z.array(z.string()),
});

// Both directions, so neither file can drift: a field added to the type must be
// added to the schema, and a field the schema invents has nowhere to go.
type Parsed = z.infer<typeof parsedRegisterSchema>;
const _schemaMatchesType: (p: Parsed) => ParsedRegister = (p) => p;
const _typeMatchesSchema: (p: ParsedRegister) => Parsed = (p) => p;
void _schemaMatchesType;
void _typeMatchesSchema;
