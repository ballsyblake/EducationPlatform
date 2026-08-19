"""Turn FQ's five 2026 workbooks into one JSON the importer can read.

Kept as a separate step from the import on purpose: the spreadsheets are FQ's
working documents and will change shape next season, whereas the JSON is a flat
record of one season that can be reviewed, diffed and re-imported without
Excel in the loop.
"""
import json, os, re, sys
from xlsx import load

UP = "/root/.claude/uploads/462c962d-5565-5b97-b1cd-6f5be56e9973"
FILES = {
    "overall": f"{UP}/dd4446a4-2026_Overall_Assessment_Scoring_Pool_A_B__C_1.xlsx",
    "planning_ac": f"{UP}/8d999dfc-Pool_AC_Planning_Assessment_2026_1.xlsx",
    "planning_b": f"{UP}/0a0dc8c6-Pool_B_Planning_Assessment_2026.xlsx",
    "delivery": f"{UP}/e255aec7-Pool_A_B__C_Delivery_Assessment_2026_6.xlsx",
    "outcomes": f"{UP}/208ef8a2-Pool_A_B__C_Outcomes_Assessment_2026.xlsx",
    "matrix": f"{UP}/84b3a4a3-Action_Plan_Matrix_2026_1.xlsx",
}

# FQ's sheets abbreviate assessors inconsistently — a first name here, two
# names in one cell there. Canonicalised against the full names the mastersheets
# use, because an assessor is an account and "Tom" must not become a second one.
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
}

# Regional ambassadors appear only as first names on the Action Plan Matrix and
# nowhere else, so there is no surname to resolve them to. Kept as given and
# reported, rather than dropped: the assignment is real even when the account
# behind it still needs a full name and a working address.
FIRST_NAME_ONLY = {"mike", "ken", "riley", "daegal", "rodrigo"}

def canonical_assessor(name):
    n = re.sub(r"\s*\+\s*CDA$", "", (name or "").strip(), flags=re.I).strip()
    # "Tom Laxton / Davide" is one cell naming two people; the first is the one
    # whose row it is.
    n = re.split(r"\s*[/&]\s*", n)[0].strip()
    if not n:
        return ""
    return CANONICAL.get(n.lower(), n)

PLACEHOLDER = re.compile(
    r"^(club'?s? 1st assessor cda|assessor name \d|cau|n/?a|tbc|tbd)$", re.I
)

def clean_club(name):
    n = re.sub(r"\(TIER\s*2\)", "", name, flags=re.I).strip()
    n = re.sub(r"\s{2,}", " ", n).strip(" -–")
    return n

def is_tier2(name):
    return bool(re.search(r"\(TIER\s*2\)", name, re.I))

def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None

# ---------------------------------------------------------------- clubs -----
def clubs_and_shields():
    rows = load(FILES["overall"])["2026 Assessment Scoring"]
    out, pool = [], None
    for r in rows:
        if not r or not r[0]:
            continue
        head = r[0].strip()
        m = re.match(r"DEVELOPMENT POOL ([ABC])$", head, re.I)
        if m:
            pool = m.group(1).upper()
            continue
        if re.match(r"^(SCREENING|Regional)", head, re.I):
            pool = None
            continue
        if head.upper() in {"GOLD", "SILVER", "BRONZE", "DEV COMMITTED"} and len(r) > 3 and r[3]:
            raw = r[3].strip()
            out.append({
                "name": clean_club(raw),
                "pool": pool,
                "tier": "T2" if is_tier2(raw) else "T1",
                "shield": {"DEV COMMITTED": "DEVELOPMENT_COMMITTED"}.get(head.upper(), head.upper()),
                "rank": num(r[1]),
                "league": (r[2] or "").strip(),
            })
    return out

def leaderboard():
    """Domain subtotals per club, for cross-checking what we import."""
    rows = load(FILES["overall"])["Leaderboard By Pool 2026"]
    out = {}
    for r in rows:
        if len(r) > 8 and r[2] and num(r[3]) is not None and r[1]:
            out[clean_club(r[2])] = {
                "total": num(r[3]), "planning": num(r[4]),
                "delivery": num(r[5]), "outcomes": num(r[6]),
                "technical": num(r[7]), "prior_total": num(r[8]),
            }
    return out

