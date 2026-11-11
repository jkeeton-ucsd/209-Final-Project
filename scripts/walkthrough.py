# %% [markdown]
# # Data pipeline walkthrough
# Step through how every file in `data/` is built, one cell at a time.
# In VS Code, click **Run Cell** above each `# %%` (or Shift+Enter) to run it in the Interactive Window.
#
# This recomputes each step in the open (same logic as `prep.py`, `rewind.py` and `income.py`)
# and checks the result against the committed `data/` files.
# Needs pandas. Raw downloads go in `raw/` (fetched in the first cell if missing).

# %% Setup: find the repo root and make sure the raw files exist
import json, subprocess, sys
from pathlib import Path
import pandas as pd

ROOT = next(p for p in [Path.cwd(), *Path.cwd().parents] if (p / "data" / "allegations.csv").exists())
RAW, DATA = ROOT / "raw", ROOT / "data"
if not (RAW / "acs").exists():
    subprocess.run([sys.executable, str(ROOT / "scripts" / "fetch_raw.py"), str(RAW)], check=True)
print("repo:", ROOT)
sorted(str(p.relative_to(RAW)) for p in RAW.rglob("*") if p.is_file() and "__MACOSX" not in str(p))

# %% [markdown]
# ## Step 1: allegations (prep.py)
# The ProPublica release has one row per allegation. We keep 10 of its columns, unchanged.

# %% Load the raw CCRB file
raw = pd.read_csv(RAW / "ccrb" / "allegations_202007271729.csv", dtype=str, keep_default_na=False)
print(raw.shape)
raw.head()

# %% What's in it: years, allegation types, findings
display(raw["year_received"].astype(int).value_counts().sort_index().loc[1995:].to_frame("allegations").T)
display(raw["fado_type"].value_counts().to_frame())
display(raw["board_disposition"].str.split(" (", regex=False).str[0].value_counts().to_frame("finding"))

# %% Trim to the columns the page uses, then compare with data/allegations.csv
KEEP = ["complaint_id", "month_received", "year_received", "precinct", "fado_type", "allegation",
        "board_disposition", "complainant_ethnicity", "mos_ethnicity", "contact_reason"]
mine = raw[KEEP]
committed = pd.read_csv(DATA / "allegations.csv", dtype=str, keep_default_na=False)
print("matches data/allegations.csv:", mine.reset_index(drop=True).equals(committed))
# Note: the page itself (js/data.js) later drops years outside 2000-2019 and precincts not on the map
print("rows with no mappable precinct:", raw["precinct"].isin(["", "0", "1000"]).sum())

# %% [markdown]
# ## Step 2: precinct boundaries (prep.py + rewind.py)
# Round coordinates to 4 decimals (about 10 m), keep only the precinct number, then fix ring winding:
# d3-geo wants outer rings clockwise and holes counter-clockwise, otherwise it fills the whole globe *except* the precinct.

# %% Load and round
geo = json.loads((RAW / "precincts_source.geojson").read_text(encoding="utf-8"))
print(len(geo["features"]), "features; properties before:", geo["features"][0]["properties"])

def rnd(c):
    return [rnd(x) for x in c] if isinstance(c[0], list) else [round(c[0], 4), round(c[1], 4)]

for ft in geo["features"]:
    ft["geometry"]["coordinates"] = rnd(ft["geometry"]["coordinates"])
    ft["properties"] = {"precinct": int(ft["properties"]["precinct"])}
print("properties after:", geo["features"][0]["properties"])

# %% Check each ring's direction with the signed (shoelace) area: < 0 means clockwise in lon/lat
def signed_area(ring):
    return sum(ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1] for i in range(len(ring) - 1))

def polygons(ft):
    g = ft["geometry"]
    return g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]

rings = pd.DataFrame([
    {"precinct": ft["properties"]["precinct"], "kind": "outer" if i == 0 else "hole", "clockwise": signed_area(r) < 0}
    for ft in geo["features"] for poly in polygons(ft) for i, r in enumerate(poly)
])
pd.crosstab(rings["kind"], rings["clockwise"])   # anything outer/False or hole/True gets flipped

# %% Flip the wrong ones and compare with data/precincts.geojson
flips = 0
for ft in geo["features"]:
    for poly in polygons(ft):
        for i, ring in enumerate(poly):
            if (signed_area(ring) < 0) != (i == 0):
                ring.reverse(); flips += 1
print("rings flipped:", flips)
print("matches data/precincts.geojson:", geo == json.loads((DATA / "precincts.geojson").read_text()))

# %% [markdown]
# ## Step 3: census tracts -> precincts (income.py)
# Each tract has an "internal point" (roughly its center) in the Census Gazetteer.
# The whole tract goes to the precinct containing that point.

# %% Tract points from the Gazetteer, NYC counties only
NYC = {"36005": "Bronx", "36047": "Brooklyn", "36061": "Manhattan", "36081": "Queens", "36085": "Staten Island"}
gaz = pd.read_csv(RAW / "gaz_tracts_36.txt", sep="\t", dtype={"GEOID": str})
gaz.columns = gaz.columns.str.strip()
gaz = gaz[gaz["GEOID"].str[:5].isin(NYC)][["GEOID", "INTPTLAT", "INTPTLONG"]].set_index("GEOID")
print(len(gaz), "NYC tracts")
gaz.head()

