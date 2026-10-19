"""Turn Football Queensland's post-course support registers into one JSON.

    python3 scripts/extract-post-course-support.py \
        "2023-2026 B Diplomas - More Support.xlsx" \
        "2026 C Diplomas - More Support.xlsx" \
        -o prisma/data/post-course-support.json

Two steps rather than one, for the reason `extract-b-diploma-2026.py` gives:
the workbooks are the coach education team's working documents and will change
shape next intake, while the JSON is a flat record that can be reviewed,
diffed and re-imported without Excel in the loop.

**Addresses here are real and are not anonymised**, which is the one way this
differs from the register extractor. A support case has to reach the coach it
belongs to — on a cohort whose register was never loaded, the address is the
only thing that identifies them — and an address rewritten to `example.com`
would create a second account that can never sign in. That makes the output a
file of real people's contact details and assessment outcomes: see the
importer's header for where it is meant to live.

What the workbooks hold, sheet by sheet:

  - "Coaches More Support <years>" — one row per coach on post-course support.
    The source of every case. Both files have one; the B file has a second for
    the 2023 and 2024 intakes, with the on-course ratings that explain the
    referral.
  - "Sheet1" — a Microsoft Form's responses: when a coach is free to be
    visited. Read for availability only, and matched to a case by address.
  - "Sheet1 SB" — an older, shorter copy of the 2023 referral list. Skipped: it
    carries nothing the support sheets don't, and importing a second copy of a
    row is how one coach ends up with two cases.
  - "Sheet2" — kit sizes. Not ours.
"""
import argparse, datetime, json, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from xlsx_reader import load

# Excel's day zero. 1899-12-30 rather than 12-31 absorbs the phantom 1900 leap
# day the format still carries for Lotus compatibility.
EPOCH = datetime.date(1899, 12, 30)

# Educators are named by first name alone, the way the registers name them.
# Resolved to the full name the registers use so that "Martin" on a support
# sheet and "Martin Docherty" on a register are one account rather than two.
# Copied from extract-b-diploma-2026.py rather than shared: the two scripts
# read different documents and neither should start failing because the other
# learned a new name.
CANONICAL = {
    "tom": "Tom Laxton",
    "davide": "Davide Bertamini",
    "gabor": "Gabor Ganczer",
    "briac": "Briac Williams",
    "tyler": "Tyler Logan",
    "matt": "Matt Poole",
    "poole": "Matt Poole",
    "alec": "Alec Wilson",
    "priscilla": "Priscilla Tan",
    "pris": "Priscilla Tan",
    "martin": "Martin Docherty",
    "dale": "Dale Hill",
    "scott": "Scott Grimshaw",
    "craig": "Craig Midgley",
    "gareth": "Gareth Thomson",
    "frank": "Frank Monteverde",
}

BLANK = {"", "-", "none", "n/a", "na", "tbc", "tbd", "?"}


def blank(v):
    return str(v or "").strip().lower() in BLANK


def clean(v):
    """Collapse the whitespace Excel leaves behind, keeping internal newlines."""
    s = str(v or "").replace("\xa0", " ").strip()
    return re.sub(r"[ \t]+", " ", s)


def serial_to_date(v):
    """'46265' -> '2026-08-16'. Anything that isn't a serial comes back as None."""
    try:
        n = float(v)
    except (TypeError, ValueError):
        return None
    if n < 1 or n > 100000:
        return None
    return (EPOCH + datetime.timedelta(days=int(n))).isoformat()


def a_date(v):
    """A cell holding a date, however the sheet happens to hold it.

    Returns (iso, problem). A cell nobody can read comes back as (None, text)
    rather than as a guess — "31/02/2027" is in these sheets, and a deadline
    the importer invents is a deadline somebody is held to.
    """
    raw = clean(v)
    if blank(raw):
        return None, None
    iso = serial_to_date(raw)
    if iso:
        return iso, None
    # Already spelled out: "2025-12-11 00:00:00".
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", raw)
    if m:
        try:
            return datetime.date(*map(int, m.groups())).isoformat(), None
        except ValueError:
            return None, raw
    # Typed by hand: "31/02/2027", "5/5/25".
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{2,4})$", raw)
    if m:
        d, mth, y = (int(x) for x in m.groups())
        y += 2000 if y < 100 else 0
        try:
            return datetime.date(y, mth, d).isoformat(), None
        except ValueError:
            return None, raw
    return None, raw


