/**
 * Bulk club import, as parsing and validation only.
 *
 * No database access, so the preview a person approves and the write that
 * follows are the same reading of the same file. An importer that parses twice
 * is an importer that can show you one thing and do another.
 *
 * The shape is deliberately one row per club rather than separate club and
 * administrator files: a club without an administrator can't submit anything,
 * so splitting them just guarantees half the clubs are unusable until somebody
 * does a second pass.
 */

/** Columns we understand. Everything else in the header is ignored. */
export const IMPORT_COLUMNS = [
  "name",
  "zone",
  "tier",
  "assessment_tier",
  "contact_name",
  "contact_email",
  "admin_name",
  "admin_email",
] as const;

export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

export const TEMPLATE_HEADER = IMPORT_COLUMNS.join(",");

export const TEMPLATE_CSV = [
  TEMPLATE_HEADER,
  "Brisbane City FC,Brisbane Metro,NPL,T1,Priya Raman,office@brisbanecity.example,Priya Raman,priya@brisbanecity.example",
  "Noosa Lions,Sunshine Coast,FQPL,T2,Sam Ngata,office@noosalions.example,,",
].join("\n");

export type ParsedRow = {
  /** 1-based line in the file, counting the header. Used in error messages. */
  line: number;
  name: string;
  zone: string;
  tier: string;
  assessmentTier: string;
  contactName: string;
  contactEmail: string;
  adminName: string;
  adminEmail: string;
  /** Fields discarded as malformed, reported as warnings rather than skips. */
  dropped: string[];
};

export type RowProblem = { line: number; message: string };

export type ParseResult = {
  rows: ParsedRow[];
  problems: RowProblem[];
  /** Recognised columns actually present, in file order. */
  columns: ImportColumn[];
  /** Header names we didn't recognise, so the operator can spot a typo. */
  unknownColumns: string[];
};

/**
 * Splits one CSV line, honouring quoted fields.
 *
 * Written out rather than `split(",")` because club names contain commas often
 * enough to matter — "Football Club Brisbane, Inc" would silently shift every
 * column after it, and a shifted column is worse than a rejected file.
 */
function splitLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (quoted) {
      if (ch === '"') {
        // A doubled quote inside a quoted field is a literal quote.
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(field);
      field = "";
    } else field += ch;
  }

  out.push(field);
  return out.map((f) => f.trim());
}

/** `Contact Email`, `contact-email` and `contact_email` all mean the same thing. */
function normaliseHeader(raw: string): ImportColumn | null {
  const key = raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z_]/g, "");

  const aliases: Record<string, ImportColumn> = {
    club: "name",
    club_name: "name",
    name: "name",
    zone: "zone",
    region: "zone",
    tier: "tier",
    licence: "tier",
    license: "tier",
    assessment_tier: "assessment_tier",
    tier_group: "assessment_tier",
    case_tier: "assessment_tier",
    contact_name: "contact_name",
    primary_contact: "contact_name",
    contact_email: "contact_email",
    email: "contact_email",
    admin_name: "admin_name",
    administrator: "admin_name",
    administrator_name: "admin_name",
    admin_email: "admin_email",
    administrator_email: "admin_email",
  };

  return aliases[key] ?? null;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Accepts `T1`, `Tier 1`, `1` and `tier1` for the same thing. */
export function normaliseAssessmentTier(raw: string): string {
  const key = raw.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (!key) return "";
  if (key === "1" || key === "t1" || key === "tier1") return "T1";
  if (key === "2" || key === "t2" || key === "tier2") return "T2";
  return raw.trim().toUpperCase();
}

/**
 * Reads a pasted CSV into rows, collecting every problem rather than throwing
 * on the first.
 *
 * An operator pasting thirty-seven clubs wants all the bad lines at once, not a
 * fix-one-rerun loop that takes thirty-seven passes.
 */
