/**
 * Football Queensland's Word furniture, shared by every document the app
 * exports.
 *
 * FQ circulate .docx because a Word file is a thing other people open, edit and
 * sign, which a printed page is not — so the coach assessment outcome sheet,
 * the action plan and the feedback letter all come out of here, and all three
 * carry the same letterhead, the same maroon, the same typeface and the same
 * cell padding.
 *
 * Here rather than in whichever document was written first: the brand is one
 * decision and three copies of it is how two of them end up a shade out. What
 * each document still owns is its own *layout*, which is the duplication worth
 * naming — see the note in `CLAUDE.md` about the outcome sheet existing in HTML
 * and in Word, and move a field in both.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  AlignmentType,
  BorderStyle,
  Footer,
  Header,
  ImageRun,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";

/* ------------------------------- Brand ----------------------------------- */

// Football Queensland's Deep Maroon, matching `--color-maroon-800` in
// globals.css. docx wants bare hex, no leading hash.
export const MAROON = "621333";
export const INK = "3D3D3D";
export const MUTED = "6B6B6B";
export const RULE = "D4D4D4";

// Gibson is the brand typeface and is licensed, so it is not bundled; the
// guidelines name Arial as the substitute, which is what `--font-brand` falls
// back to on the page.
export const FONT = "Arial";

/** Half-points, which is what docx sizes are in. */
export const pt = (n: number) => n * 2;

export const THIN = { style: BorderStyle.SINGLE, size: 4, color: RULE };
export const CELL_BORDERS = { top: THIN, bottom: THIN, left: THIN, right: THIN };
export const NO_BORDERS = {
  top: { style: BorderStyle.NONE, size: 0, color: "auto" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
  left: { style: BorderStyle.NONE, size: 0, color: "auto" },
  right: { style: BorderStyle.NONE, size: 0, color: "auto" },
};

export const FULL_WIDTH = { size: 100, type: WidthType.PERCENTAGE };

export type TextOpts = {
  bold?: boolean;
  size?: number;
  color?: string;
  caps?: boolean;
  before?: number;
  after?: number;
  align?: (typeof AlignmentType)[keyof typeof AlignmentType];
};

export function text(content: string, o: TextOpts = {}) {
  return new TextRun({
    text: o.caps ? content.toUpperCase() : content,
    bold: o.bold,
    size: pt(o.size ?? 9),
    color: o.color ?? INK,
    font: FONT,
  });
}

export function para(content: string | TextRun[], o: TextOpts = {}) {
  return new Paragraph({
    children: typeof content === "string" ? [text(content, o)] : content,
    alignment: o.align,
    spacing: { before: pt(o.before ?? 0), after: pt(o.after ?? 2) },
  });
}

/** A cell, since every one of them wants the same borders and padding. */
export function cell(
  children: Paragraph[],
  o: { width?: number; shaded?: boolean } = {},
) {
  return new TableCell({
    children,
    borders: CELL_BORDERS,
    shading: o.shaded ? { fill: "F7F7F7" } : undefined,
    width: o.width ? { size: o.width, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
  });
}

/** The maroon section band FQ's form rules each block off with. */
export function heading(label: string) {
  return new Table({
    width: FULL_WIDTH,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children: [
              para(label, { bold: true, size: 8, color: "FFFFFF", caps: true }),
            ],
            shading: { fill: MAROON },
            borders: CELL_BORDERS,
            margins: { top: 40, bottom: 40, left: 80, right: 80 },
          }),
        ],
      }),
    ],
  });
}

/* ------------------------------- Chrome ---------------------------------- */

/**
 * Football Queensland's master logo, for the page header.
 *
 * The same file the app serves at `/brand/fq-logo-horizontal.png`, read off
 * disk rather than fetched: this runs on the server that would be answering
 * the request, and a document that silently loses its letterhead because the
 * app could not reach itself is worse than one that throws while being built.
 *
 * Read once. It is 80KB and every sheet in a thirty-five coach export would
 * otherwise read it again.
 */
let logoCache: Buffer | null | undefined;

async function fqLogo() {
  if (logoCache !== undefined) return logoCache;
  try {
    logoCache = await readFile(
      path.join(process.cwd(), "public", "brand", "fq-logo-horizontal.png"),
    );
  } catch {
    // The guidelines are explicit that nothing may stand in for the mark, so a
    // missing file means a header with no logo rather than a drawn one.
    logoCache = null;
  }
  return logoCache;
}

/** The logo's own proportions, 2640x1021, at a sensible height on the page. */
export const LOGO = { width: 132, height: 51 };

/**
 * The letterhead, repeated on every page.
 *
 * Laid out as FQ's own `'C' DIPLOMA PRACTICAL COACHING ASSESSMENT` template
 * does it: the mark on the left, the document's own name on the right, and a
 * maroon rule under both.
 */
