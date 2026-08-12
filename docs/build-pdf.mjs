/*
 * Regenerates the PDF from the HTML source beside it.
 *
 * Playwright is deliberately NOT a dependency of this project — it would pull a
 * browser download into every `npm ci`, including the production image, to
 * regenerate one document. Install it for the one-off instead:
 *
 *   npm i --no-save playwright && npx playwright install chromium
 *   node docs/build-pdf.mjs
 *
 * The committed PDF is the deliverable; this only exists so it can be rebuilt
 * when the HTML changes.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error(
    "Playwright isn't installed. Run:\n" +
      "  npm i --no-save playwright && npx playwright install chromium\n" +
      "then re-run this script.",
  );
  process.exit(1);
}

// Resolved against this file, so the script runs from any working directory.
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "how-a-shield-is-awarded.html");
const TMP = join(HERE, ".print.html");
const OUT = join(HERE, "how-a-shield-is-awarded.pdf");

// The artifact file is a fragment — the publish step wraps it. For print we
// need a real document, plus a print stylesheet the screen version doesn't want.
const fragment = readFileSync(SRC, "utf8");

const printCss = `
<style>
  @page { size: A4; margin: 15mm 13mm 17mm; }

  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  /* Paper is the ground. The screen tint prints as a floating grey panel that
     the text runs past at the right edge, because the painted box is the body
     content box rather than the sheet. */
  body { background: #fff; }

  body { font-size: 10.5pt; line-height: 1.5; }
  .wrap { max-width: none; padding: 0; }

  /* Screen shadows and scroll containers make no sense on paper. */
  figure { box-shadow: none; overflow: visible; padding: 10pt 8pt 6pt; }
  figure svg { min-width: 0; }
  .table-wrap { overflow: visible; }
  table { min-width: 0; }

  /* Keep things that read as one unit on one page. */
  figure, figcaption { break-inside: avoid; }
  .note, .ref, .split > div { break-inside: avoid; }
  tr, li { break-inside: avoid; }
  thead { display: table-header-group; }
  .phase-head { break-after: avoid; }
  h2, h3 { break-after: avoid; }

  /* Each phase starts a page: this is a reference document people jump around
     in, so a phase that begins two-thirds down a page is harder to find. */
  .phase { break-before: page; margin-top: 0; padding-top: 4pt; }
  .phase:first-of-type { break-before: auto; }
  .appendix { break-before: page; margin-top: 0; }

  .masthead { padding-bottom: 12pt; }
  h1 { font-size: 30pt; }
  .standfirst { font-size: 12pt; }
  .phase-num { font-size: 22pt; }
  h2 { font-size: 15pt; }

  /* Two-up splits are fine on A4 and save a lot of paper. */
  .split { grid-template-columns: 1fr 1fr; gap: 14pt; }
  .phase-body { margin-left: 34pt; }

  a { text-decoration: none; }
</style>`;

writeFileSync(
  TMP,
  `<!doctype html><html lang="en-AU" data-theme="light"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `</head><body>${fragment}${printCss}</body></html>`,
);

// Honour a preinstalled browser when one is configured, otherwise let
// Playwright find the copy it downloaded itself.
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const page = await browser.newPage();

// Force the light palette regardless of the rendering machine's preference —
// a PDF printed from a dark-mode host would come out with a black ground.
await page.emulateMedia({ media: "print", colorScheme: "light" });
await page.goto(pathToFileURL(TMP).href, { waitUntil: "networkidle" });

await page.pdf({
  path: OUT,
  format: "A4",
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: "<span></span>",
  footerTemplate: `
    <div style="width:100%;padding:0 13mm;font-family:-apple-system,system-ui,sans-serif;
                font-size:7pt;color:#8a7d81;display:flex;justify-content:space-between;">
      <span>Football Queensland &middot; Club Development &amp; Assessment</span>
      <span>How a shield is awarded &nbsp;&middot;&nbsp; <span class="pageNumber"></span> / <span class="totalPages"></span></span>
    </div>`,
  margin: { top: "15mm", bottom: "17mm", left: "13mm", right: "13mm" },
});

await browser.close();
console.log("written:", OUT);
