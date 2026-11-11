"""Estimate median household income + population per NYPD precinct from ACS tract data.
Each tract is assigned to the precinct containing its internal point; income bracket counts
(B19001) are summed per precinct and the median is linearly interpolated within its bracket."""
import json, glob, csv, sys, math
acs_glob, gaz_path, geo_path, out_path = sys.argv[1:5]
NYC = {"36005", "36047", "36061", "36081", "36085"}

pts = {}
with open(gaz_path, encoding="utf-8") as f:
    hdr = [h.strip() for h in f.readline().split("\t")]
    for line in f:
        r = dict(zip(hdr, [x.strip() for x in line.split("\t")]))
        if r["GEOID"][:5] in NYC: pts[r["GEOID"]] = (float(r["INTPTLONG"]), float(r["INTPTLAT"]))

tracts, release = {}, None
for fp in glob.glob(acs_glob):
    d = json.load(open(fp)); release = d["release"]["name"]
    for gid, t in d["data"].items():
        tracts[gid.split("US")[1]] = t

geo = json.load(open(geo_path))
def inside(pt, rings):  # even-odd ray casting over all rings (holes handled)
    x, y = pt; c = False
    for ring in rings:
        for i in range(len(ring) - 1):
            (x1, y1), (x2, y2) = ring[i], ring[i + 1]
            if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1: c = not c
    return c
polys = []
for ft in geo["features"]:
    g = ft["geometry"]; parts = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    polys.append((ft["properties"]["precinct"], parts))
def precinct_of(pt):
    for p, parts in polys:
        if any(inside(pt, rings) for rings in parts): return p
    return None

EDGES = [0, 10e3, 15e3, 20e3, 25e3, 30e3, 35e3, 40e3, 45e3, 50e3, 60e3, 75e3, 100e3, 125e3, 150e3, 200e3, None]
agg, unassigned_pop = {}, 0
for gid, t in tracts.items():
    if gid not in pts: continue
    pop = t["B01003"]["estimate"]["B01003001"] or 0
    br = [t["B19001"]["estimate"]["B19001%03d" % i] or 0 for i in range(2, 18)]
    p = precinct_of(pts[gid])
    if p is None: unassigned_pop += pop; continue
    a = agg.setdefault(p, {"pop": 0, "br": [0] * 16, "tracts": 0})
    a["pop"] += pop; a["tracts"] += 1; a["br"] = [x + y for x, y in zip(a["br"], br)]

def median(br):
    hh = sum(br); half = hh / 2; run = 0
    for i, n in enumerate(br):
        if run + n >= half:
            lo, hi = EDGES[i], EDGES[i + 1]
            if hi is None: return 200000.0  # top-coded
            return lo + (hi - lo) * (half - run) / n if n else lo
        run += n
rows = []
for p, a in sorted(agg.items()):
    rows.append({"precinct": p, "population": round(a["pop"]), "households": round(sum(a["br"])),
                 "median_income": round(median(a["br"])) if sum(a["br"]) else "", "tracts": a["tracts"]})
with open(out_path, "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
print("release:", release, "| tracts:", len(tracts), "| precincts:", len(rows), "| unassigned pop:", round(unassigned_pop))
print("total pop:", sum(r["population"] for r in rows))
for r in sorted(rows, key=lambda r: r["median_income"] or 0)[:5] + sorted(rows, key=lambda r: r["median_income"] or 0)[-5:]: print(r)