def a_day(text, default_year):
    """A date inside a sentence: "completed 27/04", "Passed 05/05/25"."""
    m = re.search(r"\b(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?\b", text)
    if not m:
        return None
    d, mth, y = int(m.group(1)), int(m.group(2)), m.group(3)
    year = int(y) + (2000 if y and int(y) < 100 else 0) if y else default_year
    try:
        return datetime.date(year, mth, d).isoformat()
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# The outcome column
# ---------------------------------------------------------------------------
#
# Free text written over three years by five people, and the only record of how
# a case ended. Read in order, longest-held convention first. Anything not
# matched here leaves the case open and is reported, because a case wrongly
# closed stops being chased.

OUTCOMES = [
    # "Failed to submit" before any pass test: it contains neither, but it is
    # the phrase that most needs its own status. See SupportCaseStatus.LAPSED.
    (r"fail(ed)?\s+to\s+submit", "LAPSED"),
    (r"^withdraw", "WITHDRAWN"),
    (r"^pass\b|^passed\b|passed\s+\d|^competent\b|competent\s*-", "SUCCESSFUL"),
    (r"extension", "IN_PROGRESS"),
    (r"video\s+assessment\s+received", "IN_PROGRESS"),
    (r"^nyc\b|not\s+yet\s+competent", "IN_PROGRESS"),
]


def outcome_status(text):
    low = clean(text).lower()
    if blank(low):
        return "IN_PROGRESS", None
    for pattern, status in OUTCOMES:
        if re.search(pattern, low):
            closed = a_day(low, 0) if status in ("SUCCESSFUL",) else None
            return status, closed
    return "IN_PROGRESS", None


def extension_from(text, deadline):
    """"Extension granted", "Asked FA for an extension" — a row of its own.

    The deadline column already carries the date, so the extension records who
    is waiting on whom. Without it, a case granted until June reads exactly
    like a case whose cohort deadline happens to be June.
    """
    low = clean(text).lower()
    if not deadline or "extension" not in low:
        return None
    granted = "granted" in low
    return {
        "status": "GRANTED" if granted else "REQUESTED",
        "requestedUntil": deadline,
        "grantedUntil": deadline if granted else None,
        "reason": clean(text),
        # Written as it is in the sheet: these are Football Australia's to give.
        "decidedBy": "Football Australia" if granted else None,
    }


# ---------------------------------------------------------------------------
# The notes column
# ---------------------------------------------------------------------------

# What the coach was told to do, as the sheets phrase it. Only the prescription
# — everything after it is what happened next, which is a log rather than a
# plan.
PRESCRIPTION = re.compile(
    r"^(?:fi?llmed\s+|\d+\s*x\s*)?(?:training\s+visit|live\s+assessment|"
    r"filmed\s+live\s+assessment|needs\s+to\s+attend|td\s+support|"
    r"will\s+attend)",
    re.IGNORECASE,
)

# A dated entry in the running log. The kinds are SupportActivityKind's, and
# each pattern is one these sheets actually use — nothing is matched on a guess.
ACTIVITIES = [
    (r"email\s+offering\s+support\s+sent", "SUPPORT_OFFERED"),
    (r"on[-\s]?line\s+(?:meeting|catch\s*up)|spoke\s+with|soke\s+with|1\s*on\s*1", "MEETING"),
    (r"training\s+observation|observed\s+|observation\s+booked|live\s+assessment\s+conducted"
     r"|will\s+assess\s+live|club\s+visit", "TRAINING_VISIT"),
    (r"action\s+plan|\bap\s+sent", "ACTION_PLAN"),
    (r"video\s+(?:assessment\s+)?(?:received|submitted|uploaded|completed)|submitted\s+video"
     r"|sent\s+in\s+(?:his|her|their)\s+.*video|emailed\s+assessment|assessment\s+video\s+emailed",
     "VIDEO_RECEIVED"),
    (r"final\s+video\s+submission|video\s+due|send\s+reminder", "VIDEO_CHASED"),
    (r"outcome\s+emailed|advised\s+of\s+(?:the\s+)?(?:successful\s+)?outcome|fa\s+advised"
     r"|emailed\s+final\s+assessment", "OUTCOME_SENT"),
    (r"no\s+longer\s+coach|not\s+coaching|taken\s+a\s+break|decided\s+not\s+to"
     r"|didn'?t\s+require\s+support|won'?t\s+be\s+finalising|cancelled|personal\s+issue"
     r"|has\s+advised\s+she\s+will", "UNAVAILABLE"),
]

