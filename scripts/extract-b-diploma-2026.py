"""Turn Football Queensland's B Diploma attendance registers into one JSON.

Kept as a separate step from the import, the same way `extract-fq-2026.py` is:
the registers are the coach education team's working documents and will change
shape next intake, whereas the JSON is a flat record of one intake that can be
reviewed, diffed and re-imported without Excel in the loop.

    python3 scripts/extract-b-diploma-2026.py <register.xlsx> [...] -o prisma/data/b-diploma-2026.json

**Addresses are anonymised.** The registers carry every coach's real address,
and this file is committed to the repository. Names are kept — they are what
makes the data worth testing against — but each address is rewritten to
`first.last@example.com`. Nothing here can mail a real person by accident.
"""
import argparse, datetime, json, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from xlsx_reader import load

# Excel's day zero. 1899-12-30 rather than 12-31 absorbs the phantom 1900 leap
# day the format still carries for Lotus compatibility.
EPOCH = datetime.date(1899, 12, 30)

# The registers name a course educator by first name only. Resolved against the
# full names the FQ workbooks use, because an educator becomes an account and
# "Martin" must not become a second one. Shared with extract-fq-2026.py by
# copy: the two scripts read different documents and neither should start
# failing because the other learned a new name.
CANONICAL = {
    "tom": "Tom Laxton",
    "davide": "Davide Bertamini",
    "gabor": "Gabor Ganczer",
    "briac": "Briac Williams",
    "tyler": "Tyler Logan",
    "matt": "Matt Poole",
    "alec": "Alec Wilson",
    "priscilla": "Priscilla Tan",
    "martin": "Martin Docherty",
    "dale": "Dale Hill",
    "scott": "Scott Grimshaw",
    "craig": "Craig Midgley",
    "gareth": "Gareth Thomson",
    "frank": "Frank Monteverde",
}

# Rows the registers use as spacers, placeholders or unfilled dropdown text.
BLANK = {"", "-", "none", "n/a", "na", "tbc", "tbd", "?"}


def blank(v):
    return str(v or "").strip().lower() in BLANK


def serial_to_date(v):
    """'46265' -> '2026-08-16'. Anything that isn't a serial comes back as None."""
    try:
        n = float(v)
    except (TypeError, ValueError):
        return None
    if n < 1 or n > 100000:
        return None
    return (EPOCH + datetime.timedelta(days=int(n))).isoformat()


def serial_to_time(v):
    """'0.354166' -> '08:30'. Times are stored as a fraction of a day."""
    try:
        n = float(v)
    except (TypeError, ValueError):
        return None
    frac = n % 1
    if n >= 1 and frac == 0:
        return None
    minutes = round(frac * 24 * 60)
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def yesno(v):
    """The registers mark a day Yes/No. Anything else means nobody recorded it."""
    s = str(v or "").strip().lower()
    if s in ("yes", "y", "true", "1"):
        return True
    if s in ("no", "n", "false", "0"):
        return False
    return None


def canonical_educator(name):
    n = re.split(r"\s*[/&,]\s*", str(name or "").strip())[0].strip()
    if blank(n):
        return None
    return CANONICAL.get(n.lower(), n)


def cell(row, i):
    return row[i].strip() if i < len(row) and row[i] else ""


def find_row(rows, col, text, start=0):
    """Index of the first row whose `col` matches `text`, case and space insensitive."""
    want = re.sub(r"\s+", " ", text).strip().lower()
    for i in range(start, len(rows)):
        got = re.sub(r"\s+", " ", cell(rows[i], col)).strip().lower()
        if got == want:
            return i
    return None


def header_columns(row):
    """Column index for every non-empty header in a row, keyed on squashed text."""
    out = {}
    for i, v in enumerate(row):
        key = re.sub(r"\s+", " ", str(v or "")).strip().lower()
        if key and key not in out:
            out[key] = i
    return out


