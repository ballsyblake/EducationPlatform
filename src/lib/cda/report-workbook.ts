import "server-only";

import ExcelJS from "exceljs";
import { areaKey, type AssessmentOverview } from "@/lib/cda/assessment";
import { DOMAIN_LABELS, SHIELD_LABELS } from "@/lib/cda/rubric";
import type { Domain } from "@prisma-client";

/**
 * The club's rating as a workbook.
 *
 * The portal is the export point, so every figure here is written as a value
 * the portal computed — not as a formula that recomputes. That is the whole
 * point of the arrangement: one scoring engine, so the sheet and the club's
 * report can never disagree. A workbook that re-derived the rubric would be a
 * second engine to keep in step with FQ's annual changes, and the first year
 * somebody updated one and not the other, nothing would say so.
 *
 * What it is for is the step after: a CDA reading the club's numbers in the
 * tool they already work in, and the Word template that turns them into the
 * PDF the club receives. So the layout is FQ's rubric sheet rather than a data
 * dump — area blocks, subtotals, the colour coding their own sheets carry —
 * and the named cells the merge binds to are stable.
 *
 * Re-export to refresh. There is nothing to recalculate.
 */

/** FQ's domain colours, the same ones the report slides use. */
const TONE: Record<Domain, string> = {
  TECHNICAL: "FFB4C7E7",
  PLANNING: "FF9DC3E6",
  DELIVERY: "FFFFD966",
  OUTCOMES: "FFA9D18E",
};

const MAROON = "FF6B1230";
const GOLD = "FFFFC000";
const GREY = "FFD9D9D9";

const DOMAINS: Domain[] = ["TECHNICAL", "PLANNING", "DELIVERY", "OUTCOMES"];