# Sentence-ish. The cells are typed in a spreadsheet, so a sentence is as
# likely to end at a newline or a semicolon as at a full stop — and a full stop
# with a digit after it is a date ("3.10.2026"), not the end of anything.
SENTENCE = re.compile(r"[;\n]+|\.(?!\d)")


def read_notes(text, fallback_year):
    """Split the Notes cell into the prescription, the dated log, and the rest.

    The cell is one educator's running record: what the coach was told to do,
    then four or five things that happened, typed in over a year. Split on
    sentences rather than on where a pattern happens to match, so an entry is
    logged as the whole sentence somebody wrote rather than from the middle of
    it.

    Returns (plan, prose, activities). A sentence with no date of its own is
    never given one here: it stays in the prose, and what becomes of it is the
    caller's decision, which depends on whether the case is still open.
    """
    text = clean(text)
    if not text:
        return None, None, []

    # A year written out anywhere in the cell beats the row's own: the Year
    # column is the intake, and these entries are often a year later. Each
    # bare "08/04" takes the year of the last full date before it.
    plan, prose, activities = [], [], []
    year = None
    for raw in SENTENCE.split(text):
        chunk = raw.strip(" -")
        if not chunk:
            continue
        explicit = re.search(r"\b\d{1,2}[/.]\d{1,2}[/.](\d{2,4})\b", chunk)
        if explicit:
            year = int(explicit.group(1)) + (2000 if int(explicit.group(1)) < 100 else 0)
        day = a_day(chunk, year or fallback_year)
        kind = next((k for pattern, k in ACTIVITIES if re.search(pattern, chunk, re.I)), None)
        # The prescription and the first thing that happened are often one
        # sentence — "Training visit x1 within 6 months(Email offering support
        # sent 31/03/2026)" — so a chunk can be both the plan and an entry.
        if not plan and not activities and PRESCRIPTION.match(chunk):
            plan.append(chunk)
            if not (day and kind):
                continue
        if day and kind:
            activities.append(
                {
                    "kind": kind,
                    "occurredAt": day,
                    "detail": chunk,
                    "yearInferred": not explicit,
                }
            )
        else:
            prose.append(chunk)

    activities.sort(key=lambda a: a["occurredAt"])
    return (
        ". ".join(plan) or None,
        ". ".join(prose) or None,
        activities,
    )


# ---------------------------------------------------------------------------
# Rows
# ---------------------------------------------------------------------------


def educator(cell):
    """"Priscilla (Done)" -> Priscilla Tan. "Briac & Joe Jones" -> as written.

    A name that resolves to one person becomes the account the case is run
    from; anything else is kept as text. Support is sometimes given by two
    people, or by a technical director at another federation, and a case that
    cannot be recorded goes back to the spreadsheet — which is the thing this
    is replacing. See SupportCase.educatorName.
    """
    raw = clean(cell)
    if blank(raw):
        return None, None
    name = re.sub(r"\((?:done|completed)\)", "", raw, flags=re.IGNORECASE).strip(" -")
    key = name.lower().strip()
    full = CANONICAL.get(key)
    if full:
        return full, full
    # Two educators, or somebody outside FQ: no account, but the name is kept.
    return None, name


def addresses(cell):
    """The first address in a cell that may hold two, separated by semicolons."""
    parts = [p.strip().lower() for p in re.split(r"[;,\s]+", clean(cell)) if "@" in p]
    return (parts[0], parts[1:]) if parts else (None, [])


def fa_number(cell):
    """"fa.10386163" -> "10386163". Two numbers means two FALC records; keep both."""
    raw = clean(cell).replace("fa.", "").strip()
    return raw or None


