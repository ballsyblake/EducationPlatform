/**
 * What a Learning Centre export can say about the course it came from.
 *
 * The file itself names the qualification and nothing else: `Courses` is "C
 * Diploma" on every row, and no column carries the venue, the stream, the year
 * or the dates. The rest is in the file *name* FQ downloads it under —
 * `fq-50-50-c-diploma-metro-logan-lightning-fc_participants.csv` — which is
 * worth reading precisely because the alternative is somebody retyping it.
 *
 * Everything here is a **suggestion**, filled into fields somebody can edit
 * before anything is created. A name is a weak source and this will be wrong
 * sooner or later; being wrong in an editable box costs a keystroke, and that
 * is the only reason it is safe to guess at all. Nothing is derived that a
 * person should decide: there are no dates here, and no course team.
 *
 * Pure, and client-safe, so the form can fill itself in the moment a file is
 * chosen rather than after a round trip.
 */

/** The qualifications these exports name, longest first so "C" can't match "C Diploma". */
const QUALIFICATIONS = [
  "pro diploma",
  "a diploma",
  "b diploma",
  "c diploma",
  "advanced coaching certificate",
  "game training certificate",
  "skill training certificate",
];

/** FQ's two delivery streams, which the file name puts after the qualification. */
const STREAMS = ["metro", "regional"];

/**
 * Words that keep their own capitalisation in a club's name.
 *
 * Title-casing "logan-lightning-fc" without this gives "Logan Lightning Fc",
 * which looks like a mistake because it is one.
 */
const ACRONYMS = new Set(["fc", "sc", "afc", "fq", "npl", "seq", "qld", "usc", "cfc"]);

/** Small words a club name keeps in lower case, unless they lead it. */
const MINOR = new Set(["of", "the", "and", "at", "on", "de"]);

export type CourseSuggestion = {
  title: string;
  qualification: string | null;
  stream: string | null;
  location: string | null;
  season: string;
  /** The file name with its noise stripped, shown so a wrong guess is obvious. */
  stem: string;
  /** Words in the name that are none of the above — a program tag, usually. */
  leftovers: string[];
};

/**
 * Strip an export's file name back to the words that describe the course.
 *
 * Drops the extension, the `_participants` the Learning Centre appends, the
 * download timestamp it sometimes appends after that, and a leading `fq`.
 */
export function stemOf(fileName: string) {
  return fileName
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_-]participants?.*$/i, "")
    .replace(/^fq[-_\s]+/i, "")
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function titleCase(words: string[]) {
  return words
    .map((word, at) => {
      const lower = word.toLowerCase();
      if (ACRONYMS.has(lower)) return lower.toUpperCase();
      if (at > 0 && MINOR.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

/**
 * A course, as far as a file name and a `Courses` column can describe one.
 *
 * The qualification is taken from the column where the file has one and from
 * the name otherwise: the column is the Learning Centre's own answer, and a
 * file somebody renamed should not beat it.
 */
export function suggestCourse({
  fileName,
  courseColumn,
  today = new Date(),
}: {
  fileName: string;
  courseColumn?: string | null;
  today?: Date;
}): CourseSuggestion {
  const stem = stemOf(fileName);
  const words = stem.split("-").filter(Boolean);
  const lower = words.map((w) => w.toLowerCase());

  // Find the qualification in the name as a run of words, so "c diploma" is one
  // thing and the venue starts after it.
  let qualificationFromName: string | null = null;
  let endsAt = -1;
  let startsAt = -1;
  for (const candidate of QUALIFICATIONS) {
    const parts = candidate.split(" ");
    for (let i = 0; i + parts.length <= lower.length; i += 1) {
      if (parts.every((part, k) => lower[i + k] === part)) {
        qualificationFromName = titleCase(parts);
        startsAt = i;
        endsAt = i + parts.length;
        break;
      }
    }
    if (qualificationFromName) break;
  }

  const column = courseColumn?.trim();
  const qualification = column || qualificationFromName;

  const after = endsAt === -1 ? [] : words.slice(endsAt);
  const stream = after.length && STREAMS.includes(after[0].toLowerCase())
    ? titleCase([after[0]])
    : null;

  const rest = stream ? after.slice(1) : after;
  const location = rest.length ? titleCase(rest) : null;

  // Anything before the qualification is a program tag the file name carries
  // and this app has no field for — "50 50" on the Logan Lightning export. It
  // is surfaced rather than folded into the title, because a guess about what
  // it means would end up in the name of a cohort.
  const leftovers = startsAt > 0 ? words.slice(0, startsAt) : [];

  // The register's own convention, which the 2026 imports already follow:
  // qualification, stream, venue. Matching it means a cohort created here sorts
  // and reads beside the ones that came off the spreadsheets.
  const title = [
    qualification ? `AFC / Football Australia ${qualification}` : titleCase(words),
    stream || location ? `— ${[stream, location].filter(Boolean).join(" @ ")}` : "",
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    title,
    qualification: qualification ?? null,
    stream,
    location,
    // No column, no file name convention, no safe inference: the year this is
    // being imported in is the only honest default, and it is editable.
    season: String(today.getUTCFullYear()),
    stem,
    leftovers,
  };
}