# ------------------------------------------------------------ allocations ---
def allocations():
    """Which assessor holds which line item, per pool, from each mastersheet."""
    out = []
    plans = [
        ("planning_ac", ["A", "C"]),
        ("planning_b", ["B"]),
        ("delivery", ["A", "B", "C"]),
        ("outcomes", ["A", "B", "C"]),
    ]
    for key, pools in plans:
        rows = load(FILES[key])["Mastersheet"]
        last_slots = {}
        # Every block is: Assessor 1 / Assessor 2 / Assessor 3 rows, then a row
        # whose first cell names the pool and whose remaining cells are codes.
        for i, r in enumerate(rows):
            if not r or not r[0]:
                continue
            m = re.match(r"^(Pool|SEQ Screening)\s*([ABC])?", r[0].strip(), re.I)
            if not m:
                continue
            codes = {j: c.strip() for j, c in enumerate(r) if j and re.fullmatch(r"[PDO]\d{1,2}", c.strip())}
            if not codes:
                continue
            pool = (m.group(2) or "").upper() or None
            slots = {}
            for back in range(1, 6):
                k = i - back
                if k < 0 or not rows[k] or not rows[k][0]:
                    continue
                sm = re.match(r"Assessor (\d)", rows[k][0].strip(), re.I)
                if sm:
                    slots[int(sm.group(1))] = rows[k]
            # A workbook covering several pools names its assessors once, above
            # the first block, and the later blocks are bare club grids. Without
            # carrying the last set forward, Pool C in the A/C Planning workbook
            # and Pools B and C in the Delivery workbook came out unallocated —
            # which reads as "nobody is scoring them" when in fact the same
            # people score all of them.
            if not slots:
                slots = last_slots
            else:
                last_slots = slots
            for j, code in codes.items():
                for slot, srow in slots.items():
                    name = (srow[j] if j < len(srow) else "").strip()
                    # "Tyler Logan + CDA" means that assessor alongside the
                    # club's own ambassador; the person is the part we can use.
                    if PLACEHOLDER.match(name):
                        continue
                    name = canonical_assessor(name)
                    if not name or PLACEHOLDER.match(name):
                        continue
                    out.append({"pool": pool, "code": code, "slot": slot, "assessor": name})
    return out

# ------------------------------------------------------------ ambassadors ---
def ambassadors():
    """Which CDA looks after which club, from the Action Plan Matrix.

    The assessment workbooks name an assessor per line item but never say whose
    club is whose; this sheet is the only place that mapping exists. A cell can
    hold two people ("Tom & Davide"), which the portal supports directly — a
    club can have more than one ambassador.
    """
    rows = load(FILES["matrix"])["Action Plan Tracking"]
    out = []
    for r in rows[1:]:
        if not r or not (r[0] or "").strip():
            continue
        club = clean_club(r[0])
        cell = (r[1] if len(r) > 1 else "").strip()
        if not cell:
            continue
        for part in re.split(r"\s*[&/+]\s*|\s+and\s+", cell):
            name = canonical_assessor(part)
            if name and not PLACEHOLDER.match(name):
                out.append({"club": club, "assessor": name})
    return out