def rating(cell):
    try:
        n = float(clean(cell))
    except ValueError:
        return None
    return n if 1 <= n <= 5 else None


def referral_reason(fq, fa, on_course):
    if not (fq or fa):
        return None
    parts = []
    if fa:
        parts.append(f"Assessed {fa.lower()} on course")
    if fq:
        parts.append(f"FQ rating {fq:g}")
    reason = ", ".join(parts)
    if clean(on_course).lower().startswith("n"):
        reason += " — did not pass on course"
    return reason + "."


def cohort_key(qualification, label):
    stem = re.sub(r"[^a-z0-9]+", "-", f"{qualification} {label}".lower()).strip("-")
    return stem


def support_sheet(rows, qualification, source, out):
    """Read one "Coaches More Support" sheet into cases on `out`.

    The sheets are blocked by intake year with the header repeated above each
    block — "2023" and its header, then "2024" and its header again — so the
    columns are resolved from whichever header was last seen rather than from
    the top of the sheet.
    """
    headers, year = {}, None
    for n, row in enumerate(rows, 1):
        cells = [clean(c) for c in row]
        if not any(cells):
            continue
        joined = " ".join(cells).lower()

        # A block's year, alone on its own row.
        if len([c for c in cells if c]) == 1 and re.fullmatch(r"20\d\d", cells[0]):
            year = int(cells[0])
            continue

        if "support provided by" in joined:
            headers = {}
            for i, c in enumerate(cells):
                h = c.lower().replace("\n", " ").strip()
                if h.startswith("#"):
                    headers["no"] = i
                elif h.startswith("fa nr") or h.startswith("fa number"):
                    headers["fa"] = i
                elif h == "name" or h == "first name":
                    headers["first"] = i
                elif h == "surname":
                    headers["last"] = i
                elif h == "email":
                    headers["email"] = i
                elif h == "club":
                    headers["club"] = i
                elif h == "year":
                    headers["year"] = i
                elif h == "course":
                    headers["course"] = i
                elif h.startswith("support provided"):
                    headers["educator"] = i
                elif "pass post course" in h:
                    headers["outcome"] = i
                elif "pass on course" in h:
                    headers["onCourse"] = i
                elif h.startswith("fq rating"):
                    headers["fqRating"] = i
                elif h.startswith("fa rating"):
                    headers["faRating"] = i
                elif h.startswith("deadline"):
                    headers["deadline"] = i
                elif h.startswith("notes"):
                    headers["notes"] = i
            continue

        if not headers:
            continue

        def col(name):
            i = headers.get(name)
            return clean(row[i]) if i is not None and i < len(row) else ""

        first, last = col("first"), col("last")
        email, extra = addresses(col("email"))
        label = col("course")

        # A row with a cohort but nobody on it is a row somebody started and
        # left; the tally block under each sheet ("Martin | 9") is not, and is
        # passed over in silence.
        if not (first or last or email):
            if label:
                out["skipped"].append(
                    {"source": source, "row": n, "why": "no coach on the row",
                     "cells": [c for c in cells if c][:4]}
                )
            continue
        if not label:
            out["skipped"].append(
                {"source": source, "row": n, "why": "no cohort named",
                 "cells": [c for c in cells if c][:4]}
            )
            continue
        if not email:
            out["skipped"].append(
                {"source": source, "row": n, "why": "no address — nothing to match a coach on",
                 "cells": [first, last, label]}
            )
            continue

        row_year = None
        try:
            row_year = int(col("year"))
        except ValueError:
            row_year = year

        deadline, bad_deadline = a_date(col("deadline"))
        status, closed = outcome_status(col("outcome"))
        account, named = educator(col("educator"))
        # A bare "08/04" in the notes is read as the year the case is being
        # worked — the deadline's — rather than the intake's, which is often a
        # year or two earlier.
        fallback_year = int(deadline[:4]) if deadline else (row_year or 2026)
        plan, prose, activities = read_notes(col("notes"), fallback_year)

        # Prose with no date in it, on a case still open. It is the educator's
        # only record of where the case has got to, so it goes in the log
        # rather than nowhere — anchored to the last thing that did have a
        # date, which puts it last in the timeline where it was written. The
        # alternative is a field the case page does not show.
        if prose and status == "IN_PROGRESS":
            anchor = activities[-1]["occurredAt"] if activities else deadline
            if anchor:
                activities.append({"kind": "NOTE", "occurredAt": anchor, "detail": prose})
                prose = None
        key = cohort_key(qualification, label)

        # "B Metro 2023 / Gold Coast 2023" is one coach who sat blocks on two
        # intakes, not a cohort. The case goes on the first — a case belongs to
        # one course — and the row says so.
        if "/" in label:
            label = label.split("/")[0].strip()
            key = cohort_key(qualification, label)

        cohort = out["cohorts"].setdefault(
            key,
            {
                "key": key,
                "label": label,
                "qualification": qualification,
                "seasons": [],
                "deadlines": [],
                "sources": [],
            },
        )
        if row_year and row_year not in cohort["seasons"]:
            cohort["seasons"].append(row_year)
        if deadline:
            cohort["deadlines"].append(deadline)
        if source not in cohort["sources"]:
            cohort["sources"].append(source)

        issues = []
        if "/" in clean(col("course")):
            issues.append(
                f"row names two cohorts ({clean(col('course'))!r}) — the case is on the first"
            )
        for activity in activities:
            if activity.pop("yearInferred", False):
                issues.append(
                    f"{activity['detail'][:40]!r} has no year — read as {activity['occurredAt'][:4]}"
                )
        if bad_deadline:
            issues.append(f"deadline {bad_deadline!r} is not a date")
        if extra:
            issues.append(f"second address on the row, not imported: {', '.join(extra)}")
        if named and not account:
            issues.append(f"support provided by {named!r} — no single account to run the case")
        if not blank(col("outcome")) and status == "IN_PROGRESS" and not re.search(
            r"nyc|tbd|extension|video", col("outcome").lower()
        ):
            issues.append(f"outcome {col('outcome')!r} not understood — left open")

        out["cases"].append(
            {
                "source": source,
                "row": n,
                "cohort": key,
                "position": int(col("no")) if col("no").isdigit() else 0,
                "firstName": first,
                "lastName": last,
                "email": email,
                "club": col("club") or None,
                "faNumber": fa_number(col("fa")),
                "season": str(row_year) if row_year else None,
                "educatorName": named,
                "educatorAccount": account,
                "status": status,
                "outcomeRaw": col("outcome") or None,
                "closedAt": closed,
                "deadline": deadline,
                "fqRating": rating(col("fqRating")),
                "faRating": col("faRating") or None,
                "onCourseOutcome": col("onCourse") or None,
                # Why the coach was referred, in the register's own terms. The
                # 2023 sheets carry it; the later ones record only that support
                # was prescribed, and inventing a reason for those would put
                # words the coach was never told on their own case page.
                "reason": referral_reason(
                    rating(col("fqRating")), col("faRating"), col("onCourse")
                ),
                # Prose that is not the prescription and carries no date. On a
                # closed case that is the educator writing up how it ended,
                # which is what closingNote is for; on an open one it is still
                # part of what the coach was told.
                "plan": plan,
                "closingNote": prose if status != "IN_PROGRESS" else None,
                # Kept whole as well as split, so a question about what the
                # register said is answered without reopening the workbook.
                # Nothing reads it; see the importer.
                "notes": col("notes") or None,
                "activities": activities,
                "extension": extension_from(col("outcome"), deadline),
                "issues": issues,
            }
        )