export async function letterhead(title: string) {
  const logo = await fqLogo();
  return new Header({
    children: [
      new Table({
        width: FULL_WIDTH,
        borders: {
          ...NO_BORDERS,
          bottom: { style: BorderStyle.SINGLE, size: 12, color: MAROON },
          insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
          insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
        },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                borders: NO_BORDERS,
                width: { size: 40, type: WidthType.PERCENTAGE },
                margins: { top: 0, bottom: 80, left: 0, right: 0 },
                children: [
                  new Paragraph({
                    children: logo
                      ? [
                          new ImageRun({
                            data: new Uint8Array(logo),
                            transformation: LOGO,
                            type: "png",
                            altText: {
                              title: "Football Queensland",
                              description: "Football Queensland",
                              name: "Football Queensland",
                            },
                          }),
                        ]
                      : [
                          text("Football Queensland", {
                            bold: true,
                            size: 11,
                            color: MAROON,
                          }),
                        ],
                    spacing: { before: 0, after: 0 },
                  }),
                ],
              }),
              new TableCell({
                borders: NO_BORDERS,
                width: { size: 60, type: WidthType.PERCENTAGE },
                verticalAlign: VerticalAlign.BOTTOM,
                margins: { top: 0, bottom: 80, left: 0, right: 0 },
                children: [
                  para(title, {
                    bold: true,
                    size: 12,
                    color: MAROON,
                    caps: true,
                    align: AlignmentType.RIGHT,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

/** The document's name and the page number, as FQ's template foots a page. */
export function footer(title: string) {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: RULE } },
        spacing: { before: pt(4), after: 0 },
        children: [
          text(`${title}    `, { size: 7, color: MUTED }),
          new TextRun({
            children: [
              "Page ",
              PageNumber.CURRENT,
              " of ",
              PageNumber.TOTAL_PAGES,
            ],
            size: pt(7),
            color: MUTED,
            font: FONT,
          }),
        ],
      }),
    ],
  });
}

/**
 * A filename somebody can find again on their desktop.
 *
 * Anything a filesystem argues with becomes a hyphen — Word on Windows refuses
 * a name with a colon in it, and FQ's course titles carry them — and the whole
 * thing is kept short. A cohort's full title plus a suffix ran past a hundred
 * characters once percent-encoded, and Chromium gave up on the header and
 * saved the file as "download"; callers pass a shortened title for the same
 * reason.
 */
const MAX_STEM = 60;

export function docxFilename(...parts: (string | null | undefined)[]) {
  let stem = parts
    .filter(Boolean)
    .join(" - ")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  if (stem.length > MAX_STEM) stem = `${stem.slice(0, MAX_STEM).trimEnd()}…`;
  return `${stem || "coach-assessment"}.docx`;
}

/* --------------------- FQ's assessment-form chrome ----------------------- */

/**
 * The header and footer of FQ's `'C' Diploma Practical Coaching Assessment`.
 *
 * A second pair, not a replacement. FQ's two assessment documents genuinely
 * look different: the coach assessment outcome sheet (Karl Dodd's C Licence
 * file) is maroon-banded with the mark on the left, and the action plan form
 * is plain — the document's name in black on the left, the mark on the right,
 * no rule under either, and the name again small in the footer beside a bare
 * page number. Matching one to the other would mean one of the two no longer
 * matching the paperwork it was copied from.
 */
export async function assessmentHeader(title: string) {
  const logo = await fqLogo();
  return new Header({
    children: [
      new Table({
        width: FULL_WIDTH,
        borders: NO_BORDERS,
        rows: [
          new TableRow({
            children: [
              new TableCell({
                borders: NO_BORDERS,
                width: { size: 70, type: WidthType.PERCENTAGE },
                verticalAlign: VerticalAlign.CENTER,
                margins: { top: 0, bottom: 0, left: 0, right: 0 },
                children: [para(title, { bold: true, size: 11, caps: true })],
              }),
              new TableCell({
                borders: NO_BORDERS,
                width: { size: 30, type: WidthType.PERCENTAGE },
                verticalAlign: VerticalAlign.CENTER,
                margins: { top: 0, bottom: 0, left: 0, right: 0 },
                children: [
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    spacing: { before: 0, after: 0 },
                    children: logo
                      ? [
                          new ImageRun({
                            data: new Uint8Array(logo),
                            transformation: LOGO,
                            type: "png",
                            altText: {
                              title: "Football Queensland",
                              description: "Football Queensland",
                              name: "Football Queensland",
                            },
                          }),
                        ]
                      : [text("Football Queensland", { bold: true, size: 11, color: MAROON })],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

/** The same document's footer: its name on the left, the page number alone. */
export function assessmentFooter(title: string) {
  return new Footer({
    children: [
      new Table({
        width: FULL_WIDTH,
        borders: NO_BORDERS,
        rows: [
          new TableRow({
            children: [
              new TableCell({
                borders: NO_BORDERS,
                width: { size: 80, type: WidthType.PERCENTAGE },
                margins: { top: 0, bottom: 0, left: 0, right: 0 },
                children: [para(title, { size: 10 })],
              }),
              new TableCell({
                borders: NO_BORDERS,
                width: { size: 20, type: WidthType.PERCENTAGE },
                margins: { top: 0, bottom: 0, left: 0, right: 0 },
                children: [
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    spacing: { before: 0, after: 0 },
                    // The page number on its own, as the form foots it. No
                    // "of n": FQ's own file doesn't carry one, and on a bundle
                    // of one-coach documents a total would be the only thing
                    // on the page that counted something other than this
                    // coach.
                    children: [
                      new TextRun({
                        children: [PageNumber.CURRENT],
                        size: pt(10),
                        color: INK,
                        font: FONT,
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}
