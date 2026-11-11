"""Rebuild everything in data/ from the original sources.

    python scripts/build_data.py            # writes to data/
    python scripts/build_data.py out_dir    # writes somewhere else (e.g. to compare with data/)

Steps:
  1. fetch_raw.py  download sources into raw/ (skips files already there)
  2. prep.py       trim the CCRB allegations to the columns the page uses -> allegations.csv;
                   round precinct coordinates to 4 decimals and keep only the precinct number -> precincts.geojson
  3. rewind.py     fix polygon ring winding so d3-geo draws precincts instead of their complement
  4. income.py     aggregate ACS tracts to precincts -> precinct_income.csv (population, median income)
"""
import os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RAW = os.path.join(ROOT, "raw")
OUT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(ROOT, "data")
os.makedirs(OUT, exist_ok=True)


def run(script, *args):
    print(f"\n== {script} ==")
    subprocess.run([sys.executable, os.path.join(HERE, script), *args], check=True)


run("fetch_raw.py", RAW)
run("prep.py", os.path.join(RAW, "ccrb", "allegations_202007271729.csv"),
    os.path.join(RAW, "precincts_source.geojson"), OUT)
run("rewind.py", os.path.join(OUT, "precincts.geojson"))
run("income.py", os.path.join(RAW, "acs", "*.json"), os.path.join(RAW, "gaz_tracts_36.txt"),
    os.path.join(OUT, "precincts.geojson"), os.path.join(OUT, "precinct_income.csv"))
print("\nwrote", OUT)
