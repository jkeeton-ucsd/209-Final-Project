// Act 3b — dumbbell: compare two quarters of precincts (busiest vs. quietest, or poorest vs. richest)
// on substantiation rate, force share, and Black complainant share.
import { css, pct } from "../utils.js";
import { showTip, hideTip } from "../ui/tooltip.js";

const MEASURES = [
  { label: "Allegations substantiated", key: "rate" },
  { label: "Allegations involving force", key: "force" },
  { label: "From Black complainants", key: "black" },
];

export function initDumbbell(model) {
  const { G, GI, q } = model;
  const MODES = [
    { key: "volume", btn: "Complaint volume", a: G.busy, b: G.quiet, aName: "Busiest quarter", bName: "Quietest quarter",
      title: "Busiest vs. quietest precincts", sub: "The quarter of precincts with the most complaints vs. the quarter with the fewest" },
    { key: "income", btn: "Income", a: GI.poor, b: GI.rich, aName: "Poorest quarter", bName: "Richest quarter",
      title: "Poorest vs. richest precincts", sub: "The quarter of precincts with the lowest median household income vs. the quarter with the highest" },
  ];
  let mode = MODES[0];

  const DW = 560, DH = 260, m = { t: 24, r: 24, b: 30, l: 170 };
  const svg = d3.select("#dumbbell").attr("viewBox", `0 0 ${DW} ${DH}`);
  const x = d3.scaleLinear().domain([0, 0.8]).range([m.l, DW - m.r]);
  const y = d3.scaleBand().domain(MEASURES.map(d => d.label)).range([m.t, DH - m.b]).padding(0.4);
  svg.append("g").attr("class", "gridlines").attr("transform", `translate(0,${DH - m.b})`)
    .call(d3.axisBottom(x).ticks(4).tickSize(-(DH - m.t - m.b)).tickFormat(""));
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${DH - m.b})`)
    .call(d3.axisBottom(x).ticks(4).tickFormat(d3.format(".0%")).tickSizeOuter(0));

  const rows = svg.append("g").selectAll("g").data(MEASURES).join("g")
    .attr("transform", d => `translate(0,${y(d.label) + y.bandwidth() / 2})`);
  rows.append("text").attr("class", "val-label").attr("x", 0).attr("dy", "0.35em").text(d => d.label);
  const line = rows.append("line").attr("stroke-width", 2);
  const dotA = rows.append("circle").attr("r", 6);
  const dotB = rows.append("circle").attr("r", 5.5).attr("stroke-width", 2);
  const labelA = rows.append("text").attr("class", "anno").attr("dy", -12).attr("text-anchor", "middle");
  const labelB = rows.append("text").attr("class", "anno").attr("text-anchor", "middle");
  rows.append("rect").attr("x", m.l).attr("y", -14).attr("width", DW - m.l - m.r).attr("height", 28).attr("fill", "transparent")
    .on("mousemove", (ev, d) => showTip(ev, `<b>${d.label}</b><br>${mode.aName}: ${pct(mode.a[d.key], 1)}<br>${mode.bName}: ${pct(mode.b[d.key], 1)}<br><span class="muted">${q} precincts in each group</span>`))
    .on("mouseleave", hideTip);

  function render(dur = 0) {
    const { a, b } = mode;
    d3.select("#db-title").text(mode.title);
    d3.select("#db-sub").text(mode.sub);
    d3.select("#db-leg-a").text(mode.aName);
    d3.select("#db-leg-b").text(mode.bName);
    d3.select("#db-note").html(`Complaints per 10,000 residents a year: <b style="color:var(--text-primary)">${a.per10k.toFixed(1)}</b> in the ${mode.aName.toLowerCase()} vs. <b style="color:var(--text-primary)">${b.per10k.toFixed(1)}</b> in the ${mode.bName.toLowerCase()}.`);
    const close = d => Math.abs(a[d.key] - b[d.key]) < 0.05;   // stack labels above/below when the dots nearly touch
    line.attr("stroke", css("--border")).transition().duration(dur).attr("x1", d => x(a[d.key])).attr("x2", d => x(b[d.key]));
    dotA.attr("fill", css("--text-primary")).transition().duration(dur).attr("cx", d => x(a[d.key]));
    dotB.attr("fill", css("--surface-1")).attr("stroke", css("--text-primary")).transition().duration(dur).attr("cx", d => x(b[d.key]));
    labelA.text(d => pct(a[d.key])).transition().duration(dur).attr("x", d => x(a[d.key]));
    labelB.text(d => pct(b[d.key])).transition().duration(dur).attr("x", d => x(b[d.key])).attr("dy", d => close(d) ? 22 : -12);
  }

  const buttons = d3.select("#db-mode").selectAll("button").data(MODES).join("button")
    .text(d => `By ${d.btn.toLowerCase()}`).attr("aria-pressed", d => d === mode)
    .on("click", (ev, d) => { mode = d; buttons.attr("aria-pressed", e => e === mode); render(600); });

  return { render, buttons };
}