# ---------------------------------------------------------------- scores ----
def item_scores():
    """Per club, per assessor: which evidence points were met, and the score."""
    out = []
    for key in ("planning_ac", "planning_b", "delivery", "outcomes"):
        book = load(FILES[key])
        for sheet, rows in book.items():
            if not re.fullmatch(r"[PDO]\d{1,2}", sheet):
                continue
            # The header row is the one naming the assessor's score column.
            h = next((i for i, r in enumerate(rows[:8]) if any("assessor score" in (c or "").lower() for c in r)), None)
            if h is None:
                continue
            head = [c.strip() for c in rows[h]]
            def find(label):
                # Exact first. The scale text in column 1 reads "5-6 criteria
                # met = 3 points…", so a substring search for "Criteria Met"
                # matched the description instead of the column and every
                # Planning and Delivery sheet silently produced nothing.
                want = label.strip().lower()
                exact = next((j for j, c in enumerate(head) if c.strip().lower() == want), None)
                if exact is not None:
                    return exact
                return next((j for j, c in enumerate(head) if j >= 2 and want in c.lower()), None)
            c_met, c_score = find("Criteria Met"), find("Assessor Score")
            c_conf, c_c1 = find("CONFIRMED SCORE"), find("1st Assessor Comment")
            if c_met is None or c_score is None:
                continue
            crit_cols = [j for j in range(2, c_met) if head[j]]

            club = None
            for r in rows[h + 2:]:
                if not r or not any(r):
                    continue
                first = (r[0] or "").strip()
                if first:
                    if re.match(r"^(POOL|Pool|SEQ|Screening|Regional)\b", first):
                        club = None
                        continue
                    club = clean_club(first)
                if not club:
                    continue
                raw_assessor = (r[1] if len(r) > 1 else "").strip()
                assessor = "" if PLACEHOLDER.match(raw_assessor) else canonical_assessor(raw_assessor)
                answers = [(r[j] if j < len(r) else "").strip().lower() for j in crit_cols]
                if not any(a in ("yes", "no") for a in answers):
                    continue
                if not assessor or PLACEHOLDER.match(assessor):
                    continue
                rec = {
                    "code": sheet,
                    "club": club,
                    "assessor": assessor,
                    "met": [i + 1 for i, a in enumerate(answers) if a == "yes"],
                    "criteria": len(crit_cols),
                    "stars": num(r[c_score] if c_score < len(r) else ""),
                    "comment": (r[c_c1] if c_c1 is not None and c_c1 < len(r) else "").strip(),
                }
                conf = num(r[c_conf] if c_conf is not None and c_conf < len(r) else "")
                if conf is not None and (r[0] or "").strip():
                    rec["confirmed"] = conf
                out.append(rec)
    return out

# ------------------------------------------------------- master grids ------
def master_scores():
    """The agreed score per club per line item, from each workbook's Mastersheet.

    The per-item sheets carry the richer record — each assessor's evidence ticks
    and comments — but Pool B's Planning workbook only has item sheets for a
    handful of clubs while its Mastersheet is complete, and the Outcomes
    workbook keeps its agreed scores there too. So the Mastersheet is read as
    the authority for the agreed score and the item sheets supply the working
    underneath it.
    """
    out = []
    for key in ("planning_ac", "planning_b", "delivery", "outcomes"):
        rows = load(FILES[key])["Mastersheet"]
        header = None
        for r in rows:
            if not r:
                continue
            first = (r[0] or "").strip()
            codes = {j: c.strip() for j, c in enumerate(r) if j and re.fullmatch(r"[PDO]\d{1,2}", (c or "").strip())}
            if codes:
                header = codes
                continue
            if not first or not header:
                continue
            if re.match(r"^(Assessor|Pool|SEQ|Screening|Regional|CDA)\b", first, re.I):
                continue
            club = clean_club(first)
            for j, code in header.items():
                v = num(r[j]) if j < len(r) else None
                if v is None:
                    continue
                out.append({"club": club, "code": code, "stars": v,
                            "tier2": is_tier2(first)})
    return out

data = {
    "cycle": {"year": 2026, "name": "2026 Club Rating"},
    "clubs": clubs_and_shields(),
    "leaderboard": leaderboard(),
    "allocations": allocations(),
    "scores": item_scores(),
    "agreed": master_scores(),
    "ambassadors": ambassadors(),
}

dest = os.path.join(os.path.dirname(__file__), "out", "fq-2026.json")
with open(dest, "w") as f:
    json.dump(data, f, indent=1)

names = sorted({a["assessor"] for a in data["allocations"]} | {s["assessor"] for s in data["scores"]})
print(f"clubs        {len(data['clubs'])}")
print(f"allocations  {len(data['allocations'])}")
print(f"scores       {len(data['scores'])}")
print(f"assessors    {len(names)}: {', '.join(names)}")
print(f"pools        {sorted({c['pool'] for c in data['clubs'] if c['pool']})}")
print(f"tier 2       {[c['name'] for c in data['clubs'] if c['tier']=='T2']}")
print(f"agreed       {len(data['agreed'])}")
amb = sorted({a["assessor"] for a in data["ambassadors"]})
print(f"ambassadors  {len(data['ambassadors'])} assignments over {len({a['club'] for a in data['ambassadors']})} clubs")
print(f"             {', '.join(amb)}")
partial = [n for n in amb if " " not in n]
if partial:
    print(f"first-name only (need a surname and address): {', '.join(partial)}")
print(f"written      {dest}")
