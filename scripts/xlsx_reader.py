"""Minimal xlsx reader — no dependencies, just the parts of the format we need."""
import re, sys, zipfile, xml.etree.ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}

def col_index(ref):
    letters = re.match(r"([A-Z]+)", ref).group(1)
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - 64)
    return n - 1

def load(path):
    z = zipfile.ZipFile(path)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        root = ET.fromstring(z.read("xl/sharedStrings.xml"))
        for si in root.findall("m:si", NS):
            shared.append("".join(t.text or "" for t in si.iter("{%s}t" % NS["m"])))

    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    target = {r.get("Id"): r.get("Target") for r in rels}

    sheets = []
    for sh in wb.find("m:sheets", NS):
        rid = sh.get("{%s}id" % NS["r"])
        t = target[rid].lstrip("/")
        if not t.startswith("xl/"):
            t = "xl/" + t
        sheets.append((sh.get("name"), t))

    out = {}
    for name, path_in in sheets:
        root = ET.fromstring(z.read(path_in))
        rows = []
        for row in root.iter("{%s}row" % NS["m"]):
            cells = {}
            for c in row.findall("m:c", NS):
                ref = c.get("r")
                if not ref:
                    continue
                i = col_index(ref)
                t = c.get("t")
                v = c.find("m:v", NS)
                if t == "s" and v is not None:
                    val = shared[int(v.text)]
                elif t == "inlineStr":
                    isn = c.find("m:is", NS)
                    val = "".join(x.text or "" for x in isn.iter("{%s}t" % NS["m"])) if isn is not None else ""
                elif v is not None:
                    val = v.text
                else:
                    val = ""
                cells[i] = (val or "").strip()
            width = (max(cells) + 1) if cells else 0
            rows.append([cells.get(i, "") for i in range(width)])
        out[name] = rows
    return out

if __name__ == "__main__":
    data = load(sys.argv[1])
    only = sys.argv[2] if len(sys.argv) > 2 else None
    limit = int(sys.argv[3]) if len(sys.argv) > 3 else 40
    for name, rows in data.items():
        if only and only != name:
            continue
        print(f"\n===== SHEET: {name}  ({len(rows)} rows)")
        for i, r in enumerate(rows[:limit]):
            if any(c for c in r):
                print(f"{i:>4} | " + " | ".join(c[:38] for c in r[:14]))
