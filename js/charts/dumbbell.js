// Act 3b — dumbbell: compare two quarters of precincts (busiest vs. quietest, or poorest vs. richest) on how
// often their allegations are substantiated: overall, then within each complaint type. Each row carries a tick at
// the citywide rate, the same numbers as the "How the board ruled" chart in Act 2, so readers see that chart
// split in two.
import { css, pct } from "../utils.js";
import { showTip, hideTip } from "../ui/tooltip.js";

const TYPE_HEAD = "Within each type of complaint";   // small heading row above the per-type measures

export function initDumbbell(model) {
  const { G, GI, q, cityRate, cityUp } = model;
  const MEASURES = [
    { label: "All allegations", get: g => g.rate, city: cityRate },
    { label: "Abuse of authority", get: g => g.up.abuse, city: cityUp.abuse, type: true },
    { label: "Force", get: g => g.up.force, city: cityUp.force, type: true },
    { label: "Discourtesy / offensive language", get: g => g.up.disc, city: cityUp.disc, type: true },
  ];
  const MODES = [
    { key: "volume", btn: "Complaint volume", a: G.busy, b: G.quiet, aName: "Busiest quarter", bName: "Quietest quarter",
      title: "Busiest vs. quietest precincts", sub: "Share of allegations substantiated, for the quarter of precincts with the most complaints vs. the quarter with the fewest" },
    { key: "income", btn: "Income", a: GI.poor, b: GI.rich, aName: "Poorest quarter", bName: "Richest quarter",
      title: "Poorest vs. richest precincts", sub: "Share of allegations substantiated, for the quarter of precincts with the lowest median household income vs. the highest" },
  ];
  let mode = MODES[0];

  const DW = 560, DH = 290, m = { t: 24, r: 24, b: 30, l: 196 };
  const svg = d3.select("#dumbbell").attr("viewBox", `0 0 ${DW} ${DH}`);
  // one fixed scale for both groupings, so switching modes moves the dots rather than the axis
  const xMax = d3.max(MODES, md => d3.max(MEASURES, d => Math.max(d.get(md.a), d.get(md.b), d.city)));
  const x = d3.scaleLinear().domain([0, xMax * 1.12]).nice().range([m.l, DW - m.r]);
  const y = d3.scaleBand().domain([MEASURES[0].label, TYPE_HEAD, ...MEASURES.slice(1).map(d => d.label)])
    .range([m.t, DH - m.b]).padding(0.4);
  svg.append("g").attr("class", "gridlines").attr("transform", `translate(0,${DH - m.b})`)
    .call(d3.axisBottom(x).ticks(5).tickSize(-(DH - m.t - m.b)).tickFormat(""));
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${DH - m.b})`)
    .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format(".0%")).tickSizeOuter(0));
  svg.append("text").attr("class", "db-head").attr("x", 0)
    .attr("y", y(TYPE_HEAD) + y.bandwidth()).text(TYPE_HEAD.toUpperCase());

  const rows = svg.append("g").selectAll("g").data(MEASURES).join("g")
    .attr("transform", d => `translate(0,${y(d.label) + y.bandwidth() / 2})`);
  rows.append("text").attr("class", "val-label").attr("x", d => d.type ? 10 : 0).attr("dy", "0.35em")
    .style("font-weight", d => d.type ? null : 600).text(d => d.label);
  // citywide reference tick (doesn't change with the grouping)
  rows.append("line").attr("class", "db-city").attr("y1", -9).attr("y2", 9).attr("x1", d => x(d.city)).attr("x2", d => x(d.city));
  const line = rows.append("line").attr("stroke-width", 2);
  const dotA = rows.append("circle").attr("r", 6);
  const dotB = rows.append("circle").attr("r", 5.5).attr("stroke-width", 2);
  const labelA = rows.append("text").attr("class", "anno").attr("dy", -12).attr("text-anchor", "middle");
  const labelB = rows.append("text").attr("class", "anno").attr("text-anchor", "middle");
  rows.append("rect").attr("x", m.l).attr("y", -14).attr("width", DW - m.l - m.r).attr("height", 28).attr("fill", "transparent")
    .on("mousemove", (ev, d) => showTip(ev, `<b>${d.label}</b>: share substantiated<br>${mode.aName}: ${pct(d.get(mode.a), 1)}<br>${mode.bName}: ${pct(d.get(mode.b), 1)}` +
      `<br><span class="muted">Citywide: ${pct(d.city, 1)} · ${q} precincts in each group</span>`))
    .on("mouseleave", hideTip);

  function render(dur = 0) {
    const { a, b } = mode;
    d3.select("#db-title").text(mode.title);
    d3.select("#db-sub").text(mode.sub);
    d3.select("#db-leg-a").text(mode.aName);
    d3.select("#db-leg-b").text(mode.bName);
    d3.select("#db-note").html(`Complaints per 10,000 residents a year: <b style="color:var(--text-primary)">${a.per10k.toFixed(1)}</b> in the ${mode.aName.toLowerCase()} vs. <b style="color:var(--text-primary)">${b.per10k.toFixed(1)}</b> in the ${mode.bName.toLowerCase()}.`);
    const close = d => Math.abs(x(d.get(a)) - x(d.get(b))) < 34;   // stack labels above/below when they'd collide
    line.attr("stroke", css("--border")).transition().duration(dur).attr("x1", d => x(d.get(a))).attr("x2", d => x(d.get(b)));
    dotA.attr("fill", css("--text-primary")).transition().duration(dur).attr("cx", d => x(d.get(a)));
    dotB.attr("fill", css("--surface-1")).attr("stroke", css("--text-primary")).transition().duration(dur).attr("cx", d => x(d.get(b)));
    labelA.text(d => pct(d.get(a))).transition().duration(dur).attr("x", d => x(d.get(a)));
    labelB.text(d => pct(d.get(b))).transition().duration(dur).attr("x", d => x(d.get(b))).attr("dy", d => close(d) ? 22 : -12);
  }

  const buttons = d3.select("#db-mode").selectAll("button").data(MODES).join("button")
    .text(d => `By ${d.btn.toLowerCase()}`).attr("aria-pressed", d => d === mode)
    .on("click", (ev, d) => { mode = d; buttons.attr("aria-pressed", e => e === mode); render(600); });

  return { render, buttons };
}
