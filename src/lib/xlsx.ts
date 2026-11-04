/**
 * Reading an `.xlsx` workbook into rows of strings.
 *
 * The TypeScript counterpart of `scripts/xlsx_reader.py`, which the register
 * extractors have used since the first import, and deliberately the same
 * shape: a sheet is a list of rows, a row is a list of trimmed strings, and
 * nothing is coerced. The scripts keep theirs because they run under Python;
 * this one exists because the register upload runs in the app.
 *
 * Only the parts of the format the registers use. Enough of it that a register
 * FQ actually sends parses, and no more — see `readZip` for the same stance on
 * the container.
 *
 * **Formula cells come back as their cached value.** That is not a shortcut, it
 * is the only option: the Assessment sheet's coach names are formulas into the
 * Attendance sheet, and nothing here evaluates a formula. Excel stores the last
 * computed value beside the formula, which is what a register saved out of
 * Excel always carries.
 */

import { readZip, type ZipArchive } from "@/lib/zip";

export class XlsxError extends Error {}

/** A sheet: rows of trimmed cell text, in sheet order, with gaps filled in. */
export type SheetRows = string[][];

export type Workbook = {
  /** Sheet names in the order the workbook tabs them. */
  names: string[];
  sheet(name: string): SheetRows;
  has(name: string): boolean;
};

/** "AB12" -> 27. Column letters are base-26 with no zero. */
function columnIndex(ref: string) {
  const letters = /^([A-Z]+)/.exec(ref)?.[1];
  if (!letters) return -1;
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * The text of every `<t>` inside one element, with entities resolved.
 *
 * Regex rather than an XML parser, for the same reason the Python reader uses
 * ElementTree over anything heavier: the only documents this reads are written
 * by Excel, which produces one narrow dialect. A sheet is a flat list of rows
 * of cells with no mixed content and no namespacing surprises, and a 52 MB
 * register is not worth a parse tree.
 */
const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function decode(xml: string) {
  return xml
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&(?:amp|lt|gt|quot|apos);/g, (m) => ENTITIES[m]);
}

function innerText(xml: string) {
  let out = "";
  for (const m of xml.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)) {
    out += decode(m[1]);
  }
  return out;
}

function sharedStrings(zip: ZipArchive) {
  const xml = zip.read("xl/sharedStrings.xml")?.toString("utf8");
  if (!xml) return [];
  // Split on <si> rather than matching across them: a cell's text can be
  // broken into a dozen runs by one italicised word, and they all belong to
  // the same string.
  return [...xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map((m) => innerText(m[1]));
}

function parseSheet(xml: string, shared: string[]): SheetRows {
  const rows: SheetRows = [];

  for (const rowMatch of xml.matchAll(/<row(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const body = rowMatch[1] ?? "";
    const cells = new Map<number, string>();
    let widest = -1;

    for (const cellMatch of body.matchAll(
      /<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g,
    )) {
      const attrs = cellMatch[1];
      const inner = cellMatch[2] ?? "";
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      if (!ref) continue;
      const col = columnIndex(ref);
      if (col < 0) continue;
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1];

      let value = "";
      if (type === "s") {
        // A shared-string cell holds an index into the table.
        const v = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        const index = v === undefined ? NaN : Number(v);
        value = Number.isInteger(index) ? (shared[index] ?? "") : "";
      } else if (type === "inlineStr") {
        value = innerText(inner);
      } else if (type === "str") {
        // A formula whose cached result is text.
        value = decode(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "");
      } else {
        value = decode(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "");
      }

      value = value.trim();
      if (value) {
        cells.set(col, value);
        if (col > widest) widest = col;
      }
    }

    const row: string[] = [];
    for (let i = 0; i <= widest; i++) row.push(cells.get(i) ?? "");
    // Rows carry an `r` attribute, and a sheet may skip empty ones entirely.
    // Pushed into position so a row index means the same thing it does in
    // Excel's own numbering minus one.
    const at = Number(/\br="(\d+)"/.exec(rowMatch[0])?.[1] ?? NaN);
    if (Number.isInteger(at) && at >= 1) {
      while (rows.length < at - 1) rows.push([]);
      rows[at - 1] = row;
    } else {
      rows.push(row);
    }
  }

  return rows;
}

/**
 * A workbook, with each sheet parsed the first time it is asked for.
 *
 * Lazy for the same reason `readZip` is: the delivery schedule and the FALC
 * export are of no interest to a caller after the action plans, and one of
 * these files is fifty megabytes.
 */
export function readWorkbook(buf: Buffer): Workbook {
  const zip = readZip(buf);

  const workbookXml = zip.read("xl/workbook.xml")?.toString("utf8");
  if (!workbookXml) {
    throw new XlsxError("That file is not an Excel workbook (no xl/workbook.xml inside).");
  }

  const relsXml = zip.read("xl/_rels/workbook.xml.rels")?.toString("utf8") ?? "";
  const targets = new Map<string, string>();
  for (const m of relsXml.matchAll(/<Relationship\s([^>]*?)\/?>/g)) {
    const id = /\bId="([^"]+)"/.exec(m[1])?.[1];
    const target = /\bTarget="([^"]+)"/.exec(m[1])?.[1];
    if (id && target) targets.set(id, target);
  }

  const sheets = new Map<string, string>();
  for (const m of workbookXml.matchAll(/<sheet\s([^>]*?)\/?>/g)) {
    const name = /\bname="([^"]*)"/.exec(m[1])?.[1];
    const rid = /\br:id="([^"]+)"/.exec(m[1])?.[1];
    if (!name || !rid) continue;
    let target = targets.get(rid);
    if (!target) continue;
    target = target.replace(/^\/+/, "");
    if (!target.startsWith("xl/")) target = `xl/${target}`;
    sheets.set(decode(name), target);
  }

  if (!sheets.size) throw new XlsxError("That workbook has no sheets in it.");

  const shared = sharedStrings(zip);
  const cache = new Map<string, SheetRows>();

  return {
    names: [...sheets.keys()],
    has: (name) => sheets.has(name),
    sheet(name) {
      const cached = cache.get(name);
      if (cached) return cached;
      const path = sheets.get(name);
      if (!path) return [];
      const xml = zip.read(path)?.toString("utf8");
      const rows = xml ? parseSheet(xml, shared) : [];
      cache.set(name, rows);
      return rows;
    },
  };
}
