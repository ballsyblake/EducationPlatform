import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { CharacterSet } from "docx";

/**
 * The handwriting face the CETs' names are set in on the signature line.
 *
 * FQ type a name where a pen would go — the signature column on every one of
 * these forms is the CET's name again, not a box left blank — so the name is
 * doing a signature's job in the document's body font. Setting it in a script
 * face is the whole of Blake's ask of 2026-11-24, and it applies to that
 * column and nothing else: a form where any other run drifted into
 * handwriting would stop looking like FQ's own file.
 *
 * **The font is embedded in the .docx, not named and hoped for.** Word renders
 * a font the reader has installed, and nothing script-like is installed
 * everywhere: Segoe Script is Windows only, Bradley Hand is Mac only, and a
 * name Word cannot resolve falls back to the body font, which is the one
 * outcome that would make this change invisible on somebody else's machine.
 * These documents are circulated to coaches and countersigned by people whose
 * machines we know nothing about, so the glyphs travel with the file. `docx`
 * writes the embedded font obfuscated, which is what Word wants.
 *
 * Sacramento is under the SIL Open Font License, which permits embedding and
 * redistribution (`public/brand/fonts/OFL-Sacramento.txt`, kept beside the
 * file because the licence asks for it). Shipped whole rather than subset:
 * the licence's reserved-name clause is about modified copies, and 80KB on an
 * 80KB document is not worth a licence argument.
 *
 * **A one-word family name, deliberately.** `docx` names the embedded font's
 * part inside the package after the font, and a two-word family — Alex Brush,
 * Great Vibes — puts a raw space in a part name and in the relationship that
 * points at it, which is not a legal OPC part name. LibreOffice shrugs; Word
 * is the one that calls a package it dislikes unreadable content, and these
 * files go out to coaches. Any replacement face wants a single-word name, or
 * the package needs rewriting after `Packer`.
 */
export const SIGNATURE_FONT = "Sacramento";
const SIGNATURE_FILE = "Sacramento-Regular.ttf";

/**
 * Points, against the 11pt body.
 *
 * Script faces have a much smaller x-height than Arial, so a name set at the
 * body size reads as a half-size afterthought next to the label beside it.
 * Fourteen puts the lowercase of a signature at about the height of the
 * surrounding text; the cell is a single line either way.
 */
export const SIGNATURE_SIZE = 13;

let cache: Buffer | null | undefined;

/**
 * The font file, read off disk once.
 *
 * The same shape as `fqLogo` in `fq-docx.ts`, and missing is survivable the
 * same way: the document still generates, Word substitutes for the name it
 * cannot resolve, and a signature line in the body font is a cosmetic loss,
 * not a failed export.
 */
async function signatureFontFile() {
  if (cache !== undefined) return cache;
  try {
    cache = await readFile(
      path.join(process.cwd(), "public", "brand", "fonts", SIGNATURE_FILE),
    );
  } catch {
    cache = null;
  }
  return cache;
}

/** What `new Document({ fonts })` wants, or nothing if the file is missing. */
export async function signatureFonts() {
  const data = await signatureFontFile();
  if (!data) return undefined;
  return [{ name: SIGNATURE_FONT, data, characterSet: CharacterSet.ANSI }];
}
