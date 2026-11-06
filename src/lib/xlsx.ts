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

/**
 * A note somebody attached to a cell, keyed on the cell it is attached to.
 *
 * Read because a spreadsheet kept by hand grows fields it has no columns for,
 * and a comment is where they go. The coach register's only record that one
 * coach had stopped coaching was the words "Doesn't coach anymore" on a cell
 * in the name column — invisible to every filter, sort and export, and the
 * reason `CoachingStatus` exists. An importer that ignored comments would have
 * imported that coach as active.
 */
export type SheetComments = Map<string, string>;

export type Workbook = {
  /** Sheet names in the order the workbook tabs them. */
  names: string[];
  sheet(name: string): SheetRows;
  /** Cell notes on one sheet, by cell reference — "A209" -> "Doesn't coach anymore". */
  comments(name: string): SheetComments;
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
/**
 * The comment text on each cell of one sheet.
 *
 * Excel writes a comment twice. The modern form is a threaded comment in
 * `xl/threadedComments/`, holding the author, the time and the text; the
 * legacy form in `xl/comments*.xml` is kept beside it for older readers and
 * wraps the same words in a paragraph of boilerplate about upgrading Excel.
 * The threaded file is preferred for that reason, and the legacy one read only
 * where there is no threaded file — a comment written by something other than
 * a current Excel, which the registers have never produced but a hand-kept
 * workbook might.
 *
 * A cell with a reply thread gives its comments joined in order, because the
 * reply is usually the answer: "Still coaching?" / "No, retired".
 */
function sheetComments(zip: ZipArchive, relsPath: string): SheetComments {
  const out: SheetComments = new Map();
  const rels = zip.read(relsPath)?.toString("utf8");
  if (!rels) return out;

  const find = (kind: string) => {
    for (const m of rels.matchAll(/<Relationship\s([^>]*?)\/?>/g)) {
      const type = /\bType="([^"]+)"/.exec(m[1])?.[1] ?? "";
      if (!type.endsWith(`/${kind}`)) continue;
      const target = /\bTarget="([^"]+)"/.exec(m[1])?.[1];
      if (!target) continue;
      // Sheet relationships are written relative to xl/worksheets/.
      return `xl/${target.replace(/^\/+/, "").replace(/^(\.\.\/)+/, "")}`;
    }
    return null;
  };

  const add = (ref: string, text: string) => {
    const trimmed = text.replace(/\s+/g, " ").trim();
    if (!ref || !trimmed) return;
    const had = out.get(ref);
    out.set(ref, had ? `${had} / ${trimmed}` : trimmed);
  };

  const threadedPath = find("threadedComment");
  const threaded = threadedPath ? zip.read(threadedPath)?.toString("utf8") : null;
  if (threaded) {
    for (const m of threaded.matchAll(
      /<threadedComment\s([^>]*?)>([\s\S]*?)<\/threadedComment>/g,
    )) {
      const ref = /\bref="([A-Z]+\d+)"/.exec(m[1])?.[1] ?? "";
      const text = /<text(?:\s[^>]*)?>([\s\S]*?)<\/text>/.exec(m[2])?.[1];
      add(ref, decode(text ?? ""));
    }
    return out;
  }

  const legacyPath = find("comments");
  const legacy = legacyPath ? zip.read(legacyPath)?.toString("utf8") : null;
  if (!legacy) return out;
  for (const m of legacy.matchAll(/<comment\s([^>]*?)>([\s\S]*?)<\/comment>/g)) {
    const ref = /\bref="([A-Z]+\d+)"/.exec(m[1])?.[1] ?? "";
    add(ref, innerText(m[2]));
  }
  return out;
}

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
  const notes = new Map<string, SheetComments>();

  return {
    names: [...sheets.keys()],
    has: (name) => sheets.has(name),
    comments(name) {
      const cached = notes.get(name);
      if (cached) return cached;
      const path = sheets.get(name);
      // "xl/worksheets/sheet1.xml" -> "xl/worksheets/_rels/sheet1.xml.rels".
      const found = path
        ? sheetComments(zip, path.replace(/([^/]+)$/, "_rels/$1.rels"))
        : new Map<string, string>();
      notes.set(name, found);
      return found;
    },
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
