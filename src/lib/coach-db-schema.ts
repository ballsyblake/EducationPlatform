import { z } from "zod";

import type { ParsedCoachDb } from "@/lib/coach-db-file";

/**
 * The parsed workbook, validated on its way back in.
 *
 * The import is two steps — read the file, look at the plan, import it — and
 * the workbook is three megabytes, so what travels back for the second step is
 * the JSON it parsed to rather than the file again. Same stance as the register
 * download route and for the same reason: React 19 clears an uncontrolled form
 * once an action settles and a file input cannot be refilled from script, so
 * "preview then import" would otherwise mean choosing the file twice.
 *
 * It is re-validated here because a hidden field is a round trip through a
 * browser, which makes it input. Nothing in it is trusted to be the shape the
 * parser produced.
 *
 * Tied to `ParsedCoachDb` by the pair of assignments at the foot of the file,
 * both directions, so neither can drift: a field added to the type must be
 * added here, and a field invented here has nowhere to go.
 */

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Not an ISO day.");

const qualification = z.object({
  name: z.string().min(1),
  completedAt: isoDay.nullable(),
  expiresAt: isoDay.nullable(),
  status: z.string().nullable(),
  cpd: z.string().nullable(),
});

const clubMatch = z.enum(["exact", "fuzzy", "none", "blank"]);

const coach = z.object({
  line: z.number().int().positive(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  faNumber: z.string().nullable(),
  clubName: z.string().nullable(),
  affiliateSlug: z.string().nullable(),
  clubMatch,
  region: z.string().nullable(),
  /// The 1-5 scale, in half steps. Bounded here as well as in the parser: this
  /// is the value the register's whole point is to carry, and the one field a
  /// tampered payload could make nonsense of.
  internalRating: z.number().min(1).max(5).nullable(),
  ratingFrom: z.enum(["main", "FQ Data"]).nullable(),
  ratingConflict: z
    .object({ main: z.number().nullable(), fqData: z.number().nullable() })
    .nullable(),
  statusNote: z.string().nullable(),
  bDiplomaInterest: z.boolean(),
  bDiplomaInterestNote: z.string().nullable(),
  qualifications: z.array(qualification),
  qualificationsFrom: z.enum(["FALC", "main"]).nullable(),
  notes: z.array(z.string()),
});

const affiliate = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  region: z.string().nullable(),
});

export const parsedCoachDbSchema = z.object({
  sourceFile: z.string(),
  coaches: z.array(coach).min(1),
  affiliates: z.array(affiliate),
  skippedSheets: z.array(
    z.object({ name: z.string(), rows: z.number().int().nonnegative(), reason: z.string() }),
  ),
  warnings: z.array(z.string()),
});

type Parsed = z.infer<typeof parsedCoachDbSchema>;
const _schemaMatchesType: (p: Parsed) => ParsedCoachDb = (p) => p;
const _typeMatchesSchema: (p: ParsedCoachDb) => Parsed = (p) => p;
void _schemaMatchesType;
void _typeMatchesSchema;
