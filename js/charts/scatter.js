// Act 3a — scatter: one dot per precinct, a switchable x measure (volume / per resident / income)
// against substantiation rate, with a log-linear trend line and its correlation.
import { HOOD, pname } from "../config.js";
import { css, pct, usd, corr } from "../utils.js";
import { showTip, hideTip } from "../ui/tooltip.js";
import { highlight, onHighlight } from "../ui/highlight.js";

const MODES = [
  { key: "volume", btn: "Total complaints", get: s => s.complaints, title: "Complaint volume vs. substantiation rate",
    axis: "Complaints, 2000–2019 (log scale) →", fmt: d3.format("~s") },
  { key: "percap", btn: "Per resident", get: s => s.per10k, title: "Complaints per resident vs. substantiation rate",
    axis: "Complaints per 10,000 residents per year (log scale) →", fmt: d3.format("~r") },
  { key: "income", btn: "Median income", get: s => s.income, title: "Neighborhood income vs. substantiation rate",
    axis: "Median household income, 2020–24 (log scale) →", fmt: v => "$" + d3.format("~s")(v) },
];

export function initScatter(model, side) {
  const { reliable, cityRate } = model;
  let mode = MODES[0];

  const SW = 560, SH = 400, m = { t: 16, r: 16, b: 40, l: 46 };
  const svg = d3.select("#scatter").attr("viewBox", `0 0 ${SW} ${SH}`);
  const x = d3.scaleLog().range([m.l, SW - m.r]);
  const y = d3.scaleLinear().domain([0, d3.max(reliable, s => s.rate) * 1.1]).nice().range([SH - m.b, m.t]);

  svg.append("g").attr("class", "gridlines").attr("transform", `translate(${m.l},0)`)
    .call(d3.axisLeft(y).ticks(5).tickSize(-(SW - m.l - m.r)).tickFormat(""));
  const xAxis = svg.append("g").attr("class", "axis").attr("transform", `translate(0,${SH - m.b})`);
  svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`)
    .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format(".0%")).tickSizeOuter(0));
  const xLabel = svg.append("text").attr("class", "anno").attr("x", (m.l + SW - m.r) / 2).attr("y", SH - 6).attr("text-anchor", "middle");
  svg.append("text").attr("class", "anno").attr("transform", `translate(12,${(m.t + SH - m.b) / 2}) rotate(-90)`)
    .attr("text-anchor", "middle").text("Allegations substantiated");
  const cityLine = svg.append("line").attr("x1", m.l).attr("x2", SW - m.r).attr("y1", y(cityRate)).attr("y2", y(cityRate)).attr("stroke-dasharray", "4 3");
  svg.append("text").attr("class", "anno").attr("x", SW - m.r).attr("y", y(cityRate) - 5).attr("text-anchor", "end").text(`city avg ${pct(cityRate)}`);
  const trend = svg.append("line").attr("stroke-width", 2);
  const trendLabel = svg.append("text").attr("class", "anno").attr("text-anchor", "end");

  const dots = svg.append("g").selectAll("circle").data(reliable).join("circle")
    .attr("r", 5).attr("stroke-width", 1.5).style("cursor", "pointer")
    .on("mousemove", (ev, s) => {
      highlight(s.p); side.show(s.p);
      showTip(ev, `<b>${pname(s.p)}</b><br>${pct(s.rate, 1)} of allegations substantiated<br><span class="muted">${s.complaints.toLocaleString()} complaints · ${s.per10k.toFixed(1)} per 10k residents/yr<br>Median household income ${usd(s.income)}</span>`);
    })
    .on("mouseleave", () => { highlight(null); side.restore(); hideTip(); });
  const labels = svg.append("g");

  /** Least-squares fit of rate on log10(x); r is the matching correlation. */
  function fitFor(md) {
    const lx = reliable.map(s => Math.log10(md.get(s))), ly = reliable.map(s => s.rate);
    const mx = d3.mean(lx), my = d3.mean(ly);
    const slope = d3.sum(lx, (v, i) => (v - mx) * (ly[i] - my)) / d3.sum(lx, v => (v - mx) ** 2);
    return { f: v => my + slope * (Math.log10(v) - mx), r: corr(lx, ly) };
  }

  function render(dur = 0) {
    const md = mode, { f, r } = fitFor(md);
    const [lo, hi] = d3.extent(reliable, md.get);
    x.domain([lo / 1.12, hi * 1.12]);   // pad instead of .nice(): on a log scale nice() jumps to whole powers of ten
    const [c0, c1] = x.domain();
    d3.select("#sc-title").text(md.title);
    xLabel.text(md.axis);
    xAxis.transition().duration(dur).call(d3.axisBottom(x).ticks(5).tickFormat(v => {
      // log axes get crowded; only label 1, 2, 5 × powers of ten
      const lead = v / 10 ** Math.floor(Math.log10(v) + 1e-9);
      return [1, 2, 5].some(k => Math.abs(lead - k) < 1e-6) ? md.fmt(v) : "";
    }).tickSizeOuter(0));
    cityLine.attr("stroke", css("--text-muted"));
    trend.attr("stroke", css("--div-lo"))
      .transition().duration(dur).attr("x1", x(c0)).attr("y1", y(f(c0))).attr("x2", x(c1)).attr("y2", y(f(c1)));
    // fixed in the top-right corner so it never lands on a point label
    trendLabel.text(`red line = trend, r = ${r.toFixed(2)}`).attr("x", SW - m.r).attr("y", m.t - 2);
    dots.attr("fill", css("--sub")).attr("fill-opacity", 0.75).attr("stroke", css("--surface-1"))
      .transition().duration(dur).attr("cx", s => x(md.get(s))).attr("cy", s => y(s.rate));

    // label the two extremes on x plus the two highest rates
    const byX = [...reliable].sort((a, b) => md.get(b) - md.get(a));
    const picks = [...new Set([byX[0], byX[byX.length - 1], ...[...reliable].sort((a, b) => b.rate - a.rate).slice(0, 2)])];
    const mid = (m.l + SW - m.r) / 2;
    labels.selectAll("text").data(picks, s => s.p).join("text")
      .attr("class", "map-label").style("font-weight", 500)
      .attr("text-anchor", s => x(md.get(s)) > mid ? "end" : "start")
      .transition().duration(dur)
      .attr("x", s => x(md.get(s)) + (x(md.get(s)) > mid ? -9 : 9)).attr("y", s => y(s.rate) + 4)
      .text(s => HOOD[s.p]);
  }

  const buttons = d3.select("#sc-mode").selectAll("button").data(MODES).join("button")
    .text(md => md.btn).attr("aria-pressed", md => md === mode)
    .on("click", (ev, md) => { mode = md; buttons.attr("aria-pressed", d => d === mode); render(700); });

  onHighlight(p => {
    dots.attr("r", s => s.p === p ? 8 : 5).attr("stroke", s => s.p === p ? css("--text-primary") : css("--surface-1"));
    dots.filter(s => s.p === p).raise();
  });

  return { render, buttons };
}
