import "server-only";

import {
  AlignmentType,
  BorderStyle,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import { FULL_WIDTH, para, text } from "@/lib/fq-docx";
import type {
  DeliveryLevel,
  ParsedRegister,
  RegisterCoach,
  RegisterDelivery,
} from "@/lib/register-file";

/**
 * The parts FQ's two assessment forms have in common.
 *
 * The C Diploma form (`assessment-plan-docx.ts`) and the B Diploma's two
 * (`b-diploma-docx.ts`) are genuinely different documents — different titles,
 * different tick tables, different rubrics, and the B carries a development
 * plan page the C has no equivalent of. What they are not different about is
 * the furniture: the same candidate block in the same four column widths, the
 * same delivery write-ups side by side, the same palette lifted from FQ's own
 * fills, the same hairline rule and cell padding, the same sign-off.
 *
 * That shared half lives here so the two layouts can diverge where FQ's
 * paperwork diverges and nowhere else. It is the same reasoning as the brand
 * furniture in `fq-docx.ts`, one level down: that file is Football Queensland's
 * letterhead, this one is their assessment form's bones.
 */

/* -------------------------------- Palette -------------------------------- */

// Lifted from the templates' own fills, by hex, rather than approximated from
// the app's palette. These are the colours a CET sees on the form they already
// use; a near miss reads as a different document.
export const SHADE = "F2F2F2"; // Label cells and the total-score cell.
export const NYC_FILL = "FFC0B8"; // Not Yet Competent, and the delivery headings.
export const COMPETENT_FILL = "FFEFAD";
export const HIGHLY_FILL = "BFEFAE";

/**
 * The three levels as a fill and as a text colour.
 *
 * The fills are FQ's own, off the grading band they already print. The text
 * colours are Excel's — `9C0006`, `9C5700`, `006100`, the fonts that come with
 * its Bad, Neutral and Good cell styles — because that is literally where they
 * come from: FQ paste a write-up out of the register's shaded cell and Word
 * keeps the colour it was typed in. Matthew Mckay's feedback letter carries
 * `006100` on every run for exactly that reason.
 */
export const LEVEL_FILL: Record<DeliveryLevel, string> = {
  NYC: NYC_FILL,
  C: COMPETENT_FILL,
  HC: HIGHLY_FILL,
};

export const LEVEL_TEXT: Record<DeliveryLevel, string> = {
  NYC: "9C0006",
  C: "9C5700",
  HC: "006100",
};

/** The templates' rule: one hairline, mid grey, on every edge. */
const RULE = { style: BorderStyle.SINGLE, size: 4, color: "929292" } as const;
const NONE = { style: BorderStyle.NONE, size: 0, color: "auto" } as const;

/**
 * Body text is 11pt here, not the 9pt the outcome sheet uses.
 *
 * The templates are set at 11, and size is most of why the first version read
 * as a different document however closely the structure matched: the same page
 * at 9pt looks like a dense internal report rather than something handed to a
 * coach. The delivery cells and the rubric descriptors drop to 9.5, which is
 * what the templates drop them to.
 */
export const BODY = 11;
export const SMALL = 9.5;

/**
 * The text column, in twips.
 *
 * A4 landscape is 16840 wide and the templates' margins are 1134 a side, which
 * leaves this. Every table on the page is built to it, because the templates
 * fix their columns and a table left to fit itself gets re-laid out by Word
 * around whatever happens to be in it — which, on a form whose cells are
 * deliberately empty, is nothing at all.
 */
export const TEXT_WIDTH = 16840 - 1134 * 2;

/* ------------------------------ Cell helpers ------------------------------ */

export type CellOpts = {
  fill?: string;
  span?: number;
  rowSpan?: number;
  /** Twips. The templates fix every table's columns, so this does too. */
  width?: number;
  align?: (typeof AlignmentType)[keyof typeof AlignmentType];
  middle?: boolean;
  borders?: boolean;
  /** A rule in some other colour — the development plan's boxes are maroon. */
  color?: string;
};

/**
 * The templates' own cell margins: 57 twips top and bottom, the default sides.
 *
 * Named because the sides used to be arithmetic elsewhere. Don't bring that
 * back: a table nested inside one of these cells is laid out in the cell's
 * content area and ends up inset by exactly this much, which is why the
 * deliveries are a sibling table rather than a nested one.
 */
export const CELL_PAD = { top: 57, bottom: 57, left: 108, right: 108 } as const;

export function tc(children: Paragraph[], o: CellOpts = {}) {
  const rule = o.color ? { ...RULE, color: o.color } : RULE;
  return new TableCell({
    children,
    columnSpan: o.span,
    rowSpan: o.rowSpan,
    shading: o.fill ? { fill: o.fill } : undefined,
    width: o.width ? { size: o.width, type: WidthType.DXA } : undefined,
    verticalAlign: o.middle ? VerticalAlign.CENTER : undefined,
    borders:
      o.borders === false
        ? { top: NONE, bottom: NONE, left: NONE, right: NONE }
        : { top: rule, bottom: rule, left: rule, right: rule },
    margins: { ...CELL_PAD },
  });
}

/** A label cell and its value, which is how the candidate block is built. */
function labelled(label: string, value: string | null, widths: [number, number]) {
  return [
    tc([para(label, { bold: true, size: BODY })], { fill: SHADE, width: widths[0] }),
    tc([para(value || "", { size: BODY })], { width: widths[1] }),
  ];
}

/** A bulleted line, as the templates list strengths, gaps and sub-headings. */
export function bullet(content: TextRun[] | string, size = BODY) {
  return new Paragraph({
    children: typeof content === "string" ? [text(content, { size })] : content,
    bullet: { level: 0 },
    spacing: { before: 0, after: 4 },
  });
}

/**
 * The diploma as the templates write it: `‘C’ Diploma`, curly quotes and all.
 *
 * Off the register's own `B Diploma` / `C Diploma`, because the whole document
 * is headed with it and FQ's wording quotes the letter.
 */
export function quotedDiploma(qualification: string | null) {
  const letter = qualification?.trim().match(/^([abc])\b/i)?.[1]?.toUpperCase();
  return letter ? `‘${letter}’ Diploma` : (qualification?.trim() || "course");
}

/** Which of FQ's two forms a register's coaches get. */
export function isBDiploma(register: ParsedRegister) {
  return /^b\b/i.test(register.qualification?.trim() ?? "");
}

/* ------------------------------ Page blocks ------------------------------- */

/** The templates' four-cell candidate block, in their own column widths. */
export function candidateBlock(coach: RegisterCoach, register: ParsedRegister) {
  const widths: [number, number] = [3666, 4129];
  const right: [number, number] = [3404, 3372];
  return new Table({
    width: FULL_WIDTH,
    columnWidths: [3666, 4129, 3404, 3372],
    rows: [
      new TableRow({
        children: [
          ...labelled("Candidate Name", coach.name, widths),
          ...labelled("Accreditation Level", quotedDiploma(register.qualification), right),
        ],
      }),
      new TableRow({
        children: [
          ...labelled("Course Date (MM/YY)", register.courseDates, widths),
          ...labelled("Course Location", register.location, right),
        ],
      }),
    ],
  });
}

/** One delivery's cell: the little form the register's own cell holds. */
export function deliveryCell(
  delivery: RegisterDelivery,
  width: number,
  color?: string,
  rating = true,
) {
  const line = (label: string, value: string | null) =>
    value
      ? [
          para([
            text(`${label}: `, { bold: true, size: SMALL, color }),
            text(value, { size: SMALL, color }),
          ]),
        ]
      : [];

  const blocks: Paragraph[] = [
    ...line("Assessor", delivery.assessor),
    ...line("When", delivery.block),
    ...line("Component", delivery.component),
    ...line("Topic", delivery.topic),
  ];

  if (delivery.comment) {
    blocks.push(para("Comment:", { bold: true, size: SMALL, color, before: 5 }));
    // The write-ups are paragraphed by the assessor and reflow badly as one
    // run, so the line breaks they typed are kept.
    for (const line of delivery.comment.split(/\r?\n/).filter(Boolean)) {
      blocks.push(para(line, { size: SMALL, color }));
    }
  }

  if (delivery.actions.length) {
    blocks.push(para("Action plan:", { bold: true, size: SMALL, color, before: 5 }));
    delivery.actions.forEach((step, i) => {
      blocks.push(para(`${i + 1}. ${step}`, { size: SMALL, color }));
    });
  }

  if (rating && delivery.rating !== null) {
    blocks.push(
      para(
        [
          text("Session rating (1-5): ", { bold: true, size: SMALL, color }),
          text(String(delivery.rating), { size: SMALL, color }),
        ],
        { before: 5 },
      ),
    );
  }

  return tc(blocks.length ? blocks : [para("—", { size: SMALL, color })], { width });
}

/**
 * The practical write-ups, one column each, as both templates set them out.
 *
 * Side by side rather than stacked because that is how a CET reads them: the
 * point of the block is the arc across the deliveries, and a coach whose first
 * session was prompted throughout and whose third was not has a story that a
 * vertical list hides.
 *
 * Its own table, never nested in the box above it. A table nested in a cell is
 * laid out in that cell's content area, so it sits inset by the padding on the
 * left, and Word will not let a cell end on a table, so it appends its own
 * paragraph underneath — a band of white along the bottom. Both can be worked
 * around and both come back on a document whose write-ups are long enough to
 * split across a page, where the padding is re-applied to the continuation.
 */
export function deliveryTable(
  coach: RegisterCoach,
  width: number,
  o: {
    /** One fill for every heading, as the C form prints them. */
    headerFill?: string;
    /**
     * Colour each column by the level the CET gave that session, which the
     * register carries as the shading on the write-up cell.
     *
     * `"fill"` shades the heading and `"text"` colours the write-up, which is
     * how FQ's own two B Diploma documents do it respectively. A delivery
     * whose cell was left unshaded comes out plain either way, rather than
     * being guessed at from the 1-5 session rating.
     */
    byLevel?: "fill" | "text";
    /**
     * Print the free-text `Session Rating: n` off the register under each
     * write-up. The C form does; neither B document does, on FQ's own copies
     * or on Blake's — the B is assessed NYC / C / HC and the 1-5 number is a
     * different instrument, so putting it on a page that also ticks a level
     * invites the conversion between them that nobody has published.
     */
    rating?: boolean;
  } = {},
): (Paragraph | Table)[] {
  if (!coach.deliveries.length) {
    return [
      para("No practical delivery write-ups for this coach on the register's Assessment sheet.", {
        size: BODY,
      }),
    ];
  }

  const each = Math.floor(width / coach.deliveries.length);
  return [
    new Table({
      width: FULL_WIDTH,
      columnWidths: coach.deliveries.map(() => each),
      rows: [
        new TableRow({
          tableHeader: true,
          children: coach.deliveries.map((d) =>
            tc(
              [
                para(`Practical Delivery ${d.deliveryNo}`, {
                  bold: true,
                  size: BODY,
                  align: AlignmentType.CENTER,
                }),
              ],
              {
                width: each,
                fill:
                  o.byLevel === "fill" && d.level ? LEVEL_FILL[d.level] : o.headerFill,
              },
            ),
          ),
        }),
        new TableRow({
          children: coach.deliveries.map((d) =>
            deliveryCell(
              d,
              each,
              o.byLevel === "text" && d.level ? LEVEL_TEXT[d.level] : undefined,
              o.rating ?? true,
            ),
          ),
        }),
      ],
    }),
  ];
}

/**
 * The CET signature rows, off the register's own staff block.
 *
 * Narrowed to the CETs who actually assessed *this* coach. FQ's templates have
 * two signature lines because a coach is watched by two assessors; a B Diploma
 * course has five CETs on it, and five lines on a document three of them never
 * saw is a form that invites the wrong signature.
 *
 * Matched on first name, because the Assessment sheet names an assessor by
 * first name alone ("Priscilla", "Martin") and the staff block has them in
 * full. Ambiguous where a course has two Martins — then both lines print, which
 * is the right failure: the assessors know which of them it was and the
 * document does not have to guess.
 */
export function signOff(
  coach: RegisterCoach,
  register: ParsedRegister,
  o: {
    columns?: number[];
    /** Rows to run above the signatures, inside the same table. */
    before?: TableRow[];
    /**
     * A signature column per CET, which is how the C form and the B action
     * plan are signed. The B feedback letter has no signature at all and names
     * two CETs a row, because nobody countersigns a letter.
     */
    signature?: boolean;
  } = {},
) {
  const COLS = o.columns ?? [2505, 5292, 2693, 4081];
  const signature = o.signature !== false;

  // CET1..CET5 only. The staff block also carries CX Support and whoever else
  // was on the course, and they do not sign an assessment.
  const cets = register.staff.filter((s) => /^cet/i.test(s.role));
  const assessors = new Set(
    coach.deliveries.map((d) => d.assessor?.trim().split(/\s+/)[0]?.toLowerCase()).filter(Boolean),
  );
  const theirs = cets.filter((s) => assessors.has(s.name.split(/\s+/)[0].toLowerCase()));
  const signing = theirs.length
    ? theirs
    : cets.length
      ? cets
      : [
          { role: "CET 1", name: "" },
          { role: "CET 2", name: "" },
        ];

  // "CET 1", "CET 2" — renumbered for the document rather than carried over as
  // CET3/CET4, which are positions on the course.
  const label = (i: number, width: number) =>
    tc([para(`CET ${i + 1}`, { size: BODY })], { fill: SHADE, width });
  const name = (value: string, width: number) =>
    tc([para(value, { size: BODY })], { width });

  const rows: TableRow[] = [];
  if (signature) {
    for (const [i, staff] of signing.entries()) {
      rows.push(
        new TableRow({
          children: [
            label(i, COLS[0]),
            name(staff.name, COLS[1]),
            tc([para("Signature", { size: BODY })], { fill: SHADE, width: COLS[2] }),
            tc([para("", { size: BODY })], { width: COLS[3] }),
          ],
        }),
      );
    }
  } else {
    for (let i = 0; i < signing.length; i += 2) {
      const second = signing[i + 1];
      rows.push(
        new TableRow({
          children: [
            label(i, COLS[0]),
            name(signing[i].name, COLS[1]),
            ...(second
              ? [label(i + 1, COLS[2]), name(second.name, COLS[3])]
              : [
                  tc([para("", { size: BODY })], { width: COLS[2] }),
                  tc([para("", { size: BODY })], { width: COLS[3] }),
                ]),
          ],
        }),
      );
    }
  }

  return new Table({
    width: FULL_WIDTH,
    columnWidths: COLS,
    rows: [...(o.before ?? []), ...rows],
  });
}
