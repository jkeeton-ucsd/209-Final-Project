// Act 2 — map of outcomes by precinct, built as the bridge from Act 1.
// It opens on Act 1's measure (complaints per resident, same teal ramp) and asks the reader to guess which
// precinct had its complaints upheld most often. The reveal then plays in three steps:
//   1. outline the 10 neighborhoods with the most complaints per resident (everything else dims),
//   2. recolor the same map by substantiation rate, rippling out from the reader's pick, outlines kept,
//   3. count how many outlined precincts landed below the city average, drop the outlines, unlock the panel.
// The steps autoplay; arrows on the caption let the reader step back and forth at their own pace.
// After that the reader can flip between the two measures or replay the sequence.
import { HOOD, COMMERCIAL, MIN_N, pname } from "../config.js";
import { css, pct, usd } from "../utils.js";
import { showTip, hideTip } from "../ui/tooltip.js";
import { highlight, onHighlight } from "../ui/highlight.js";
import { onHome, getHome } from "../ui/home.js";
import { MW, MH } from "./map-base.js";

const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
const name = p => HOOD[p] || `Precinct ${p}`;
const STILL = matchMedia("(prefers-reduced-motion: reduce)").matches;

export function initRateMap(model, base, side) {
  const { stats, reliable, byVol, cityRate, hasPop, rated, rateRank, perRated, perTop, perBottom } = model;
  const rateable = p => (stats.get(p)?.n || 0) >= MIN_N;

  // the two groups the story follows from Act 1 into Act 2
  const busy = new Set(perTop.map(s => s.p));
  const busyBelow = perTop.filter(s => s.rate < cityRate).length;
  const quietBelow = perBottom.filter(s => s.rate < cityRate).length;
  const perIdx = new Map(perRated.map((s, i) => [s.p, i]));

  // ---------- scales / modes ----------
  const ext = d3.extent(reliable, s => s.rate);
  const span = Math.max(cityRate - ext[0], ext[1] - cityRate);   // symmetric around the city average

  const resPrecincts = [...stats.values()].filter(s => hasPop(s.p) && s.per10k != null);
  const volMax = d3.max(resPrecincts.filter(s => !COMMERCIAL.has(s.p)), s => s.per10k);   // commercial ones clamp
  const MODES = {
    vol: { btn: "Complaints per resident", title: "Complaints per resident, by precinct",
      sub: "Complaints per 10,000 residents per year, 2000–2019 · the measure from the first map" },
    rate: { btn: "Substantiation rate", title: "Substantiation rate vs. city average, by precinct",
      sub: "Share of allegations substantiated, 2000–2019 · hover or click a precinct" },
  };
  let mode = "vol";
  let revealed = false, guess = null, outlined = false;

  // ---------- tooltips ----------
  const perLine = s => s && hasPop(s.p) && s.per10k != null
    ? `${s.per10k.toFixed(1)} complaints per 10,000 residents a year` +
      (perIdx.has(s.p) ? ` <span class="muted">(#${perIdx.get(s.p) + 1} of ${perRated.length})</span>` : "")
    : `<span class="muted">Almost no residents, so no per-resident rate</span>`;
  const guessTip = (p, s) => rateable(p)
    ? `<b>${pname(p)}</b><br>${perLine(s)}<br><span class="muted">Click to guess this precinct</span>`
    : `<b>${pname(p)}</b><br><span class="muted">Too few allegations to rate (${s ? s.n : 0})</span>`;
  const volTip = (p, s) => `<b>${pname(p)}</b><br>${perLine(s)}` +
    (s && s.n >= MIN_N ? `<br>${pct(s.rate, 1)} of allegations upheld <span class="muted">(city ${pct(cityRate, 1)})</span>` : "") +
    (COMMERCIAL.has(p) ? `<br><span class="muted">Few residents but many workers and visitors, so this rate is inflated.</span>` : "");
  const rateTip = (p, s) => s && s.n >= MIN_N
    ? `<b>${pname(p)}</b><br>${pct(s.rate, 1)} substantiated <span class="muted">(city ${pct(cityRate, 1)})</span><br><span class="muted">${s.n.toLocaleString()} allegations${s.income ? ` · median income ${usd(s.income)}` : ""}</span>` +
      (busy.has(p) ? `<br><span class="muted">One of the 10 neighborhoods with the most complaints per resident</span>` : "")
    : `<b>${pname(p)}</b><br><span class="muted">Too few allegations to rate (${s ? s.n : 0})</span>`;
  const TIPS = { vol: volTip, rate: rateTip };

  // ---------- map ----------
  const svg = d3.select("#map2").attr("viewBox", `0 0 ${MW} ${MH}`);
  const precincts = svg.append("g").selectAll("path").data(base.features).join("path")
    .attr("class", "precinct").attr("d", base.path)
    .on("mousemove", (ev, f) => {
      const p = +f.properties.precinct, s = stats.get(p);
      highlight(p);
      if (!revealed) { showTip(ev, guessTip(p, s)); return; }
      side.show(p);
      showTip(ev, TIPS[mode](p, s));
    })
    .on("mouseleave", () => { highlight(null); if (revealed) side.restore(); hideTip(); })
    .on("click", (ev, f) => {
      const p = +f.properties.precinct;
      if (!revealed) { if (rateable(p)) reveal(p); return; }
      side.togglePin(p);
    });
  const labels = svg.append("g");
  const pid = f => +f.properties.precinct;
  /** Put the reader's guess first so the label placer gives it priority and keeps other labels clear of it. */
  const withGuess = (items, fmt) => guess == null ? items
    : [{ p: guess, text: `Your guess: ${name(guess)} ${fmt(stats.get(guess))}` }, ...items.filter(d => d.p !== guess)];
  /** Stacking: outlined busiest precincts above the rest, then the guess and home outlines on top. */
  function restack() {
    if (outlined) precincts.filter(f => busy.has(pid(f))).raise();
    precincts.filter(f => pid(f) === guess || pid(f) === getHome()).raise();
  }

  const buttons = d3.select("#m2-mode").selectAll("button").data(Object.entries(MODES)).join("button")
    .text(([, m]) => m.btn).attr("aria-pressed", ([k]) => k === mode)
    .on("click", (ev, [k]) => { cancel(); if (step !== STEPS.length - 1) goTo(STEPS.length - 1); setMode(k, 500); });
  function setMode(k, dur, delay) {
    mode = k;
    buttons.attr("aria-pressed", ([key]) => key === mode);
    render(dur, delay);
  }

  // ---------- the reveal sequence ----------
  // Three steps that autoplay, with back/next arrows so the reader can step through at their own pace.
  // Each step sets its whole map state on entry, so steps work in either direction.
  const HOLD = [5000, 7500];   // ms each step stays up during autoplay before advancing
  const T = ms => STILL ? 0 : ms;
  let timers = [], step = -1, done = false;
  const pending = () => timers.length > 0;
  const later = (ms, fn) => timers.push(setTimeout(fn, ms));
  const cancel = () => { timers.forEach(clearTimeout); timers = []; d3.select("#m2-stage").classed("auto", false); };
  const outline = on => { outlined = on; precincts.classed("busy", f => on && busy.has(pid(f))); restack(); };
  const dim = on => precincts.classed("dim", f => on && !busy.has(pid(f)));
  const doDo = n => n === 1 ? "does" : "do";

  /** Ripple delay: precincts recolor in order of distance from the reader's pick (or the city center). */
  const ripple = p => {
    const [ox, oy] = p != null ? base.centroid.get(p) : [MW / 2, MH / 2];
    return f => { const [cx, cy] = base.centroid.get(pid(f)) || [ox, oy]; return Math.hypot(cx - ox, cy - oy) * 3.2; };
  };

  const STEPS = [
    { text: () => `Outlined: the <b>10 neighborhoods with the most complaints per resident</b>, from the first map.`,
      enter() { outline(true); dim(true); if (mode !== "vol") setMode("vol", T(900)); } },
    { text: () => `Now the same map, colored by the <b>share of allegations upheld</b>. ` +
        `<span class="k-lo">Red</span> means below the city average of ${pct(cityRate, 1)}. Watch the outlines.`,
      enter(fwd) { outline(true); dim(true); setMode("rate", T(1400), fwd && !STILL ? ripple(guess) : 0); } },
    // outlines come off here so the reader can explore the finished map without them
    { text: () => `<b>${busyBelow} of the 10</b> neighborhoods with the most complaints per resident ` +
        `fall below the city average. Of the 10 with the fewest, <b>${quietBelow}</b> ${doDo(quietBelow)}. ` +
        `Hover or click any precinct to explore.`,
      enter() { outline(false); dim(false); setMode("rate", T(900)); unlock(); } },
  ];

  function goTo(i, fwd = false) {
    step = i;
    hideTip();
    STEPS[i].enter(fwd);
    const el = d3.select("#m2-stage").classed("on", true).attr("data-step", i + 1);
    el.select(".stage-count").text(`${i + 1} / ${STEPS.length}`);
    el.select(".stage-text").html(STEPS[i].text());
    el.select(".stage-prev").property("disabled", i === 0);
    el.select(".stage-next").property("disabled", i === STEPS.length - 1);
  }

  /** Autoplay from step 1; arrows or a mode button stop it. */
  function play() {
    cancel();
    goTo(0);
    if (STILL) return;   // reduced motion: no autoplay, the reader steps with the arrows
    const bar = () => d3.select("#m2-stage").classed("auto", false).each(function () { void this.offsetWidth; }).classed("auto", true);
    d3.select("#m2-stage").style("--hold", `${HOLD[0]}ms`); bar();
    later(HOLD[0], () => { goTo(1, true); d3.select("#m2-stage").style("--hold", `${HOLD[1]}ms`); bar(); });
    later(HOLD[0] + HOLD[1], () => { timers = []; cancel(); goTo(2, true); });
  }

  // the stage caption: arrows, step count, text, and a thin bar that runs down while autoplay waits
  {
    const el = d3.select("#m2-stage");
    const nav = el.append("div").attr("class", "stage-nav");
    nav.append("button").attr("class", "stage-prev").attr("aria-label", "Previous step").text("←")
      .on("click", () => { cancel(); if (step > 0) goTo(step - 1); });
    nav.append("span").attr("class", "stage-count");
    nav.append("button").attr("class", "stage-next").attr("aria-label", "Next step").text("→")
      .on("click", () => { cancel(); if (step < STEPS.length - 1) goTo(step + 1, true); });
    el.append("div").attr("class", "stage-timer");
    el.append("p").attr("class", "stage-text").attr("aria-live", "polite");
  }

  /** First arrival at the last step: unlock the side panel and write the result. */
  function unlock() {
    if (done) return;
    done = true;
    d3.select("#side").classed("locked", false);
    d3.select("#m2-replay").style("display", null);
    writeResult(guess);
  }

  function reveal(p) {
    revealed = true; guess = p;
    hideTip();
    d3.select("#guess-prompt").style("display", "none");
    d3.select("#m2-head").style("display", null);
    precincts.classed("muted", false).classed("guess", f => pid(f) === p);
    if (p != null) side.pin(p); else if (getHome() != null) side.pin(getHome());
    labels.selectAll("text").classed("guess-label", d => d.p === guess);
    play();
  }
  d3.select("#guess-skip").on("click", () => reveal(null));
  d3.select("#m2-replay").on("click", play);

  function writeResult(p) {
    const top = rated[0];
    const home = getHome(), hs = home != null ? stats.get(home) : null;
    const lines = [];
    if (p != null) {
      const s = stats.get(p), r = rateRank.get(p);
      lines.push(p === top.p
        ? `<p class="gr-big">You got it.</p><p><b>${name(p)}</b> had the highest substantiation rate in the city: <b>${pct(s.rate)}</b> of its allegations were upheld.</p>`
        : `<p class="gr-big">${pct(s.rate)}</p><p>of allegations in <b>${name(p)}</b> were substantiated, the <b>${ordinal(r)}</b> highest of ${rated.length} precincts. ` +
          `The highest was <b>${name(top.p)}</b>, at <b>${pct(top.rate)}</b>.</p>`);
    } else {
      lines.push(`<p>The highest substantiation rate belonged to <b>${name(top.p)}</b>, at <b>${pct(top.rate)}</b> of allegations upheld.</p>`);
    }
    lines.push(`<p>In many cases, the neighborhoods with the highest substantiation rates are those that complained the least and vice versa.</p>`);
    if (hs && home !== p) lines.push(hs.n >= MIN_N
      ? `<p class="you-line">Your neighborhood, <b class="you">${name(home)}</b>: <b>${pct(hs.rate)}</b> upheld, ${ordinal(rateRank.get(home))} of ${rated.length}.</p>`
      : `<p class="you-line">Your neighborhood, <b class="you">${name(home)}</b>, had too few allegations to rate.</p>`);
    d3.select("#guess-result").style("display", null).html(lines.join(""));
  }

  // ---------- the map in each measure ----------
  const nodataSw = text => `<span><span class="sw" style="background:var(--nodata);border:1px solid var(--border)"></span>${text}</span>`;
  const busySw = () => outlined
    ? `<span><span class="sw outline"></span>10 neighborhoods with the most complaints per resident</span>` : "";

  function renderVolume(dur, delay = 0) {
    const color = d3.scaleSequential(d3.interpolateRgb(css("--share-lo"), css("--share-hi"))).domain([0, volMax]).clamp(true);
    precincts.transition("fill").delay(delay).duration(dur).attr("fill", f => {
      const s = stats.get(pid(f));
      return s && hasPop(s.p) && s.per10k != null ? color(s.per10k) : css("--nodata");
    });
    // label only the 10 the prose and the outlines refer to (no 11th-ranked fill-ins when a label collides)
    const items = perTop.map((s, i) => ({ p: s.p, text: `${HOOD[s.p]} ${s.per10k.toFixed(1)}`, minor: i >= 6 }));
    base.placeLabels(labels, withGuess(items, s => hasPop(s.p) ? s.per10k.toFixed(1) : ""));
    const ramp = `<span>Complaints per 10,000 residents per year: 0<span class="ramp" style="background:linear-gradient(to right,var(--share-lo),var(--share-hi))"></span>${volMax.toFixed(1)}+</span>`;
    d3.select("#legend2").html(revealed
      ? ramp + busySw() + nodataSw("Almost no residents") + `<span>Midtown and Lower Manhattan have few residents, so their rates are inflated</span>`
      : ramp + nodataSw("Almost no residents") + `<span>Faded: too few allegations to guess</span>`);
  }

  function renderRate(dur, delay = 0) {
    const color = d3.scaleDiverging()
      .domain([cityRate - span, cityRate, cityRate + span])
      .interpolator(t => t < 0.5
        ? d3.interpolateRgb(css("--div-lo"), css("--div-mid"))(t * 2)
        : d3.interpolateRgb(css("--div-mid"), css("--div-hi"))((t - 0.5) * 2));
    precincts.transition("fill").delay(delay).duration(dur).attr("fill", f => {
      const s = stats.get(pid(f));
      return s && s.n >= MIN_N ? color(s.rate) : css("--nodata");
    });
    // Label the outlined busiest precincts first (the story follows them from Act 1), then the precincts that
    // stray furthest from the city average, weighted by size so tiny precincts don't dominate.
    const dev = s => Math.abs(s.rate - cityRate) * Math.sqrt(s.n);
    const notable = [...reliable].sort((a, b) => dev(b) - dev(a)).filter(s => !busy.has(s.p));
    const items = [...perTop, ...notable].map((s, i) => ({ p: s.p, text: `${HOOD[s.p]} ${pct(s.rate)}`, minor: i >= 10 }));
    base.placeLabels(labels, withGuess(items, s => pct(s.rate)), 22);
    d3.select("#legend2").html(
      `<span>${pct(cityRate - span)}<span class="ramp" style="background:linear-gradient(to right,var(--div-lo),var(--div-mid),var(--div-hi))"></span>${pct(cityRate + span)}</span>` +
      `<span>Gray = city average, ${pct(cityRate, 1)}</span>` + busySw() + nodataSw(`Fewer than ${MIN_N} allegations`)
    );
  }

  function render(dur = 0, delay = 0) {
    if (!revealed) {
      renderVolume(0);
      precincts.classed("muted", f => !rateable(pid(f)));
      return;
    }
    d3.select("#m2-title").text(MODES[mode].title);
    d3.select("#m2-sub").text(MODES[mode].sub);
    (mode === "rate" ? renderRate : renderVolume)(dur, delay);
    labels.selectAll("text").classed("guess-label", d => d.p === guess);
    restack();
  }

  onHighlight(p => {
    precincts.classed("hl", f => pid(f) === p);
    precincts.filter(f => pid(f) === p).raise();
  });
  onHome(p => {
    precincts.classed("home", f => pid(f) === p);
    restack();
    if (done) { writeResult(guess); if (guess == null) side.pin(p); }
  });

  return { render, buttons, reveal, replay: play };
}