# --------------------------------------------------------------------------
# Assessment write-ups
# --------------------------------------------------------------------------

# One assessment cell holds a small form typed as free text. The labels drift
# between assessors — "Action plan" and "Action Plan", "Session rating" and
# "Session Rating" — so each is matched case-insensitively, and the raw cell is
# kept alongside whatever this manages to pull out of it.
FIELDS = ["assessor", "when", "component", "topic", "comment", "action plan", "session rating"]
FIELD_RE = re.compile(
    r"^\s*(" + "|".join(re.escape(f) for f in FIELDS) + r")\s*:\s*(.*)$",
    re.I,
)


def parse_delivery(raw):
    """Pulls the form fields out of one assessment cell.

    Returns None for the unfilled template the registers pre-fill every cell
    with — an empty form is not an assessment, and importing 33 of them per
    course would bury the handful that are real.
    """
    if not raw or not raw.strip():
        return None

    found, current = {}, None
    for line in raw.splitlines():
        m = FIELD_RE.match(line)
        if m:
            current = m.group(1).lower()
            found[current] = [m.group(2).strip()]
        elif current:
            found[current].append(line.rstrip())

    def value(key):
        lines = found.get(key, [])
        # The template pre-numbers the action plan as a bare "1." and "2.".
        # Those are the form, not an answer, so a field holding nothing else is
        # still empty.
        lines = [l for l in lines if not re.match(r"^\s*\d+[.)]?\s*$", l)]
        v = "\n".join(lines).strip()
        # "Block ?" and "Play/Practice" are the template's own placeholders.
        return None if blank(v) or v.lower() in ("block ?", "block", "play/practice") else v

    parsed = {
        "assessor": canonical_educator(value("assessor")),
        "block": value("when"),
        "component": value("component"),
        "topic": value("topic"),
        "comment": value("comment"),
        "actionPlan": value("action plan"),
        "rating": num((value("session rating") or "").replace(",", ".")),
    }
    # An untouched template has nothing in it but the labels.
    if not any(v is not None for v in parsed.values()):
        return None
    parsed["raw"] = raw.strip()
    return parsed


# --------------------------------------------------------------------------
# One register
# --------------------------------------------------------------------------


def slugify(*parts):
    s = "-".join(str(p) for p in parts if p)
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return re.sub(r"-{2,}", "-", s)


def read_course_info(rows):
    info = {"qualification": None, "stream": None, "location": None, "address": None, "days": []}
    labels = {
        "afc / football australia": "qualification",
        "course name": "stream",
        "location": "location",
        "address": "address",
    }
    for row in rows:
        key = re.sub(r"\s+", " ", cell(row, 1)).strip().lower()
        if key in labels:
            info[labels[key]] = cell(row, 2) or None

    for row in rows:
        m = re.match(r"^day\s*(\d+)$", cell(row, 1), re.I)
        if not m:
            continue
        date = serial_to_date(cell(row, 3))
        if not date:
            continue
        info["days"].append(
            {
                "dayNo": int(m.group(1)),
                "weekday": cell(row, 2) or None,
                "date": date,
                "startTime": serial_to_time(cell(row, 4)),
                "endTime": serial_to_time(cell(row, 5)),
            }
        )
    info["days"].sort(key=lambda d: d["dayNo"])
    return info


