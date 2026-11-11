// Shared map geometry: projection, path generator, label anchors, and collision-aware label placement.
// Both maps (Act 1 and Act 2) use the same projection so the reader sees the same city layout.

export const MW = 760, MH = 760;   // map viewBox

export function createMapBase(geo) {
  const projection = d3.geoMercator().fitExtent([[10, 70], [MW - 10, MH - 10]], geo);
  const path = d3.geoPath(projection);

  // Anchor per precinct = centroid of its largest polygon (so island fragments don't drag it into the water).
  const centroid = new Map(geo.features.map(f => {
    let g = f.geometry;
    if (g.type === "MultiPolygon") {
      const parts = g.coordinates.map(c => ({ type: "Polygon", coordinates: c }));
      g = parts.reduce((a, b) => path.area(b) > path.area(a) ? b : a);
    }
    return [+f.properties.precinct, path.centroid(g)];
  }));

  // Greedy label placement: items arrive in priority order; each tries its anchor, then just above / below,
  // and is hidden if every spot collides with a label already placed. Keeps maps legible at any density.
  function placeLabels(g, items, max = Infinity) {
    const placed = [];
    g.selectAll("text").data(items, d => d.p).join("text")
      .attr("class", d => "map-label" + (d.minor ? " minor" : ""))
      .attr("text-anchor", "middle")
      .text(d => d.text)
      .each(function (d) {
        this.style.display = null;
        const [cx, cy] = centroid.get(d.p);
        let ok = false;
        if (placed.length < max) for (const dy of [4, -9, 17]) {
          this.setAttribute("x", cx); this.setAttribute("y", cy + dy);
          const b = this.getBBox();
          const box = { x0: b.x - 2, y0: b.y, x1: b.x + b.width + 2, y1: b.y + b.height };
          if (box.x0 < 0 || box.x1 > MW) continue;
          if (!placed.some(o => box.x0 < o.x1 && box.x1 > o.x0 && box.y0 < o.y1 && box.y1 > o.y0)) { placed.push(box); ok = true; break; }
        }
        if (!ok) this.style.display = "none";
      });
  }

  return { projection, path, centroid, placeLabels, features: geo.features };
}