def availability_sheet(rows, source, out):
    """The Microsoft Form: when a coach can be visited.

    Replaces the "Filled the form? Yes/No" column beside it. Club and age group
    are deliberately dropped — the enrolment carries both, and a second copy is
    a second thing to go out of date. See the note on SupportCase.availability*.
    """
    header = {}
    for row in rows:
        cells = [clean(c) for c in row]
        joined = " ".join(cells).lower()
        if "please outline best day and time" in joined:
            for i, c in enumerate(cells):
                h = c.lower()
                if "enter your email" in h:
                    header["email"] = i
                elif "best day and time" in h:
                    header["when"] = i
                elif h == "completion time":
                    header["at"] = i
            continue
        if not header:
            continue
        email, _ = addresses(row[header["email"]] if header.get("email", -1) < len(row) else "")
        when = clean(row[header["when"]]) if header.get("when", -1) < len(row) else ""
        if not email or not when:
            continue
        at = clean(row[header["at"]]) if header.get("at", -1) < len(row) else ""
        iso, _ = a_date(at.split(" ")[0] if at else "")
        # Answered as one sentence — "Tuesday or Thursday 7pm to 8.30pm" — so it
        # is kept as one. Splitting it into a day and a time means deciding what
        # "Obviously won't be possible however happy to liaise…" means.
        out["availability"][email] = {"note": when, "answeredAt": iso, "source": source}