def read_roster_block(rows, header_row, day_cols, result_cols, track):
    """Reads the coach rows under one 'Coaches Details' header."""
    people, started = [], False
    for i in range(header_row + 1, len(rows)):
        row = rows[i]
        n = num(cell(row, 1))
        first, last = cell(row, 2), cell(row, 3)

        # Between the 'Coaches Details' banner and the first coach sit the
        # column headers and a row of dates. Neither carries a number in the #
        # column, so the block starts at the first row that does.
        if n is None:
            if started:
                break  # ...and ends at the first row that stops.
            continue
        started = True
        # A numbered row with no name is a spare line left on the form.
        if blank(first) and blank(last):
            continue

        attendance = {}
        for day_no, col in day_cols.items():
            mark = yesno(cell(row, col))
            if mark is not None:
                attendance[str(day_no)] = mark

        def result(key):
            col = result_cols.get(key)
            return cell(row, col) if col is not None else ""

        rating = num(result("rating"))
        person = {
            "position": int(n),
            "firstName": first,
            "lastName": last,
            "track": track,
            "age": int(num(cell(row, 4))) if num(cell(row, 4)) else None,
            "gender": cell(row, 5) or None,
            "coachingAgeGroup": cell(row, 7) or None,
            "attendance": attendance,
            "attendanceMet": yesno(result("attendance")),
            "journal": yesno(result("journal")),
            # A zero in the Rating column means nobody has rated them yet; the
            # scale itself starts at 1.
            "rating": rating if rating else None,
            "outcome": result("outcome") or None,
            "readiness": result("readiness") or None,
            "comments": result("comments") or None,
        }
        # On the main roster column G is the coach's club. On the catch-up
        # block the same column carries the note about what they are catching
        # up ("Day 6 & Block 3"), which is not a club and must not become one.
        note = cell(row, 6) or None
        person["club"] = None if track == "CATCH_UP" else note
        person["catchUpNote"] = note if track == "CATCH_UP" else None
        people.append(person)
    return people


def read_attendance(rows):
    """The three blocks of the Attendance sheet: roster, catch-ups, staff."""
    main_header = find_row(rows, 1, "Coaches Details")
    if main_header is None:
        raise SystemExit("no 'Coaches Details' header on the Attendance sheet")

    day_cols = {}
    for i, v in enumerate(rows[main_header]):
        m = re.match(r"^day\s*(\d+)$", str(v or "").strip(), re.I)
        if m:
            day_cols[int(m.group(1))] = i

    cols = header_columns(rows[main_header + 1])
    result_cols = {
        k: cols[k] for k in ("attendance", "journal", "rating", "outcome", "readiness", "comments")
        if k in cols
    }

    roster = read_roster_block(rows, main_header, day_cols, result_cols, "MAIN")

    catch_ups = []
    catch_title = find_row(rows, 1, "Catch Ups and Deferrals")
    if catch_title is not None:
        catch_header = find_row(rows, 1, "Coaches Details", catch_title)
        if catch_header is not None:
            c_days = {}
            for i, v in enumerate(rows[catch_header]):
                m = re.match(r"^day\s*(\d+)$", str(v or "").strip(), re.I)
                if m:
                    c_days[int(m.group(1))] = i
            c_cols = header_columns(rows[catch_header + 1])
            c_result = {
                k: c_cols[k]
                for k in ("attendance", "journal", "rating", "outcome", "readiness", "comments")
                if k in c_cols
            }
            catch_ups = read_roster_block(rows, catch_header, c_days, c_result, "CATCH_UP")

    staff, staff_header = [], find_row(rows, 2, "Staff Attendance")
    if staff_header is not None:
        s_days = {}
        for i, v in enumerate(rows[staff_header]):
            m = re.match(r"^day\s*(\d+)$", str(v or "").strip(), re.I)
            if m:
                s_days[int(m.group(1))] = i
        for i in range(staff_header + 3, len(rows)):
            role, name = cell(rows[i], 2), cell(rows[i], 3)
            if blank(role) or role.lower() == "attendees":
                break
            attendance = {}
            for day_no, col in s_days.items():
                mark = yesno(cell(rows[i], col))
                if mark is not None:
                    attendance[str(day_no)] = mark
            # A register with nobody named against CET1..CET5 has simply not
            # had its staff filled in. Importing six blank rows per course
            # would put empty names on screen and nothing behind them.
            educator = canonical_educator(name)
            if not educator:
                continue
            staff.append(
                {
                    "role": role,
                    "name": educator,
                    "position": len(staff),
                    "attendance": attendance,
                }
            )

    return roster, catch_ups, staff


