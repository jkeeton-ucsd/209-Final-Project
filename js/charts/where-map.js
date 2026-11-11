// Act 1 — "Where": precincts shaded by complaints in a sliding window (or running total), as share of the city's
// complaints or per resident. Owns the playback controls and drives the timeline + top-10 ranking.
import { K0, K1, HOOD, COMMERCIAL, EVENTS, pname } from "../config.js";
import { css, pct, fmtMonth, fmtShort, kdate } from "../utils.js";
import { showTip, hideTip } from "../ui/tooltip.js";
import { highlight, onHighlight } from "../ui/highlight.js";
import { MW, MH } from "./map-base.js";
import { createTimeline } from "./timeline.js";
import { createRanking } from "./ranking.js";

const fold = f => f === "Offensive Language" ? "Discourtesy" : f;   // filter chips treat these as one category

export function initWhereMap(model, base) {
  const { complaints, precinctIds, POP, hasPop } = model;
  const PIDS = [...precinctIds];
  const state = {
    cats: new Set(["Abuse of Authority", "Force", "Discourtesy"]),
    cursor: K1, playing: false, metric: "share",
    window: 36,   // months; 0 = running total from Jan 2000
  };

  // ---------- windowing ----------
  const winStart = k => state.window ? Math.max(K0, k - state.window + 1) : K0;   // clipped to Jan 2000
  const winLabel = k => `${fmtShort(kdate(winStart(k)))} – ${fmtShort(kdate(k))}`;

  const METRICS = {
    share: {
      btn: "Share of complaints",
      val: (n, p, total, months) => total ? n / total : 0,
      fmt: v => pct(v, 1),
      legend: "Share of the city's complaints in the window",
      sub: k => `Share of complaints, ${winLabel(k)}`,
      tip: (d, k) => `${pct(d.val, 1)} of the city's complaints, ${winLabel(k)}`,
    },
    percap: {
      btn: "Per resident",
      // annualized over the window so windows of any length (and partial windows early on) share one scale
      val: (n, p, total, months) => hasPop(p) ? n / POP.get(p) * 10000 / (months / 12) : null,
      fmt: v => v.toFixed(1),
      legend: "Complaints per 10,000 residents per year",
      sub: k => `Complaints per 10,000 residents per year, ${winLabel(k)}`,
      tip: (d, k) => `${d.val.toFixed(1)} complaints per 10,000 residents per year<br><span class="muted">${(POP.get(d.p) / 1000).toFixed(0)}k residents</span>`,
    },
  };
  const M = () => METRICS[state.metric];

  let byMonth = new Map(), cum = [], cumTotal = [];
  const vmax = { share: 0.05, percap: 1 };

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
  }

  /** Complaints per precinct inside the window ending at k (difference of two cumulative snapshots). */
  function at(k) {
    const s = winStart(k), end = cum[k - K0], before = s > K0 ? cum[s - 1 - K0] : null;
    const counts = before ? new Map([...end].map(([p, n]) => [p, n - before.get(p)])) : end;
    return { counts, total: cumTotal[k - K0] - (before ? cumTotal[s - 1 - K0] : 0), months: k - s + 1 };
  }

  // Fixed color/bar scale per metric for the whole animation (for the current window): the largest value any
  // precinct reaches once a full year of data exists. The first few months are noisy and get clamped.
  function computeVmax() {
    for (const key of Object.keys(METRICS)) {
      let mx = 0;
      for (let k = K0 + 11; k <= K1; k++) {
        const { counts, total, months } = at(k);
        for (const [p, n] of counts) {
          const v = METRICS[key].val(n, p, total, months);
          if (v != null && v > mx) mx = v;
        }
      }
      vmax[key] = mx || 1;
    }
  }

  function ranking(k) {
    const { counts, total, months } = at(k);
    return [...counts].filter(([, n]) => n > 0)
      .map(([p, n]) => ({ p, n, share: total ? n / total : 0, val: M().val(n, p, total, months) }))
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
        ? `${M().tip(r, state.cursor)}<br><span class="muted">${r.n.toLocaleString()} complaints · ranked #${r.rank} of ${ranked.length}</span>` +
          (state.metric === "percap" && COMMERCIAL.has(p) ? `<br><span class="muted">Few residents but many workers and visitors, so this rate is inflated.</span>` : "")
        : state.metric === "percap" && !hasPop(p) ? `<span class="muted">Almost no residents, so no per-resident rate</span>` : `<span class="muted">No complaints yet</span>`));
    })
    .on("mouseleave", () => { highlight(null); hideTip(); });
  const labels = svg.append("g");

  const timeline = createTimeline({
    el: "#timeline", events: EVENTS,
    onScrub: k => { pause(); state.cursor = k; renderFrame(0); },
  });
  const race = createRanking({ el: "#top10", rows: 10, rowH: 40 });

  /** Draw the current month: map colors, labels, event caption, clock, legend, ranking, timeline cursor. */
  function renderFrame(dur = 0) {
    const { total } = at(state.cursor);
    const ranked = ranking(state.cursor);
    const valOf = new Map(ranked.map(d => [d.p, d.val]));
    const fill = d3.scaleSequential(d3.interpolateRgb(css("--share-lo"), css("--share-hi")))
      .domain([0, vmax[state.metric]]).clamp(true);
    precincts.transition("fill").duration(dur).ease(d3.easeLinear).attr("fill", f => {
      const p = +f.properties.precinct;
      if (state.metric === "percap" && !hasPop(p)) return css("--nodata");
      return fill(valOf.get(p) || 0);
    });

    // label the current leaders (top 5 prominent, the rest smaller), as many as fit
    base.placeLabels(labels, ranked.slice(0, 16).map((d, i) => ({ p: d.p, text: HOOD[d.p], minor: i >= 5 })), 14);

    // story beats: caption + outline the precinct involved while the cursor is inside the event window
    const ev = EVENTS.find(e => state.cursor >= e.k && state.cursor < e.k + e.span);
    d3.select("#clock-event").style("display", ev ? null : "none").html(ev ? `<b>${ev.when}.</b> ${ev.text}` : "");
    precincts.classed("event", f => !!(ev && ev.p === +f.properties.precinct));
    timeline.setActiveEvent(ev);

    d3.select("#clock-month").text(fmtMonth(kdate(state.cursor)));
    d3.select("#clock-count").text(`${total.toLocaleString()} complaints, ${winLabel(state.cursor)}`);
    d3.select("#legend1").html(
      `<span>${M().legend}: 0<span class="ramp" style="background:linear-gradient(to right,var(--share-lo),var(--share-hi))"></span>${M().fmt(vmax[state.metric])}+</span>` +
      (state.metric === "percap" ? `<span><span class="sw" style="background:var(--nodata);border:1px solid var(--border)"></span>Almost no residents (Central Park)</span>` : "")
    );

    const top = race.render({
      ranked, dur, cursor: state.cursor, trackMoves: state.playing,
      valueHtml: d => `${M().fmt(d.val)}${state.metric === "percap" && COMMERCIAL.has(d.p) ? "*" : ""}<small>${d.n.toLocaleString()}</small>`,
      barFrac: d => d.val / vmax[state.metric],
    });
    renderRankingText(top, total);
    timeline.move(state.cursor, winStart(state.cursor));
  }

  function renderRankingText(top, total) {
    const topShare = total ? d3.sum(top, d => d.n) / total : 0;
    d3.select("#top10-sub").text(`${M().sub(state.cursor)} · hover to find on map`);
    d3.select("#race-title").text(state.window === 12 ? "Top 10 precincts, past year"
      : state.window ? `Top 10 precincts, past ${state.window / 12} years` : "Top 10 precincts, running total since 2000");
    d3.select("#top10-note").html(state.metric === "share"
      ? `In this window, these 10 precincts account for <b style="color:var(--text-primary)">${pct(topShare)}</b> of all complaints. An even split would give them 13%.`
      : `Ranked by complaints per resident, so a precinct can't rank high just by being big. These 10 still account for <b style="color:var(--text-primary)">${pct(topShare)}</b> of the window's complaints.` +
        (top.some(d => COMMERCIAL.has(d.p)) ? ` <span style="color:var(--text-muted)">* Commercial district: few residents but many workers and visitors, so its rate is inflated.</span>` : ""));
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
      refilter(); timeline.setData(byMonth); renderFrame(250);
    });

  document.getElementById("window").onchange = e => {
    state.window = +e.target.value;
    computeVmax();
    race.reset();   // a window change isn't a rank change; don't show arrows for it
    renderFrame(600);
  };

  // share vs per-resident switch: re-ranks and recolors in place (works while paused or playing)
  const metricBtns = d3.select("#metric").selectAll("button").data(Object.entries(METRICS)).join("button")
    .text(([, m]) => m.btn).attr("aria-pressed", ([k]) => k === state.metric)
    .on("click", (ev, [k]) => {
      state.metric = k;
      metricBtns.attr("aria-pressed", ([key]) => key === state.metric);
      race.reset();   // a metric switch isn't a rank change either
      renderFrame(600);
    });

  onHighlight(p => {
    precincts.classed("hl", f => +f.properties.precinct === p);
    precincts.filter(f => +f.properties.precinct === p).raise();
    race.highlight(p);
  });

  refilter();

  // Exposed for main.js (full redraw, e.g. on theme change) and for tests/console poking.
  return {
    render(dur = 0) { timeline.setData(byMonth); renderFrame(dur); },
    state, play, pause, renderFrame, metricBtns,
  };
}
