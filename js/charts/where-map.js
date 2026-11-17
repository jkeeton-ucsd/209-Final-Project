// Act 1 — "Where": precincts shaded by complaints per resident in a sliding window (or running total).
// Owns the playback controls and drives the timeline + per-precinct trend lines.
import { K0, K1, HOOD, COMMERCIAL, EVENTS, pname } from "../config.js";
import { css, fmtMonth, fmtShort, kdate } from "../utils.js";
import { showTip, hideTip } from "../ui/tooltip.js";
import { highlight, onHighlight } from "../ui/highlight.js";
import { MW, MH } from "./map-base.js";
import { createTimeline } from "./timeline.js";
import { createTrendLines, TREND_W, TREND_M } from "./trend-lines.js";
import { onHome } from "../ui/home.js";

const fold = f => f === "Offensive Language" ? "Discourtesy" : f;   // filter chips treat these as one category

export function initWhereMap(model, base) {
  const { complaints, precinctIds, POP, hasPop, cityPer10k } = model;
  const PIDS = [...precinctIds];
  const state = {
    cats: new Set(["Abuse of Authority", "Force", "Discourtesy"]),
    cursor: K1, playing: false,
    window: 60,   // months; 0 = running total from Jan 2000
  };

  // ---------- windowing ----------
  const winStart = k => state.window ? Math.max(K0, k - state.window + 1) : K0;   // clipped to Jan 2000
  const winLabel = k => `${fmtShort(kdate(winStart(k)))} – ${fmtShort(kdate(k))}`;

  // Complaints per 10,000 residents, annualized over the window so windows of any length
  // (and partial windows early on) share one scale.
  const M = {
    val: (n, p, months) => hasPop(p) ? n / POP.get(p) * 10000 / (months / 12) : null,
    fmt: v => v.toFixed(1),
    legend: "Complaints per 10,000 residents per year",
    sub: k => `Complaints per 10,000 residents per year, ${winLabel(k)}`,
    tip: d => `${d.val.toFixed(1)} complaints per 10,000 residents per year<br><span class="muted">${(POP.get(d.p) / 1000).toFixed(0)}k residents</span>`,
  };

  let byMonth = new Map(), cum = [], cumTotal = [];
  let vmax = 1;

  /** Rebuild cumulative counts for the selected allegation types. */
  function refilter() {
    const fc = complaints.filter(c => [...c.fados].some(f => state.cats.has(fold(f))));
    byMonth = d3.group(fc, c => c.mk);
    cum = []; cumTotal = [];
    const run = new Map(PIDS.map(p => [p, 0]));
    let tot = 0;
    for (let k = K0; k <= K1; k++) {
      for (const c of byMonth.get(k) || []) { run.set(c.precinct, run.get(c.precinct) + 1); tot++; }
      cum.push(new Map(run)); cumTotal.push(tot);
    }
    computeVmax();
    buildSeries();
  }

  /** Complaints per precinct inside the window ending at k (difference of two cumulative snapshots). */
  function at(k) {
    const s = winStart(k), end = cum[k - K0], before = s > K0 ? cum[s - 1 - K0] : null;
    const counts = before ? new Map([...end].map(([p, n]) => [p, n - before.get(p)])) : end;
    return { counts, total: cumTotal[k - K0] - (before ? cumTotal[s - 1 - K0] : 0), months: k - s + 1 };
  }

  // Fixed color/bar scale for the whole animation (for the current window): the largest value any
  // precinct reaches once a full year of data exists. The first few months are noisy and get clamped.
  function computeVmax() {
    let mx = 0;
    for (let k = K0 + 11; k <= K1; k++) {
      const { counts, months } = at(k);
      for (const [p, n] of counts) {
        const v = M.val(n, p, months);
        if (v != null && v > mx) mx = v;
      }
    }
    vmax = mx || 1;
  }

  /** Every precinct's rate for every month, for the trend lines. Rebuilt when the filter or window changes. */
  let series = [], cityVals = [];
  // city line: residential precincts, leaving out the commercial districts, the same definition as the 20-year
  // city average quoted in the prose (model.cityPer10k)
  const RES = PIDS.filter(p => hasPop(p) && !COMMERCIAL.has(p)), resPop = d3.sum(RES, p => POP.get(p));
  function buildSeries() {
    series = PIDS.map(p => ({ p, vals: [] }));
    cityVals = [];
    for (let k = K0; k <= K1; k++) {
      const { counts, months } = at(k);
      cityVals.push(k < K0 + 11 ? null : d3.sum(RES, p => counts.get(p) || 0) / resPop * 10000 / (months / 12));
      // skip the first 11 months: rates from under a year of data are too noisy to plot
      for (const s of series) s.vals.push(k < K0 + 11 ? null : M.val(counts.get(s.p) || 0, s.p, months));
    }
  }

  function ranking(k) {
    const { counts, months } = at(k);
    return [...counts].filter(([, n]) => n > 0)
      .map(([p, n]) => ({ p, n, val: M.val(n, p, months) }))
      .filter(d => d.val != null)
      .sort((a, b) => b.val - a.val || a.p - b.p)
      .map((d, i) => ({ ...d, rank: i + 1 }));
  }

  // ---------- map ----------
  const svg = d3.select("#map1").attr("viewBox", `0 0 ${MW} ${MH}`);
  const precincts = svg.append("g").selectAll("path").data(base.features).join("path")
    .attr("class", "precinct").attr("d", base.path)
    .on("mousemove", (ev, f) => {
      const p = +f.properties.precinct; highlight(p);
      const ranked = ranking(state.cursor), r = ranked.find(d => d.p === p);
      showTip(ev, `<b>${pname(p)}</b><br>` + (r
        ? `${M.tip(r)}<br><span class="muted">${r.n.toLocaleString()} complaints · ranked #${r.rank} of ${ranked.length}</span>` +
          (COMMERCIAL.has(p) ? `<br><span class="muted">Few residents but many workers and visitors, so this rate is inflated.</span>` : "") +
          `<br><span class="muted">Click to ${trend.opts.pins.has(p) ? "unpin it from" : "pin it in"} the trend chart</span>`
        : !hasPop(p) ? `<span class="muted">Almost no residents, so no per-resident rate</span>` : `<span class="muted">No complaints yet</span>`));
    })
    .on("click", (ev, f) => { const p = +f.properties.precinct; if (hasPop(p) && p !== trend.opts.home) trend.togglePin(p); })
    .on("mouseleave", () => { highlight(null); hideTip(); });
  const labels = svg.append("g");

  const scrub = k => { pause(); state.cursor = k; renderFrame(0); };
  const timeline = createTimeline({ el: "#timeline", events: EVENTS, onScrub: scrub, width: TREND_W, margin: TREND_M });
  const trend = createTrendLines({
    el: "#trend", tipNote: winLabel, onScrub: scrub,
    onPinsChange: pins => precincts.classed("pinned", f => pins.has(+f.properties.precinct)),
  });

  /** Draw the current month: map colors, labels, event caption, clock, legend, trend lines, timeline cursor. */
  function renderFrame(dur = 0) {
    const { total } = at(state.cursor);
    const ranked = ranking(state.cursor);
    const valOf = new Map(ranked.map(d => [d.p, d.val]));
    const fill = d3.scaleSequential(d3.interpolateRgb(css("--share-lo"), css("--share-hi")))
      .domain([0, vmax]).clamp(true);
    precincts.transition("fill").duration(dur).ease(d3.easeLinear).attr("fill", f => {
      const p = +f.properties.precinct;
      if (!hasPop(p)) return css("--nodata");
      return fill(valOf.get(p) || 0);
    });

    // label the 10 highest residential neighborhoods in this window (top 5 prominent), matching the "10 neighborhoods"
    // in the prose; commercial districts are left out there too, since their per-resident rates are inflated.
    // Only these 10 are offered, so a label hidden by a collision is never replaced by the 11th-ranked precinct.
    const leaders = ranked.filter(d => !COMMERCIAL.has(d.p)).slice(0, 10);
    base.placeLabels(labels, leaders.map((d, i) => ({ p: d.p, text: HOOD[d.p], minor: i >= 5 })));

    // story beats: caption + outline the precinct involved while the cursor is inside the event window
    const ev = EVENTS.find(e => state.cursor >= e.k && state.cursor < e.k + e.span);
    d3.select("#clock-event").style("display", ev ? null : "none").html(ev ? `<b>${ev.when}.</b> ${ev.text}` : "");
    precincts.classed("event", f => !!(ev && ev.p === +f.properties.precinct));
    timeline.setActiveEvent(ev);

    d3.select("#clock-month").text(fmtMonth(kdate(state.cursor)));
    d3.select("#clock-count").text(`${total.toLocaleString()} complaints, ${winLabel(state.cursor)}`);
    d3.select("#legend1").html(
      `<span>${M.legend}: 0<span class="ramp" style="background:linear-gradient(to right,var(--share-lo),var(--share-hi))"></span>${M.fmt(vmax)}+</span>` +
      `<span><span class="sw" style="background:var(--nodata);border:1px solid var(--border)"></span>Almost no residents (Central Park)</span>` +
      `<span>Labeled: the 10 highest neighborhoods in this window, not counting Midtown and Lower Manhattan, where few people live</span>`
    );

    trend.render({ cursor: state.cursor, dur });
    d3.select("#trend-sub").text(state.window
      ? `Complaints per 10,000 residents per year, over the ${state.window / 12} years before each month · 2000–2019 city average: ${cityPer10k.toFixed(1)}`
      : `Complaints per 10,000 residents per year, running total since 2000 · 2000–2019 city average: ${cityPer10k.toFixed(1)}`);
    timeline.move(state.cursor, winStart(state.cursor));
  }

  // ---------- controls ----------
  let timer = null;
  const playBtn = document.getElementById("play");
  const speed = () => +document.getElementById("speed").value;
  function play() {
    if (state.cursor >= K1) { state.cursor = K0; renderFrame(0); }   // replay from the start
    state.playing = true; playBtn.textContent = "Pause"; clearInterval(timer);
    timer = setInterval(() => {
      if (state.cursor >= K1) { pause(); return; }                   // stop on the final month
      state.cursor++; renderFrame(speed());
    }, speed());
  }
  function pause() {
    state.playing = false;
    playBtn.textContent = state.cursor >= K1 ? "Replay" : "Play";
    clearInterval(timer);
  }
  playBtn.onclick = () => state.playing ? pause() : play();
  document.getElementById("speed").onchange = () => state.playing && play();

  const chipDefs = [["Abuse of Authority", "Abuse of authority"], ["Force", "Force"], ["Discourtesy", "Discourtesy / offensive language"]];
  const chips = d3.select("#chips").selectAll("button").data(chipDefs).join("button")
    .attr("class", "chip").attr("aria-pressed", "true").text(d => d[1])
    .on("click", (ev, [k]) => {
      if (state.cats.has(k)) { if (state.cats.size > 1) state.cats.delete(k); } else state.cats.add(k);
      chips.attr("aria-pressed", d => state.cats.has(d[0]));
      refilter(); timeline.setData(byMonth); trend.setData(series, cityVals); renderFrame(250);
    });

  document.getElementById("window").onchange = e => {
    state.window = +e.target.value;
    computeVmax(); buildSeries();
    trend.setData(series, cityVals);
    renderFrame(0);
  };

  onHighlight(p => {
    precincts.classed("hl", f => +f.properties.precinct === p);
    precincts.filter(f => +f.properties.precinct === p).raise();
    trend.highlight(p);
  });

  refilter();

  onHome(p => {
    trend.setHome(p);
    precincts.classed("home", f => +f.properties.precinct === p);
    precincts.filter(f => +f.properties.precinct === p).raise();
  });

  // Exposed for main.js (full redraw, e.g. on theme change) and for tests/console poking.
  return {
    render(dur = 0) { timeline.setData(byMonth); trend.setData(series, cityVals); renderFrame(dur); },
    state, play, pause, renderFrame,
  };
}