def read_falc(rows):
    """The enrolment export: the only sheet carrying an address per coach."""
    header = header_columns(rows[0]) if rows else {}
    out = {}
    for row in rows[1:]:
        first, last = cell(row, header.get("first name", 2)), cell(row, header.get("last name", 3))
        if blank(first) and blank(last):
            continue
        dob = serial_to_date(cell(row, header.get("date of birth", 5)))
        out[(first.lower(), last.lower())] = {
            "status": cell(row, header.get("status", 0)) or None,
            "falcUsername": cell(row, header.get("username", 1)) or None,
            "dateOfBirth": dob,
            "suborganisation": cell(row, header.get("suborganisation", 7)) or None,
        }
    return out


def read_assessments(rows):
    """The Assessment sheet, which runs one column per coach.

    One of the three registers indents the whole grid by a column, so the
    column holding the row labels is found rather than assumed.
    """
    label_col = name_row = None
    for col in range(4):
        found = find_row(rows, col, "Coach Student")
        if found is not None:
            label_col, name_row = col, found
            break
    if name_row is None:
        return {}

    delivery_rows = {}
    for i, row in enumerate(rows):
        m = re.match(r"^practical delivery\s*(\d+)$", cell(row, label_col), re.I)
        if m:
            delivery_rows[int(m.group(1))] = i
    current_row = find_row(rows, label_col, "Current rating")
    comment_row = find_row(rows, label_col, "Comment")

    out = {}
    for col, raw_name in enumerate(rows[name_row]):
        name = str(raw_name or "").strip()
        if col <= label_col or blank(name):
            continue
        deliveries = []
        for delivery_no, r in sorted(delivery_rows.items()):
            parsed = parse_delivery(cell(rows[r], col))
            if parsed:
                parsed["deliveryNo"] = delivery_no
                deliveries.append(parsed)
        out[name.lower()] = {
            "deliveries": deliveries,
            "currentRating": num(cell(rows[current_row], col)) if current_row is not None else None,
            "assessmentComment": (cell(rows[comment_row], col) or None) if comment_row is not None else None,
        }
    return out


def read_register(path, emails):
    book = load(path)
    info = read_course_info(book["Course Info"])
    roster, catch_ups, staff = read_attendance(book["Attendance"])
    falc = read_falc(book.get("Data From FALC", []))
    assessments = read_assessments(book.get("Assessment", []))

    for person in roster + catch_ups:
        key = (person["firstName"].lower(), person["lastName"].lower())
        person.update(falc.get(key, {"status": None, "falcUsername": None,
                                     "dateOfBirth": None, "suborganisation": None}))
        person["email"] = emails.email_for(person["firstName"], person["lastName"])

        full = f"{person['firstName']} {person['lastName']}".lower()
        found = assessments.get(full, {})
        person["deliveries"] = found.get("deliveries", [])
        person["assessmentComment"] = found.get("assessmentComment")
        # The Assessment sheet's "Current rating" and the Attendance sheet's
        # "Rating" are the same figure kept in two places. The register's own
        # Result block wins; the assessment sheet fills a gap.
        if person["rating"] is None:
            person["rating"] = found.get("currentRating") or None

    stream, location = info["stream"], info["location"]
    return {
        "slug": slugify("b-diploma", location, 2026),
        "title": f"AFC / Football Australia B Diploma — {stream} @ {location}",
        "qualification": info["qualification"],
        "stream": stream,
        "location": location,
        "address": info["address"],
        "season": "2026",
        "days": info["days"],
        "staff": staff,
        "coaches": roster + catch_ups,
        "sourceFile": os.path.basename(path),
    }


