# d3-geo expects exterior rings clockwise (in lon/lat), holes counter-clockwise.
import json, sys
p = sys.argv[1]; g = json.load(open(p))
def area(r): return sum(r[i][0]*r[i+1][1]-r[i+1][0]*r[i][1] for i in range(len(r)-1))
flips = 0
for f in g["features"]:
    geom = f["geometry"]
    polys = geom["coordinates"] if geom["type"]=="MultiPolygon" else [geom["coordinates"]]
    for poly in polys:
        for i, ring in enumerate(poly):
            want_cw = (i == 0)
            if (area(ring) < 0) != want_cw: ring.reverse(); flips += 1
json.dump(g, open(p,"w"), separators=(",",":"))
print("rings flipped:", flips, "features:", len(g["features"]))
