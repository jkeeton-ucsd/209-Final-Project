"""Download the raw source files into raw/ (not committed; see .gitignore).

    python scripts/fetch_raw.py [raw_dir]

Sources:
  - ProPublica CCRB allegations (July 2020 release)       raw/ccrb/allegations_202007271729.csv
  - NYC Open Data "Police Precincts" (y76i-bdw7)           raw/precincts_source.geojson
  - Census Gazetteer 2024 tract file for New York State    raw/gaz_tracts_36.txt
  - ACS 2020-2024 5-year, tables B19001 + B01003, every
    tract in the five NYC counties (via Census Reporter)   raw/acs/<county>.json
"""
import io, os, sys, urllib.request, zipfile

RAW = sys.argv[1] if len(sys.argv) > 1 else "raw"
ACS_RELEASE = "acs2024_5yr"   # pinned so a newer ACS release can't silently change the numbers
NYC_COUNTIES = ["36005", "36047", "36061", "36081", "36085"]   # Bronx, Kings, New York, Queens, Richmond

SOURCES = {
    "ccrb.zip": "https://static.propublica.org/projects/datastore-archive/CCRB-Complaint-Data_202007271729.zip",
    "precincts_source.geojson": "https://data.cityofnewyork.us/api/geospatial/y76i-bdw7?method=export&format=GeoJSON",
    "gaz_tracts_36.txt": "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_gaz_tracts_36.txt",
}
for c in NYC_COUNTIES:
    SOURCES[f"acs/{c}.json"] = (f"https://api.censusreporter.org/1.0/data/show/{ACS_RELEASE}"
                                f"?table_ids=B19001,B01003&geo_ids=140|05000US{c}")


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "dsc209-data-pipeline"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


os.makedirs(os.path.join(RAW, "acs"), exist_ok=True)
for name, url in SOURCES.items():
    path = os.path.join(RAW, name)
    if os.path.exists(path):
        print(f"skip   {name} (already downloaded)")
        continue
    print(f"fetch  {name}")
    data = fetch(url)
    with open(path, "wb") as f:
        f.write(data)

ccrb_dir = os.path.join(RAW, "ccrb")
if not os.path.exists(os.path.join(ccrb_dir, "allegations_202007271729.csv")):
    with zipfile.ZipFile(os.path.join(RAW, "ccrb.zip")) as z:
        z.extractall(ccrb_dir)
print("done ->", RAW)
