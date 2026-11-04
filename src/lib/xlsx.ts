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
 * The same grid, holding each cell's background colour as `RRGGBB`, or null.
 *
 * Only an explicit `rgb` fill. Excel will also name a fill by theme index and
 * a tint, which resolves against the workbook's theme and comes out as the
 * greys the registers shade their headers with — nothing a reader should be
 * guessing a meaning from. The colours that carry meaning on these sheets are
 * Excel's own Bad / Neutral / Good cell styles and the hand-picked variants
 * beside them, and all of those are written out as literal rgb.
 */
export type SheetFills = (string | null)[][];

/** A picture sitting in a cell, as bytes and the extension it was stored under. */
export type SheetImage = { data: Buffer; ext: string };

export type Workbook = {
  /** Sheet names in the order the workbook tabs them. */
  names: string[];
  sheet(name: string): SheetRows;
  /** The same sheet's cell fills, laid out to match `sheet(name)`. */
  fills(name: string): SheetFills;
  /** Pictures placed *in* cells on that sheet, by `[row][col]` as `sheet` is. */
  images(name: string): (SheetImage | null)[][];
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

/**
 * `styles.xml` as a lookup from a cell's `s=` index to its fill colour.
 *
 * Two hops: `cellXfs` indexes into `fills`, and a solid fill's colour is its
 * `fgColor` — the *foreground* of the pattern, which for `patternType="solid"`
 * is what you see. `bgColor` on a solid fill is ignored by Excel, so it is
 * ignored here too.
 */
function cellFills(zip: ZipArchive): (string | null)[] {
  const xml = zip.read("xl/styles.xml")?.toString("utf8");
  if (!xml) return [];

  const fillsXml = /<fills(?:\s[^>]*)?>([\s\S]*?)<\/fills>/.exec(xml)?.[1] ?? "";
  const fills = [...fillsXml.matchAll(/<fill(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/fill>)/g)].map(
    (m) => {
      const body = m[1] ?? "";
      if (!/patternType="solid"/.test(body)) return null;
      const fg = /<fgColor\s([^>]*?)\/?>/.exec(body)?.[1] ?? "";
      const rgb = /\brgb="([0-9A-Fa-f]{6,8})"/.exec(fg)?.[1];
      // Excel writes ARGB; the alpha is always FF on a fill and is dropped.
      return rgb ? rgb.slice(-6).toUpperCase() : null;
    },
  );

  const xfsXml = /<cellXfs(?:\s[^>]*)?>([\s\S]*?)<\/cellXfs>/.exec(xml)?.[1] ?? "";
  return [...xfsXml.matchAll(/<xf\s([^>]*?)(?:\/>|>[\s\S]*?<\/xf>)/g)].map((m) => {
    const id = Number(/\bfillId="(\d+)"/.exec(m[1])?.[1] ?? NaN);
    return Number.isInteger(id) ? (fills[id] ?? null) : null;
  });
}

function parseSheet(
  xml: string,
  shared: string[],
  styles: (string | null)[],
): { rows: SheetRows; fills: SheetFills; vms: number[][] } {
  const rows: SheetRows = [];
  const fills: SheetFills = [];
  const vms: number[][] = [];

  for (const rowMatch of xml.matchAll(/<row(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const body = rowMatch[1] ?? "";
    const cells = new Map<number, string>();
    const shades = new Map<number, string>();
    const pictures = new Map<number, number>();
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

      // The fill is kept whether or not the cell has text, because an empty
      // shaded cell is still a shaded cell. It does not widen the row, so a
      // run of blank formatting past the last value cannot stretch the sheet.
      const style = Number(/\bs="(\d+)"/.exec(attrs)?.[1] ?? NaN);
      const shade = Number.isInteger(style) ? styles[style] : null;
      if (shade) shades.set(col, shade);

      // An in-cell picture: the cell's text is `#VALUE!` and the picture is
      // behind this index. It does not widen the row either, for the same
      // reason the fill does not.
      const vm = Number(/\bvm="(\d+)"/.exec(attrs)?.[1] ?? NaN);
      if (Number.isInteger(vm) && vm > 0) pictures.set(col, vm);
    }

    const widestCell = Math.max(widest, ...pictures.keys(), -1);
    const row: string[] = [];
    const shadeRow: (string | null)[] = [];
    const vmRow: number[] = [];
    for (let i = 0; i <= widestCell; i++) {
      row.push(i <= widest ? (cells.get(i) ?? "") : "");
      shadeRow.push(shades.get(i) ?? null);
      vmRow.push(pictures.get(i) ?? 0);
    }
    row.length = widest + 1;
    // Rows carry an `r` attribute, and a sheet may skip empty ones entirely.
    // Pushed into position so a row index means the same thing it does in
    // Excel's own numbering minus one.
    const at = Number(/\br="(\d+)"/.exec(rowMatch[0])?.[1] ?? NaN);
    if (Number.isInteger(at) && at >= 1) {
      while (rows.length < at - 1) {
        rows.push([]);
        fills.push([]);
        vms.push([]);
      }
      rows[at - 1] = row;
      fills[at - 1] = shadeRow;
      vms[at - 1] = vmRow;
    } else {
      rows.push(row);
      fills.push(shadeRow);
      vms.push(vmRow);
    }
  }

  return { rows, fills, vms };
}

/**
 * Pictures placed inside cells, which is not the same thing as pictures *on* a
 * sheet and is why this is four files of indirection rather than one.
 *
 * A floating picture is a drawing anchored to a cell range, and that is what
 * `xl/drawings` holds — on these registers, the rubric screenshot and nothing
 * else. A coach's photograph is an **in-cell image**, Excel's newer "Place in
 * Cell", and it is stored as a *rich value*: the cell itself holds `#VALUE!`
 * and a `vm` attribute, and the bytes are four hops away.
 *
 * `vm="n"` → `metadata.xml`'s n-th value-metadata block → its `rc v=` → the
 * same index into `rdrichvalue.xml` → that record's first `<v>` → the same
 * index into `richValueRel.xml` → a relationship id → the file in `xl/media`.
 *
 * Every hop is one-based or zero-based in its own way, which is the only
 * reason this is fiddly rather than hard. The alternative was telling FQ the
 * photographs in their register are unreadable, which they plainly are not:
 * Excel shows them.
 */
function richValueImages(zip: ZipArchive): (() => SheetImage | null)[] {
  const text = (path: string) => zip.read(path)?.toString("utf8") ?? "";

  // metadata.xml: the value-metadata blocks, in order. Each names a rich-value
  // index. There is also a *cell*-metadata section, which is not this one.
  const metadata = text("xl/metadata.xml");
  const valueBlock = /<valueMetadata[\s\S]*?<\/valueMetadata>/.exec(metadata)?.[0] ?? "";
  const valueToRich = [...valueBlock.matchAll(/<bk>([\s\S]*?)<\/bk>/g)].map((m) => {
    const v = /<rc\s[^>]*?\bv="(\d+)"/.exec(m[1])?.[1];
    return v === undefined ? -1 : Number(v);
  });

  // rdrichvalue.xml: each record's first <v> is its index into the relation
  // list. The rest of the record is the picture's alt text and sizing, which
  // nothing here wants.
  const richToRel = [
    ...text("xl/richData/rdrichvalue.xml").matchAll(/<rv\s[^>]*?>([\s\S]*?)<\/rv>/g),
  ].map((m) => {
    const v = /<v>(\d+)<\/v>/.exec(m[1])?.[1];
    return v === undefined ? -1 : Number(v);
  });

  const relIds = [
    ...text("xl/richData/richValueRel.xml").matchAll(/<rel\s[^>]*?r:id="([^"]+)"/g),
  ].map((m) => m[1]);

  const targets = new Map<string, string>();
  for (const m of text("xl/richData/_rels/richValueRel.xml.rels").matchAll(
    /<Relationship\s([^>]*?)\/?>/g,
  )) {
    const id = /\bId="([^"]+)"/.exec(m[1])?.[1];
    const target = /\bTarget="([^"]+)"/.exec(m[1])?.[1];
    if (id && target) targets.set(id, target);
  }

  // Indexed by `vm` minus one, and resolved lazily: a register holds thirty-odd
  // of these at a megabyte and a half each, and a caller usually wants one.
  return valueToRich.map((rich) => () => {
    const rel = richToRel[rich];
    const target = rel === undefined ? undefined : targets.get(relIds[rel]);
    if (!target) return null;
    const path = `xl/${target.replace(/^(\.\.\/)+/, "")}`;
    const data = zip.read(path);
    if (!data) return null;
    return { data, ext: path.split(".").pop()?.toLowerCase() ?? "" };
  });
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
  const styles = cellFills(zip);
  const cache = new Map<string, { rows: SheetRows; fills: SheetFills; vms: number[][] }>();
  let richImages: (() => SheetImage | null)[] | null = null;

  const read = (name: string) => {
    const cached = cache.get(name);
    if (cached) return cached;
    const path = sheets.get(name);
    const xml = path ? zip.read(path)?.toString("utf8") : undefined;
    const parsed = xml ? parseSheet(xml, shared, styles) : { rows: [], fills: [], vms: [] };
    cache.set(name, parsed);
    return parsed;
  };

  return {
    names: [...sheets.keys()],
    has: (name) => sheets.has(name),
    sheet: (name) => read(name).rows,
    fills: (name) => read(name).fills,
    images(name) {
      const { vms } = read(name);
      if (!vms.some((row) => row.some((vm) => vm > 0))) return [];
      richImages ??= richValueImages(zip);
      const lookup = richImages;
      return vms.map((row) => row.map((vm) => (vm > 0 ? (lookup[vm - 1]?.() ?? null) : null)));
    },
  };
}
