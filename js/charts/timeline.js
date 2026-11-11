// Act 1 timeline: complaints received per month, the current window shaded, event markers, and a draggable cursor.
import { START, END, K0, K1 } from "../config.js";
import { css, fmtMonth, mkey, kdate } from "../utils.js";
import { showTip, hideTip } from "../ui/tooltip.js";

/**
 * @param {string} el      SVG selector
 * @param {Array}  events  EVENTS from config
 * @param {(k:number)=>void} onScrub  called with a month key when the user clicks/drags
 */
export function createTimeline({ el, events, onScrub }) {
  const TW = 760, TH = 132, tm = { t: 30, r: 8, b: 22, l: 34 };
  const svg = d3.select(el).attr("viewBox", `0 0 ${TW} ${TH}`);
  const x = d3.scaleTime().domain([START, END]).range([tm.l, TW - tm.r]);
  const y = d3.scaleLinear().range([TH - tm.b, tm.t]);

  const grid = svg.append("g").attr("class", "gridlines").attr("transform", `translate(${tm.l},0)`);
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${TH - tm.b})`)
    .call(d3.axisBottom(x).ticks(d3.timeYear.every(2)).tickSizeOuter(0));
  const yAxis = svg.append("g").attr("class", "axis").attr("transform", `translate(${tm.l},0)`);
  const clip = svg.append("clipPath").attr("id", "tl-clip").append("rect").attr("x", tm.l).attr("y", 0).attr("height", TH);
  const area = svg.append("path").attr("clip-path", "url(#tl-clip)").attr("fill-opacity", 0.18);
  const line = svg.append("path").attr("fill", "none").attr("stroke-width", 2);

  // event markers: a thin rule from the label down to the axis; labels alternate heights so neighbors don't collide
  const eventSel = svg.append("g").selectAll("g").data(events).join("g")
    .attr("class", "tl-event").attr("transform", e => `translate(${x(e.date)},0)`);
  eventSel.append("line").attr("y1", (e, i) => i % 2 ? 18 : 8).attr("y2", TH - tm.b);
  eventSel.append("text").attr("y", (e, i) => i % 2 ? 16 : 6).attr("text-anchor", "middle").text(e => e.short);

  const cursorLine = svg.append("line").attr("y1", tm.t).attr("y2", TH - tm.b).attr("stroke-width", 1.5);
  const cursorDot = svg.append("circle").attr("r", 4).attr("stroke-width", 2);
  const hit = svg.append("rect").attr("x", tm.l).attr("width", TW - tm.l - tm.r).attr("height", TH)
    .attr("fill", "transparent").style("cursor", "ew-resize");

  let series = [], cursor = null, winStart = null;

  /** Redraw the monthly line from complaints grouped by month key. */
  function setData(byMonth) {
    series = d3.range(K0, K1 + 1).map(k => ({ k, date: kdate(k), n: (byMonth.get(k) || []).length }));
    y.domain([0, d3.max(series, d => d.n) || 1]).nice();
    yAxis.call(d3.axisLeft(y).ticks(3).tickSizeOuter(0));
    grid.call(d3.axisLeft(y).ticks(3).tickSize(-(TW - tm.l - tm.r)).tickFormat(""));
    line.attr("stroke", css("--pulse")).attr("d", d3.line().x(d => x(d.date)).y(d => y(d.n))(series));
    area.attr("fill", css("--pulse")).attr("d", d3.area().x(d => x(d.date)).y0(y(0)).y1(d => y(d.n))(series));
    place();
  }

  /** Move the cursor to month k and shade the window starting at month `start`. */
  function move(k, start) { cursor = k; winStart = start; place(); }

  function place() {
    const d = series.find(s => s.k === cursor);
    if (!d) return;
    const x0 = x(kdate(winStart));
    clip.attr("x", x0).attr("width", Math.max(2, x(d.date) - x0));
    cursorLine.attr("x1", x(d.date)).attr("x2", x(d.date)).attr("stroke", css("--text-primary"));
    cursorDot.attr("cx", x(d.date)).attr("cy", y(d.n)).attr("fill", css("--text-primary")).attr("stroke", css("--surface-1"));
  }

  /** Emphasize the event whose window contains the cursor (or none). */
  const setActiveEvent = ev => eventSel.classed("active", e => e === ev);

  const monthAt = ev => {
    const [mx] = d3.pointer(ev, svg.node());
    return Math.max(K0, Math.min(K1, mkey(d3.timeMonth.round(x.invert(mx)))));
  };
  hit.on("mousemove", ev => {
      const d = series.find(s => s.k === monthAt(ev));
      if (d) showTip(ev, `<b>${fmtMonth(d.date)}</b><br>${d.n} complaints received`);
    })
    .on("mouseleave", hideTip)
    .on("click", ev => onScrub(monthAt(ev)))
    .call(d3.drag().on("start drag", ev => onScrub(monthAt(ev.sourceEvent))));

  return { setData, move, setActiveEvent };
}