def qualification_of(path):
    name = os.path.basename(path).lower()
    if re.search(r"\bb[\s_]*diploma", name):
        return "B Diploma"
    if re.search(r"\bc[\s_]*diploma", name):
        return "C Diploma"
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("workbooks", nargs="+")
    ap.add_argument("-o", "--out", default="prisma/data/post-course-support.json")
    ap.add_argument(
        "--qualification",
        action="append",
        default=[],
        help="Override what a file holds, in file order: --qualification 'B Diploma'",
    )
    args = ap.parse_args()

    out = {"cohorts": {}, "cases": [], "availability": {}, "skipped": []}

    for i, path in enumerate(args.workbooks):
        qualification = (
            args.qualification[i] if i < len(args.qualification) else qualification_of(path)
        )
        if not qualification:
            sys.exit(
                f"{path}: cannot tell whether this is a B or C Diploma from the file name — "
                f"pass --qualification"
            )
        source = os.path.basename(path)
        book = load(path)
        for name, rows in book.items():
            low = name.lower()
            if low.startswith("coaches more support"):
                support_sheet(rows, qualification, source, out)
            elif any("please outline best day and time" in " ".join(r).lower() for r in rows[:3]):
                availability_sheet(rows, source, out)

    # One row per coach per cohort. The same coach appears in both workbooks'
    # older sheets, and a second copy of a row is a second case.
    seen, cases = {}, []
    for case in out["cases"]:
        key = (case["cohort"], case["email"])
        if key in seen:
            seen[key]["issues"].append(
                f"duplicate row in {case['source']} row {case['row']} — ignored"
            )
            continue
        seen[key] = case
        cases.append(case)

    for case in cases:
        got = out["availability"].get(case["email"])
        if got:
            case["availability"] = got

    # A cohort's deadline is the one most of its coaches share; the rest carry
    # their own. Set on the course so correcting an intake's date still reaches
    # everybody who has not been given one of their own — see Course.supportDeadline.
    cohorts = []
    for cohort in out["cohorts"].values():
        dates = cohort.pop("deadlines")
        cohort["deadline"] = max(set(dates), key=dates.count) if dates else None
        seasons = cohort.pop("seasons")
        # The label usually names the intake — "B SC 2025" — and the Year column
        # is the year the case is being worked, which is not the same thing.
        in_label = re.search(r"(20\d\d)", cohort["label"])
        cohort["season"] = in_label.group(1) if in_label else (str(min(seasons)) if seasons else None)
        cohorts.append(cohort)
    cohorts.sort(key=lambda c: c["key"])

    doc = {
        "note": (
            "Football Queensland's post-course support registers. Real names and real "
            "addresses: a case has to reach the coach it belongs to. Extracted by "
            "scripts/extract-post-course-support.py."
        ),
        "extractedAt": datetime.date.today().isoformat(),
        "cohorts": cohorts,
        "cases": cases,
        "skipped": out["skipped"],
    }

    with open(args.out, "w") as f:
        json.dump(doc, f, indent=2, ensure_ascii=False)
        f.write("\n")

    flagged = [c for c in cases if c["issues"]]
    print(f"{len(cases)} cases across {len(cohorts)} cohorts -> {args.out}")
    print(f"{len([c for c in cases if c.get('availability')])} with a form response")
    print(f"{len(out['skipped'])} rows skipped, {len(flagged)} cases with something to check")
    for case in flagged:
        for issue in case["issues"]:
            print(f"  {case['firstName']} {case['lastName']} ({case['cohort']}): {issue}")
    for row in out["skipped"]:
        print(f"  {row['source']} row {row['row']}: {row['why']}")


if __name__ == "__main__":
    main()