export async function buildReportWorkbook(overview: AssessmentOverview): Promise<Buffer> {
  const { assessment, areas, areaNotes, rating, technical } = overview;
  const goldMin = assessment.cycle.goldMin;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Football Queensland Club Development";
  wb.created = new Date();

  // Excel forbids / \ ? * [ ] in a sheet name and caps it at 31 characters, and
  // club names contain apostrophes and hyphens that are fine but length that is
  // not. Trimmed rather than rejected: a workbook that fails to open because of
  // a club's name is a worse outcome than a truncated tab.
  const sheet = wb.addWorksheet(assessment.club.name.replace(/[\\/?*[\]]/g, " ").slice(0, 31), {
    views: [{ state: "frozen", ySplit: 6 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  sheet.columns = [
    { width: 10 },
    { width: 58 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 16 },
    { width: 12 },
    { width: 14 },
    { width: 12 },
  ];

  /* -------------------------------- title --------------------------------- */

  title(sheet, `${assessment.club.name} — ${assessment.cycle.name}`);
  meta(sheet, [
    ["Tier", rating.tier === "T2" ? "Tier 2" : "Tier 1"],
    ["Pool", assessment.pool?.name ? `Pool ${assessment.pool.name}` : "Not in a pool"],
    ["Status", overview.frozen ? "Locked — these are the figures the club was given" : "Provisional — not locked, these figures still move"],
    ["Exported", new Date().toLocaleString("en-AU")],
  ]);

  /* ------------------------------- the rating ------------------------------ */

  heading(sheet, "PRELIMINARY RATING");
  headerRow(sheet, ["", "Overall score", "Maximum", "Score", "Missed", "% Grade"], MAROON, "FFFFFFFF");

  for (const domain of DOMAINS) {
    const p = rating.points[domain];
    const percent = p.available === 0 ? 0 : p.earned / p.available;
    const row = sheet.addRow([
      "",
      DOMAIN_LABELS[domain],
      p.available,
      p.earned,
      p.available - p.earned,
      percent,
    ]);
    fill(row.getCell(2), TONE[domain]);
    row.getCell(6).numFmt = "0%";
    fill(row.getCell(6), percent * 100 >= goldMin ? GOLD : GREY);
    bordered(row, 2, 6);
  }

  const total = sheet.addRow([
    "",
    "TOTAL",
    rating.available,
    rating.earned,
    rating.available - rating.earned,
    rating.percent / 100,
  ]);
  total.font = { bold: true };
  total.getCell(6).numFmt = "0%";
  fill(total.getCell(6), rating.percent >= goldMin ? GOLD : GREY);
  bordered(total, 2, 6);

  blank(sheet);
  label(sheet, "Preliminary rating", rating.shield ? SHIELD_LABELS[rating.shield] : "Not eligible");
  label(sheet, "Score alone would earn", SHIELD_LABELS[rating.provisionalShield]);
  if (rating.cappedDown) {
    label(
      sheet,
      "Held down by",
      rating.eligibility.cappedBy.map((c) => `${c.code} ${c.title}`).join(", "),
    );
  }
  if (!rating.eligibility.eligible) {
    label(
      sheet,
      "Not eligible because",
      [
        rating.eligibility.failed.length && `${rating.eligibility.failed.length} failed`,
        rating.eligibility.pending.length && `${rating.eligibility.pending.length} unverified`,
      ]
        .filter(Boolean)
        .join(", "),
    );
  }

  /* --------------------------- non-negotiables ---------------------------- */

  blank(sheet);
  heading(sheet, "NON-NEGOTIABLES");
  const nnHeader = headerRow(
    sheet,
    ["Code", "Standard", "Verdict", "Level met", "", "Note"],
    MAROON,
    "FFFFFFFF",
  );
  sheet.mergeCells(nnHeader.number, 6, nnHeader.number, 9);

  for (const r of assessment.nonNegotiables) {
    const row = sheet.addRow([
      r.nonNegotiable.code,
      r.nonNegotiable.title,
      verdictLabel(r.verdict),
      r.nonNegotiable.kind === "SHIELD_THRESHOLD"
        ? r.shieldMet
          ? SHIELD_LABELS[r.shieldMet]
          : "Not recorded"
        : "",
      "",
      r.adminNote ?? "",
    ]);
    // The admin's note runs to the end of the sheet rather than sitting in one
    // 16-character column.
    sheet.mergeCells(row.number, 6, row.number, 9);
    row.getCell(6).alignment = { wrapText: true, vertical: "top" };
    bordered(row, 1, 9);
  }

  /* ------------------------------- technical ------------------------------ */

  blank(sheet);
  heading(sheet, DOMAIN_LABELS.TECHNICAL.toUpperCase(), TONE.TECHNICAL);
  headerRow(sheet, ["", "", "Maximum", "Score", "Missed", "% Grade"], TONE.TECHNICAL);

  // Points, not `technical.percent`. The staff rubric is scored as a ratio and
  // converted to whole points afterwards, so the exact ratio and the points it
  // rounds to differ in the second decimal. The report prints the points — and
  // a sheet the report is checked against has to print the same thing, or the
  // first person to compare them finds a discrepancy that is not one.
  const techPercent =
    technical.available === 0 ? 0 : (technical.earned / technical.available) * 100;
  const techRow = sheet.addRow([
    "",
    "Technical Staff Qualifications",
    technical.available,
    technical.earned,
    technical.available - technical.earned,
    techPercent / 100,
  ]);
  techRow.getCell(6).numFmt = "0%";
  fill(techRow.getCell(6), techPercent >= goldMin ? GOLD : GREY);
  bordered(techRow, 2, 6);

  if (technical.unfilledRoles.length > 0) {
    label(sheet, "Roles with nobody appointed", technical.unfilledRoles.map((r) => r.label).join(", "));
  }
  note(sheet, areaNotes.get(areaKey("TECHNICAL", null)));

  /* ----------------------------- scored domains --------------------------- */

  for (const domain of (["PLANNING", "DELIVERY", "OUTCOMES"] as Domain[])) {
    const forDomain = areas.filter((a) => a.domain === domain);
    if (forDomain.length === 0) continue;

    blank(sheet);
    heading(sheet, DOMAIN_LABELS[domain].toUpperCase(), TONE[domain]);

    for (const area of forDomain) {
      const areaHeader = headerRow(
        sheet,
        [area.area ?? "Ungrouped", "", "Club score", "Weighting", "Points", "Area maximum", "Area score", "Missed", "% Grade"],
        TONE[domain],
      );
      // The area name needs both of the first two columns. A filled cell stops
      // text spilling into its neighbour, so without the merge the name is cut
      // off at the code column's width — "Program Management & Monitoring"
      // would read as "Program Ma".
      sheet.mergeCells(areaHeader.number, 1, areaHeader.number, 2);

      for (const o of area.outcomes) {
        const stars = o.stars ?? 0;
        const row = sheet.addRow([
          o.criterion.code,
          o.criterion.title,
          stars,
          o.criterion.weight,
          stars * o.criterion.weight,
        ]);
        bordered(row, 1, 5);
      }

      const subtotal = sheet.addRow([
        "",
        `${area.area ?? "Ungrouped"} — subtotal`,
        "",
        "",
        "",
        area.available,
        area.earned,
        area.available - area.earned,
        area.percent / 100,
      ]);
      subtotal.font = { bold: true };
      subtotal.getCell(9).numFmt = "0%";
      fill(subtotal.getCell(9), area.percent >= goldMin ? GOLD : GREY);
      bordered(subtotal, 2, 9);

      note(sheet, areaNotes.get(areaKey(area.domain, area.area)));
    }

    const p = rating.points[domain];
    const domainTotal = sheet.addRow([
      "",
      `${DOMAIN_LABELS[domain].toUpperCase()} TOTAL`,
      "",
      "",
      "",
      p.available,
      p.earned,
      p.available - p.earned,
      p.available === 0 ? 0 : p.earned / p.available,
    ]);
    domainTotal.font = { bold: true };
    domainTotal.getCell(9).numFmt = "0%";
    fill(domainTotal.getCell(2), TONE[domain]);
    bordered(domainTotal, 2, 9);
  }

  /* -------------------------------- summary ------------------------------- */

  blank(sheet);
  heading(sheet, "ASSESSMENT SUMMARY");
  note(sheet, assessment.summary ?? undefined);

  // A `Buffer` rather than the ArrayBuffer exceljs hands back, because the
  // route has to give Next a body it can length-prefix.
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/* -------------------------------------------------------------------------- */
/* Small builders                                                             */
/* -------------------------------------------------------------------------- */

type Sheet = ExcelJS.Worksheet;

function fill(cell: ExcelJS.Cell, argb: string) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function bordered(row: ExcelJS.Row, from: number, to: number) {
  for (let i = from; i <= to; i += 1) {
    row.getCell(i).border = {
      top: { style: "thin", color: { argb: "FFBFBFBF" } },
      left: { style: "thin", color: { argb: "FFBFBFBF" } },
      bottom: { style: "thin", color: { argb: "FFBFBFBF" } },
      right: { style: "thin", color: { argb: "FFBFBFBF" } },
    };
  }
}

function title(sheet: Sheet, text: string) {
  const row = sheet.addRow([text]);
  row.height = 28;
  row.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  row.alignment = { vertical: "middle" };
  sheet.mergeCells(row.number, 1, row.number, 9);
  fill(row.getCell(1), MAROON);
}

function meta(sheet: Sheet, pairs: [string, string][]) {
  for (const [k, v] of pairs) label(sheet, k, v);
}

function label(sheet: Sheet, key: string, value: string) {
  const row = sheet.addRow(["", key, value]);
  row.getCell(2).font = { bold: true };
  sheet.mergeCells(row.number, 3, row.number, 9);
  row.getCell(3).alignment = { wrapText: true, vertical: "top" };
}

function heading(sheet: Sheet, text: string, argb = MAROON) {
  const row = sheet.addRow([text]);
  row.height = 20;
  const dark = argb === MAROON;
  row.font = { bold: true, size: 12, color: { argb: dark ? "FFFFFFFF" : "FF1A1A1A" } };
  row.alignment = { vertical: "middle" };
  sheet.mergeCells(row.number, 1, row.number, 9);
  fill(row.getCell(1), argb);
}

function headerRow(sheet: Sheet, cells: string[], argb: string, font = "FF1A1A1A") {
  const row = sheet.addRow(cells);
  row.font = { bold: true, size: 10, color: { argb: font } };
  row.alignment = { vertical: "middle", wrapText: true };
  for (let i = 1; i <= 9; i += 1) fill(row.getCell(i), argb);
  bordered(row, 1, 9);
  return row;
}

/**
 * The Unit's prose, wrapped across the width.
 *
 * Written as a merged, wrapping cell with an explicit height rather than left
 * to Excel's autofit, which does not fire on a merged cell — the paragraph
 * would be there and invisible, which is the one failure that matters for the
 * part of the report a club actually acts on.
 */
function note(sheet: Sheet, text?: string) {
  if (!text) return;
  const row = sheet.addRow(["", text]);
  sheet.mergeCells(row.number, 2, row.number, 9);
  row.getCell(2).alignment = { wrapText: true, vertical: "top" };
  row.getCell(2).font = { italic: true, size: 10 };
  row.height = Math.min(160, 14 * Math.ceil(text.length / 150) + 14);
}

function blank(sheet: Sheet) {
  sheet.addRow([]);
}

function verdictLabel(verdict: string) {
  return (
    { PASS: "Met", FAIL: "Not met", ON_NOTICE: "On notice", PENDING: "Not yet checked" }[verdict] ??
    verdict
  );
}