# %% ACS tables per tract: population (B01003) and households in 16 income brackets (B19001_002..017)
BRACKETS = [f"B19001{i:03d}" for i in range(2, 18)]
recs = {}
for fp in sorted((RAW / "acs").glob("*.json")):
    d = json.loads(fp.read_text())
    for gid, t in d["data"].items():
        recs[gid.split("US")[1]] = {"pop": t["B01003"]["estimate"]["B01003001"] or 0,
                                    **{b: t["B19001"]["estimate"][b] or 0 for b in BRACKETS}}
acs = pd.DataFrame.from_dict(recs, orient="index")
print(d["release"]["name"], "|", len(acs), "tracts")
acs.head()

# %% Point-in-polygon (even-odd ray casting): count how many edges a ray going right from the point crosses
def inside(pt, rings):
    x, y = pt; c = False
    for ring in rings:
        for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
            if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
                c = not c
    return c

shapes = [(ft["properties"]["precinct"], polygons(ft)) for ft in geo["features"]]
def precinct_of(pt):
    return next((p for p, parts in shapes if any(inside(pt, rings) for rings in parts)), None)

# spot-check 5 random tracts
gid = gaz.index[0:5]
for gid in gid:
    print(gid, gaz.loc[gid], "-> precinct", precinct_of((gaz.loc[gid, "INTPTLONG"], gaz.loc[gid, "INTPTLAT"])))

# %% Assign every tract (takes a few seconds)
tracts = acs.join(gaz, how="inner")
tracts["precinct"] = [precinct_of((lon, lat)) for lon, lat in zip(tracts["INTPTLONG"], tracts["INTPTLAT"])]
tracts["borough"] = tracts.index.str[:5].map(NYC)
print("assigned:", tracts["precinct"].notna().sum(), "| unassigned:", tracts["precinct"].isna().sum(),
      "| unassigned population:", int(tracts.loc[tracts["precinct"].isna(), "pop"].sum()))
tracts[tracts["precinct"].isna()].sort_values("pop", ascending=False)[["borough", "pop", "INTPTLAT", "INTPTLONG"]].head(10)

# %% Tracts per precinct
tracts.dropna(subset=["precinct"]).groupby("precinct").size().describe()

# %% [markdown]
# ## Step 4: population and median income per precinct (income.py)
# Sum population and bracket counts over each precinct's tracts. Then find the bracket holding the
# middle household and interpolate linearly within it. The top bracket is open-ended, so medians there are top-coded at $200k.

# %% Sum tracts into precincts
EDGES = [0, 10e3, 15e3, 20e3, 25e3, 30e3, 35e3, 40e3, 45e3, 50e3, 60e3, 75e3, 100e3, 125e3, 150e3, 200e3, None]
agg = tracts.dropna(subset=["precinct"]).groupby("precinct")[["pop", *BRACKETS]].sum()
agg.index = agg.index.astype(int)
agg["tracts"] = tracts.dropna(subset=["precinct"]).groupby("precinct").size().values
agg[["pop", "tracts"]].head()

# %% The median, step by step, for one precinct (75 = East New York; change it to check others)
P = 75
row = agg.loc[P, BRACKETS]
table = pd.DataFrame({"from": EDGES[:-1], "to": EDGES[1:], "households": row.values})
table["cumulative"] = table["households"].cumsum()
half = table["households"].sum() / 2
i = int((table["cumulative"] >= half).idxmax())
before = table["cumulative"][i - 1] if i else 0
lo, hi, n = table.loc[i, "from"], table.loc[i, "to"], table.loc[i, "households"]
print(f"{table['households'].sum():,} households; middle one is #{half:,.0f}, in the ${lo:,.0f}-${hi:,.0f} bracket")
print(f"median = {lo:,.0f} + ({hi:,.0f} - {lo:,.0f}) * ({half:,.0f} - {before:,.0f}) / {n:,.0f} = {lo + (hi - lo) * (half - before) / n:,.0f}")
table

# %% Do it for every precinct and compare with data/precinct_income.csv
def median(br):
    total = sum(br); half = total / 2; run = 0
    for i, n in enumerate(br):
        if run + n >= half:
            lo, hi = EDGES[i], EDGES[i + 1]
            if hi is None: return 200000.0
            return lo + (hi - lo) * (half - run) / n if n else lo
        run += n

out = pd.DataFrame({
    "precinct": agg.index,
    "population": agg["pop"].round().astype(int).values,
    "households": agg[BRACKETS].sum(axis=1).round().astype(int).values,
    "median_income": [round(median(list(r))) if sum(r) else None for r in agg[BRACKETS].values],
    "tracts": agg["tracts"].values,
})
committed = pd.read_csv(DATA / "precinct_income.csv")
print("matches data/precinct_income.csv:", out.astype(float).equals(committed.astype(float)))   # Central Park has no median (NaN in both)
out.sort_values("median_income").head()

# %%
