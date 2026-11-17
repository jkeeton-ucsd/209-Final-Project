// Act 3c — complaint mix: does a different mix of complaint types explain the gap? Two stacked bars show the share
// of allegations by type for two quarters of precincts, beside the rate that mix would predict (citywide rate for
// each type, weighted by the mix) and the rate actually upheld. Groupings match the dumbbell, plus one by the
// substantiation rate itself: the most direct test of whether the precincts upheld least file harder complaints.
import { pct } from "../utils.js";
import { showTip, hideTip } from "../ui/tooltip.js";

const TYPES = [
  { k: "force", label: "Force", cls: "t-force" },
  { k: "abuse", label: "Abuse of authority", cls: "t-abuse" },
  { k: "disc", label: "Discourtesy / offensive language", cls: "t-disc" },
];

export function initMix(model) {
  const { G, GI, GR, q, cityUp } = model;
  const MODES = [
    { btn: "Substantiation rate", a: GR.low, b: GR.high, aName: "Lowest-rate quarter", bName: "Highest-rate quarter",
      sub: `Share of allegations by type, for the ${q} precincts with the lowest substantiation rates vs. the ${q} with the highest` },
    { btn: "Complaint volume", a: G.busy, b: G.quiet, aName: "Busiest quarter", bName: "Quietest quarter",
      sub: `Share of allegations by type, for the ${q} precincts with the most complaints vs. the ${q} with the fewest` },
    { btn: "Income", a: GI.poor, b: GI.rich, aName: "Poorest quarter", bName: "Richest quarter",
      sub: `Share of allegations by type, for the ${q} precincts with the lowest median income vs. the ${q} with the highest` },
  ];
  let mode = MODES[0];

  const W = 760, H = 166, m = { t: 48, l: 150 }, barW = 360, xE = m.l + barW + 80, xA = xE + 105, rowH = 40, gap = 22;
  const x = d3.scaleLinear().domain([0, 1]).range([m.l, m.l + barW]);
  const svg = d3.select("#mix").attr("viewBox", `0 0 ${W} ${H}`);
  // column headers, two lines each so the narrow number columns don't collide
  const head = (x, anchor, lines) => {
    const t = svg.append("text").attr("class", "mix-head").attr("x", x).attr("y", lines.length > 1 ? 14 : 28).attr("text-anchor", anchor);
    lines.forEach((l, i) => t.append("tspan").attr("x", x).attr("dy", i ? 14 : 0).text(l));
  };
  head(m.l, "start", ["Mix of complaints"]);
  head(xE, "middle", ["Expected", "from mix"]);
  head(xA, "middle", ["Actually", "upheld"]);

  const rows = svg.append("g").selectAll("g").data(["a", "b"]).join("g")
    .attr("transform", (d, i) => `translate(0,${m.t + i * (rowH + gap)})`);
  const name = rows.append("text").attr("class", "val-label").attr("x", 0).attr("y", rowH / 2).attr("dy", "0.35em").style("font-weight", 600);
  const segs = rows.selectAll("g.seg").data(r => TYPES.map(t => ({ r, t }))).join("g").attr("class", d => `seg ${d.t.cls}`);
  const rects = segs.append("rect").attr("y", 0).attr("height", rowH)
    .on("mousemove", (ev, d) => {
      const g = mode[d.r];
      showTip(ev, `<b>${mode[d.r + "Name"]}</b><br>${pct(g.mix[d.t.k], 1)} of allegations were ${d.t.label.toLowerCase()}` +
        `<br><span class="muted">${pct(g.up[d.t.k], 1)} of those were upheld (city ${pct(cityUp[d.t.k], 1)})</span>`);
    })
    .on("mouseleave", hideTip);
  const segLabels = segs.append("text").attr("class", "mix-seg-label").attr("y", rowH / 2).attr("dy", "0.35em").attr("text-anchor", "middle");
  const exp = rows.append("text").attr("class", "mix-val muted").attr("x", xE).attr("y", rowH / 2).attr("dy", "0.35em").attr("text-anchor", "middle");
  const act = rows.append("text").attr("class", "mix-val").attr("x", xA).attr("y", rowH / 2).attr("dy", "0.35em").attr("text-anchor", "middle");

  // legend with the citywide upheld rate for each type, so readers see why mix could matter in principle
  d3.select("#mix-legend").html(TYPES.map(t =>
    `<span><span class="sw ${t.cls}"></span>${t.label} <span class="muted">(${pct(cityUp[t.k])} upheld citywide)</span></span>`).join(""));

  function render(dur = 0) {
    d3.select("#mix-sub").text(mode.sub);
    name.text(r => mode[r + "Name"]);
    const starts = r => { let acc = 0; return TYPES.map(t => { const s = acc; acc += mode[r].mix[t.k]; return s; }); };
    rects.transition().duration(dur)
      .attr("x", d => x(starts(d.r)[TYPES.indexOf(d.t)]))
      .attr("width", d => x(mode[d.r].mix[d.t.k]) - x(0));
    segLabels.text(d => pct(mode[d.r].mix[d.t.k]))
      .transition().duration(dur)
      .attr("x", d => x(starts(d.r)[TYPES.indexOf(d.t)] + mode[d.r].mix[d.t.k] / 2));
    exp.text(r => pct(mode[r].expected, 1));
    act.text(r => pct(mode[r].rate, 1));
    const { a, b } = mode, dE = Math.abs(a.expected - b.expected) * 100, dA = Math.abs(a.rate - b.rate) * 100;
    d3.select("#mix-note").html(`Their mixes would predict rates <b>${dE.toFixed(1)}</b> points apart. ` +
      `The board's rulings ended up <b>${dA.toFixed(1)}</b> points apart.`);
  }

  const buttons = d3.select("#mix-mode").selectAll("button").data(MODES).join("button")
    .text(d => `By ${d.btn.toLowerCase()}`).attr("aria-pressed", d => d === mode)
    .on("click", (ev, d) => { mode = d; buttons.attr("aria-pressed", e => e === mode); render(600); });

  return { render, buttons };
}
