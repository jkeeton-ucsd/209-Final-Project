// Act 2 — rank flip: the bridge between the two maps. Each residential precinct with enough allegations is a line
// from its rank on complaints per resident (left, Act 1's measure) to its rank on share of allegations upheld
// (right, Act 2's measure). If the two measures moved together the lines would run flat; instead the 10 busiest
// mostly slide down and the 10 quietest mostly climb, forming an X. Hidden until the Act 2 guess is made, then
// drawn in once it scrolls into view.
import { HOOD, pname } from "../config.js";
import { pct } from "../utils.js";
import { showTip, hideTip } from "../ui/tooltip.js";
import { highlight, onHighlight } from "../ui/highlight.js";
import { onHome } from "../ui/home.js";

const STILL = matchMedia("(prefers-reduced-motion: reduce)").matches;

export function initRankFlip(model) {
  const { perRated, perTop, perBottom, cityRate, rhoPer } = model;
  const N = perRated.length;
  const byRate = [...perRated].sort((a, b) => b.rate - a.rate);
  const rL = new Map(perRated.map((s, i) => [s.p, i])), rR = new Map(byRate.map((s, i) => [s.p, i]));
  const top = new Set(perTop.map(s => s.p)), bot = new Set(perBottom.map(s => s.p));
  const group = p => top.has(p) ? "top" : bot.has(p) ? "bot" : "mid";
  const order = { mid: 0, bot: 1, top: 2 };   // draw order: background lines first
  const busyBelow = perTop.filter(s => s.rate < cityRate).length;
  const quietBelow = perBottom.filter(s => s.rate < cityRate).length;

  const W = 760, H = 560, m = { t: 56, b: 14 }, xL = 250, xR = 500;
  const y = d3.scaleLinear().domain([0, N - 1]).range([m.t, H - m.b]);
  const nAbove = byRate.filter(s => s.rate >= cityRate).length;
  const yAvg = (y(nAbove - 1) + y(nAbove)) / 2;

  const svg = d3.select("#flip").attr("viewBox", `0 0 ${W} ${H}`);

  // below-average zone on the right axis, matching the red end of the map's scale
  svg.append("rect").attr("class", "flip-below").attr("x", xR).attr("y", yAvg).attr("width", W - xR).attr("height", H - m.b - yAvg + 6);
  svg.append("line").attr("class", "flip-avg").attr("x1", xR - 30).attr("x2", W).attr("y1", yAvg).attr("y2", yAvg);
  svg.append("text").attr("class", "anno").attr("x", W - 4).attr("y", yAvg - 6).attr("text-anchor", "end")
    .text(`↑ Above city average (${pct(cityRate, 1)})`);
  svg.append("text").attr("class", "anno flip-below-label").attr("x", W - 4).attr("y", yAvg + 16).attr("text-anchor", "end")
    .text("↓ Below city average");

  // column headers
  const head = (x, anchor, l1, l2) => {
    const t = svg.append("text").attr("class", "flip-head").attr("x", x).attr("y", 16).attr("text-anchor", anchor);
    t.append("tspan").attr("x", x).text(l1);
    t.append("tspan").attr("x", x).attr("dy", 15).attr("class", "flip-head-sub").text(l2);
  };
  head(xL, "end", "Complaints per resident", "most at top");
  head(xR, "start", "Share of allegations upheld", "highest at top");

  // brackets naming the two groups on the left
  const bracket = (i0, i1, label, cls) => {
    const g = svg.append("g").attr("class", `flip-bracket ${cls}`);
    const x = xL - 16, y0 = y(i0) - 3, y1 = y(i1) + 3;
    g.append("path").attr("d", `M${x + 5},${y0}H${x}V${y1}H${x + 5}`);
    const t = g.append("text").attr("x", x - 8).attr("y", (y0 + y1) / 2 - 4).attr("text-anchor", "end");
    label.forEach((l, k) => t.append("tspan").attr("x", x - 8).attr("dy", k ? 15 : 0).text(l));
  };
  bracket(0, 9, ["10 most complaints", "per resident"], "top");
  bracket(N - 10, N - 1, ["10 fewest complaints", "per resident"], "bot");

  // result counts, written into the below-average zone once the lines land
  const counts = svg.append("g").attr("class", "flip-counts").attr("opacity", 0);
  const cy = Math.min(H - 60, yAvg + 48);
  counts.append("text").attr("x", W - 4).attr("y", cy).attr("text-anchor", "end").attr("class", "flip-count top")
    .text(`${busyBelow} of the 10 most-complained ●`);
  counts.append("text").attr("x", W - 4).attr("y", cy + 20).attr("text-anchor", "end").attr("class", "flip-count bot")
    .text(`${quietBelow} of the 10 least-complained ○`);

  // one line per precinct; background lines first so the two groups sit on top
  const data = [...perRated].sort((a, b) => order[group(a.p)] - order[group(b.p)]);
  const rows = svg.append("g").selectAll("g").data(data, d => d.p).join("g")
    .attr("class", d => `flip-row ${group(d.p)}`);
  rows.append("line").attr("class", "flip-line")
    .attr("x1", xL).attr("y1", d => y(rL.get(d.p))).attr("x2", xR).attr("y2", d => y(rR.get(d.p)));
  rows.append("circle").attr("class", "flip-dot l").attr("r", d => group(d.p) === "mid" ? 2 : 4).attr("cx", xL).attr("cy", d => y(rL.get(d.p)));
  rows.append("circle").attr("class", "flip-dot r").attr("r", d => group(d.p) === "mid" ? 2 : 4).attr("cx", xR).attr("cy", d => y(rR.get(d.p)));
  // name labels: shown for the hovered and home precincts only
  rows.append("text").attr("class", "flip-name l").attr("x", xL - 8).attr("y", d => y(rL.get(d.p)) + 4)
    .attr("text-anchor", "end").text(d => `${HOOD[d.p]} · ${d.per10k.toFixed(1)}`);
  rows.append("text").attr("class", "flip-name r").attr("x", xR + 8).attr("y", d => y(rR.get(d.p)) + 4)
    .text(d => `${pct(d.rate, 1)} upheld`);
  // wide invisible hit target along each line
  rows.append("line").attr("class", "flip-hit")
    .attr("x1", xL).attr("y1", d => y(rL.get(d.p))).attr("x2", xR).attr("y2", d => y(rR.get(d.p)))
    .on("mousemove", (ev, d) => {
      highlight(d.p);
      showTip(ev, `<b>${pname(d.p)}</b><br>#${rL.get(d.p) + 1} of ${N} for complaints per resident <span class="muted">(${d.per10k.toFixed(1)} per 10k a year)</span>` +
        `<br>#${rR.get(d.p) + 1} of ${N} for share upheld <span class="muted">(${pct(d.rate, 1)})</span>`);
    })
    .on("mouseleave", () => { highlight(null); hideTip(); });

  const raiseMarked = () => rows.filter(function () { return this.classList.contains("hl") || this.classList.contains("home"); }).raise();
  onHighlight(p => {
    rows.classed("hl", d => d.p === p);
    svg.classed("focus", p != null && rL.has(p));
    raiseMarked();
  });
  onHome(p => { rows.classed("home", d => d.p === p); raiseMarked(); });

  d3.select("#flip-note").html(`Rank correlation: <b>${rhoPer.toFixed(2)}</b>. A moderate pattern, not a rule: ` +
    `some busy neighborhoods stay above average, but more complaints per resident tends to go with a smaller share upheld.`);

  // ---------- the draw-in ----------
  function draw() {
    const d = STILL ? 0 : 1;
    rows.selectAll(".flip-dot.r, .flip-name").interrupt();
    counts.interrupt().attr("opacity", 0);
    rows.select(".flip-dot.r").attr("opacity", 0);
    rows.select(".flip-line").each(function (r) {
      const len = this.getTotalLength();
      const g = group(r.p);
      // background lines sketch in quickly; then the quietest climb, then the busiest fall
      const at = (g === "mid" ? 0 : g === "bot" ? 900 : 1900) + (g === "mid" ? rL.get(r.p) * 8 : (rL.get(r.p) % 10) * 70);
      d3.select(this).interrupt().attr("stroke-dasharray", `${len} ${len}`).attr("stroke-dashoffset", len)
        .transition().delay(at * d).duration((g === "mid" ? 500 : 800) * d).ease(d3.easeCubicInOut)
        .attr("stroke-dashoffset", 0)
        .on("end", function () { d3.select(this).attr("stroke-dasharray", null); });
      d3.select(this.parentNode).select(".flip-dot.r").transition().delay((at + (g === "mid" ? 500 : 800)) * d).duration(200 * d).attr("opacity", 1);
    });
    counts.transition().delay(3400 * d).duration(500 * d).attr("opacity", 1);
  }

  let io = null;
  return {
    render() {},   // colors come from CSS classes, so a theme flip needs no redraw
    /** Show the figure after the Act 2 guess; draw the lines in as soon as it is on screen. */
    reveal() {
      const fig = document.getElementById("flip-fig");
      fig.style.display = null;
      if (io) io.disconnect();
      io = new IntersectionObserver(es => {
        if (es.some(e => e.isIntersecting)) { io.disconnect(); io = null; draw(); }
      }, { threshold: 0.35 });
      io.observe(fig);
    },
    draw,
  };
}
