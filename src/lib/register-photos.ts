import "server-only";

import { readWorkbook, type SheetImage } from "@/lib/xlsx";
import type { ParsedRegister } from "@/lib/register-file";

/**
 * The coaches' photographs, off the register and down to a size that can
 * travel.
 *
 * FQ put a headshot above each coach's column on the Assessment sheet, and
 * that is the only picture of a coach the platform has any access to — they
 * are not in the database, and the import has never carried them. They are
 * also the entire reason a register is 52 MB: thirty-four of them at a
 * megabyte and a half each, straight off a phone at 2646x3528.
 *
 * So they are re-encoded here, once, at the size the document actually prints
 * them: a 2 MB original becomes about 16 KB, which is what makes the rest of
 * this work. The parsed register travels back to the download route as JSON in
 * a form field — see the note in `actions/registers.ts` — and 34 photographs
 * at full size would be fifty megabytes of base64 in a hidden input. At 16 KB
 * they are half a megabyte for the lot, which the field already carries worse.
 *
 * Separate from `register-file.ts` because that parser is synchronous and has
 * no business being anything else: it reads a spreadsheet. This is the one
 * asynchronous thing in the whole path and it is image work, so it sits on its
 * own and is called after the parse.
 */

/**
 * Big enough for the box FQ print it in with a retina screen's worth to spare,
 * small enough that thirty-four of them are not a problem. Portrait, because
 * every one of them is.
 */
const MAX = { width: 360, height: 480 };
const QUALITY = 72;

/**
 * `sharp`, if it is there.
 *
 * It ships with Next for image optimisation rather than being asked for by
 * name, so it is loaded at arm's length and the photographs are simply skipped
 * if it ever stops coming. **Skipped, not embedded at full size**: a bundle of
 * twenty-four action plans carrying the originals would be fifty megabytes,
 * and a document with no photograph is better than one nobody can email.
 */
type Sharp = (typeof import("sharp"))["default"];
let sharpModule: Sharp | null | undefined;

async function loadSharp() {
  if (sharpModule !== undefined) return sharpModule;
  try {
    sharpModule = (await import("sharp")).default;
  } catch {
    sharpModule = null;
  }
  return sharpModule;
}

async function shrink(image: SheetImage) {
  const sharp = await loadSharp();
  if (!sharp) return null;
  try {
    const out = await sharp(image.data)
      .rotate() // Honour the EXIF orientation; these come off phones.
      .resize({ ...MAX, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: QUALITY, mozjpeg: true })
      .toBuffer();
    const meta = await sharp(out).metadata();
    if (!meta.width || !meta.height) return null;
    return { base64: out.toString("base64"), width: meta.width, height: meta.height };
  } catch {
    // A picture Excel accepted and sharp will not decode is one coach's
    // headshot missing, not a failed export.
    return null;
  }
}

/** A coach's photograph as the register and the documents pass it around. */
export type CoachPhoto = {
  /** JPEG bytes, base64. No data-URI prefix: it only ever goes into a docx. */
  base64: string;
  width: number;
  height: number;
};

/**
 * Fill in `coach.photo` for every coach the register has a picture of.
 *
 * Mutates rather than returning a copy, because the caller has just built the
 * register and is about to hand it to the page; threading a second structure
 * through for one optional field would be worse.
 *
 * The pictures sit one row below the coach names, in the same columns, so the
 * name row is found the same way the parser finds it and the column is the
 * join. Matching on the name text rather than the column index would be
 * matching a formula's cached value against a roster entry twice.
 */
export async function attachCoachPhotos(register: ParsedRegister, file: Buffer) {
  const book = readWorkbook(file);
  if (!book.has("Assessment")) return;

  const images = book.images("Assessment");
  if (!images.length) return;

  const rows = book.sheet("Assessment");
  const nameRow = rows.findIndex((row) => row.some((v) => /^coach student$/i.test(v.trim())));
  if (nameRow < 0) return;

  // The first row under the names that actually carries pictures. Not fixed at
  // `nameRow + 1`: the two registers differ by a row elsewhere already, and a
  // search costs nothing.
  const photoRow = images.findIndex((row, i) => i > nameRow && row.some(Boolean));
  if (photoRow < 0) return;

  const byName = new Map<string, number>();
  (rows[nameRow] ?? []).forEach((name, col) => {
    const key = name.trim().toLowerCase();
    if (key && key !== "coach student") byName.set(key, col);
  });

  await Promise.all(
    register.coaches.map(async (coach) => {
      const col = byName.get(coach.name.trim().toLowerCase());
      if (col === undefined) return;
      const image = images[photoRow]?.[col];
      if (!image) return;
      coach.photo = await shrink(image);
    }),
  );
}
