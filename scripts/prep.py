import csv, json, sys, collections
src_csv, src_geo, out_dir = sys.argv[1], sys.argv[2], sys.argv[3]
keep = ["complaint_id","month_received","year_received","precinct","fado_type","allegation",
        "board_disposition","complainant_ethnicity","mos_ethnicity","contact_reason"]
rows = list(csv.DictReader(open(src_csv, encoding="utf-8")))
with open(f"{out_dir}/allegations.csv","w",newline="",encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=keep); w.writeheader()
    for r in rows: w.writerow({k: r[k] for k in keep})
print(len(rows), "rows")
print("years", collections.Counter(r["year_received"] for r in rows).most_common()[:40])
print("precinct blanks", sum(1 for r in rows if not r["precinct"].strip()))
print("fado", collections.Counter(r["fado_type"] for r in rows))
print("disp", collections.Counter(r["board_disposition"].split(" (")[0] for r in rows))
g = json.load(open(src_geo, encoding="utf-8"))
def rnd(c):
    return [rnd(x) for x in c] if isinstance(c[0], list) else [round(c[0],4), round(c[1],4)]
for ft in g["features"]:
    ft["geometry"]["coordinates"] = rnd(ft["geometry"]["coordinates"])
    ft["properties"] = {"precinct": int(ft["properties"]["precinct"])}
json.dump(g, open(f"{out_dir}/precincts.geojson","w"), separators=(",",":"))
geo_p = {f["properties"]["precinct"] for f in g["features"]}
data_p = collections.Counter(r["precinct"] for r in rows)
print("precincts in data not in map:", {p:c for p,c in data_p.items() if not p.isdigit() or int(p) not in geo_p})