class Emails:
    """Anonymised addresses, stable within a run and unique across every course.

    The registers hold real addresses and this output is committed, so none of
    them travel. A coach who appears on two registers keeps one address, which
    is what makes them one account on import.
    """

    def __init__(self, domain="example.com"):
        self.domain = domain
        self.by_name = {}
        self.taken = set()

    def email_for(self, first, last):
        key = (first.strip().lower(), last.strip().lower())
        if key in self.by_name:
            return self.by_name[key]
        stem = slugify(first, last).replace("-", ".") or "coach"
        candidate, n = f"{stem}@{self.domain}", 1
        while candidate in self.taken:
            n += 1
            candidate = f"{stem}{n}@{self.domain}"
        self.taken.add(candidate)
        self.by_name[key] = candidate
        return candidate


# The rubric is identical on all three registers, so it is transcribed once
# here rather than read three times and reconciled. It is Football Australia's,
# not FQ's to reword mid-intake — which is why it can live in the file at all.
RUBRIC = {
    "criteria": [
        {"code": "ENGAGEMENT", "group": "Course", "title": "Participation / Engagement"},
        {"code": "OBJECTIVE", "group": "Practical", "title": "Objective"},
        {"code": "CONTENT", "group": "Practical", "title": "Content"},
        {"code": "ORGANISATION", "group": "Practical", "title": "Organisation"},
        {"code": "PRESENTING", "group": "Practical", "title": "Presenting"},
        {"code": "COACHING", "group": "Practical", "title": "Coaching"},
        {"code": "ENVIRONMENT", "group": "Practical", "title": "Environment"},
    ],
    "bands": [
        {"min": 4.5, "faRating": "Highly Competent", "outcome": "Pass on course",
         "definition": "High quality candidate to progress further in the Advance Coach Ed Pathway. To be considered for roles within National Team, A-League, full time FQ, CET, etc."},
        {"min": 3.5, "faRating": "Highly Competent", "outcome": "Pass on course",
         "definition": "Top Tier 1 Club Coach; Shows strong skills and is well equipped for the next level of accreditation. Exceeds level of competency. To be considered for roles in FQA Emerging Program, CET, etc."},
        {"min": 2.5, "faRating": "Competent", "outcome": "Pass on course",
         "definition": "Average Tier 1 Club coach; Actively engages and contributes to the course. Demonstrates potential and readiness for the next level of accreditation. Meets level of competency."},
        {"min": 1.5, "faRating": "Not yet competent", "outcome": "Post-course support",
         "definition": "Community Club coach needing support; Displays basic football knowledge. Will need a higher level of support before progressing to the next level. Does not meet level of competency yet."},
        {"min": 1.0, "faRating": "Not yet competent", "outcome": "Post-course support",
         "definition": "Displays limited football knowledge, should not be on course, should not coach."},
    ],
    "passMark": 2.5,
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("registers", nargs="+")
    ap.add_argument("-o", "--out", default="prisma/data/b-diploma-2026.json")
    args = ap.parse_args()

    emails = Emails()
    courses = [read_register(p, emails) for p in args.registers]
    courses.sort(key=lambda c: c["days"][0]["date"] if c["days"] else "")

    out = {
        "note": "Extracted from FQ's B Diploma attendance registers. Addresses are anonymised; names are real.",
        "intake": "2026",
        "rubric": RUBRIC,
        "courses": courses,
    }
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w") as fh:
        json.dump(out, fh, indent=2, ensure_ascii=False)
        fh.write("\n")

    for c in courses:
        rated = [x for x in c["coaches"] if x["rating"]]
        support = [x for x in rated if x["rating"] < RUBRIC["passMark"]]
        print(
            f"{c['location']:<22} {len(c['days'])} days · {len(c['coaches']):>2} coaches "
            f"({sum(1 for x in c['coaches'] if x['track'] == 'CATCH_UP')} catch-up) · "
            f"{len(c['staff'])} staff · {sum(len(x['deliveries']) for x in c['coaches']):>2} deliveries · "
            f"{len(rated)} rated, {len(support)} below {RUBRIC['passMark']}"
        )
    print(f"\nwrote {args.out}")


if __name__ == "__main__":
    main()