export function parseClubCsv(text: string, knownTierCodes: string[] = []): ParseResult {
  const problems: RowProblem[] = [];
  const rows: ParsedRow[] = [];

  const lines = text
    .split(/\r?\n/)
    .map((l, i) => ({ raw: l, line: i + 1 }))
    .filter((l) => l.raw.trim().length > 0);

  if (lines.length === 0) {
    return { rows, problems: [{ line: 0, message: "Nothing to import." }], columns: [], unknownColumns: [] };
  }

  const headerCells = splitLine(lines[0].raw);
  const columns: (ImportColumn | null)[] = headerCells.map(normaliseHeader);
  const unknownColumns = headerCells.filter((_, i) => columns[i] === null).filter(Boolean);

  if (!columns.includes("name")) {
    return {
      rows,
      problems: [
        {
          line: 1,
          message:
            "No club name column. The first row must be a header, and one column must be called name.",
        },
      ],
      columns: [],
      unknownColumns,
    };
  }

  const at = (cells: string[], col: ImportColumn) => {
    const i = columns.indexOf(col);
    return i === -1 ? "" : (cells[i] ?? "").trim();
  };

  const seen = new Map<string, number>();

  for (const { raw, line } of lines.slice(1)) {
    const cells = splitLine(raw);
    const name = at(cells, "name");

    if (!name) {
      problems.push({ line, message: "No club name — skipped." });
      continue;
    }

    // Duplicates within the file itself, which a database check can't catch
    // because neither row exists yet.
    const key = name.toLowerCase();
    if (seen.has(key)) {
      problems.push({ line, message: `"${name}" also appears on line ${seen.get(key)} — skipped.` });
      continue;
    }
    seen.set(key, line);

    // A malformed email costs the field, not the club. Losing a whole club to
    // one typo is the more expensive failure and the harder one to spot: a club
    // with no administrator is counted on the Clubs page, a club that never
    // arrived is just absent. Both are reported in the preview either way.
    const dropped: string[] = [];

    let contactEmail = at(cells, "contact_email");
    if (contactEmail && !EMAIL.test(contactEmail)) {
      dropped.push(`contact email "${contactEmail}" isn't valid and was left out`);
      contactEmail = "";
    }

    let adminEmail = at(cells, "admin_email");
    if (adminEmail && !EMAIL.test(adminEmail)) {
      dropped.push(`administrator email "${adminEmail}" isn't valid — no account created`);
      adminEmail = "";
    }

    // The tier is the one field worth losing a row over: it decides which line
    // items the club is scored on, so guessing it would produce a wrong rating
    // rather than an incomplete record.
    const assessmentTier = normaliseAssessmentTier(at(cells, "assessment_tier"));
    if (assessmentTier && knownTierCodes.length > 0 && !knownTierCodes.includes(assessmentTier)) {
      problems.push({
        line,
        message: `"${assessmentTier}" isn't an assessment tier. Use one of ${knownTierCodes.join(", ")} — skipped.`,
      });
      continue;
    }

    rows.push({
      line,
      name,
      zone: at(cells, "zone"),
      tier: at(cells, "tier"),
      assessmentTier,
      contactName: at(cells, "contact_name"),
      contactEmail,
      adminName: at(cells, "admin_name"),
      adminEmail,
      dropped,
    });
  }

  return {
    rows,
    problems,
    columns: columns.filter((c): c is ImportColumn => c !== null),
    unknownColumns,
  };
}

/** What the import would do to one row, worked out against what already exists. */
export type RowPlan = {
  row: ParsedRow;
  club: "create" | "update";
  /** `skip` when no administrator email was given, `exists` when they already have an account. */
  admin: "create" | "skip" | "exists";
  warnings: string[];
};

export type ImportPlan = {
  plans: RowPlan[];
  problems: RowProblem[];
  unknownColumns: string[];
  counts: { create: number; update: number; admins: number };
};

/**
 * Decides create-or-update per row.
 *
 * Existing clubs are updated rather than duplicated, and matched on name
 * case-insensitively: an operator re-pasting a corrected file should end up with
 * the corrections, not with a second "Brisbane City FC".
 */
export function planImport(
  parsed: ParseResult,
  existing: { name: string }[],
  existingEmails: string[],
): ImportPlan {
  const byName = new Set(existing.map((c) => c.name.trim().toLowerCase()));
  const emails = new Set(existingEmails.map((e) => e.trim().toLowerCase()));

  const plans: RowPlan[] = parsed.rows.map((row) => {
    const warnings: string[] = [...row.dropped];
    const club = byName.has(row.name.toLowerCase()) ? "update" : "create";

    let admin: RowPlan["admin"] = "skip";
    if (row.adminEmail) {
      admin = emails.has(row.adminEmail.toLowerCase()) ? "exists" : "create";
      if (admin === "exists") {
        warnings.push(`${row.adminEmail} already has an account — left as it is.`);
      }
    } else {
      warnings.push("No administrator — this club can't submit until one is added.");
    }

    if (!row.assessmentTier) {
      warnings.push("No assessment tier — will be assessed on the first tier's line items.");
    }

    return { row, club, admin, warnings };
  });

  return {
    plans,
    problems: parsed.problems,
    unknownColumns: parsed.unknownColumns,
    counts: {
      create: plans.filter((p) => p.club === "create").length,
      update: plans.filter((p) => p.club === "update").length,
      admins: plans.filter((p) => p.admin === "create").length,
    },
  };
}
