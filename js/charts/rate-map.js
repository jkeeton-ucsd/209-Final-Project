// Act 2 — map of outcomes by precinct. It opens as a guess: the map is neutral until the reader clicks the
// precinct they think has the highest substantiation rate (or skips), then the real colors ripple out from
// their pick. After the reveal, three views: substantiation rate vs. city average (diverging), and allegations
// upheld / not upheld per resident (sequential, sharing one scale so they compare by eye).
import { HOOD, COMMERCIAL, MIN_N, YEARS, pname } from "../config.js";
import { css, pct, usd } from "../utils.js";
import { showTip, hideTip } from "../ui/tooltip.js";
import { highlight, onHighlight } from "../ui/highlight.js";
import { onHome, getHome } from "../ui/home.js";
import { MW, MH } from "./map-base.js";

const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
const name = p => HOOD[p] || `Precinct ${p}`;

export function initRateMap(model, base, side) {
  const { stats, reliable, byVol, cityRate, hasPop, q, rated, rateRank } = model;
  const rateable = p => (stats.get(p)?.n || 0) >= MIN_N;

  // ---------- scales / modes ----------
  const ext = d3.extent(reliable, s => s.rate);
  const span = Math.max(cityRate - ext[0], ext[1] - cityRate);   // symmetric around the city average

  const resPrecincts = [...stats.values()].filter(s => hasPop(s.p) && s.noPer10k != null);
  const perMax = d3.max(resPrecincts, s => s.noPer10k);           // shared max for both per-resident views
  const resPop = d3.sum(resPrecincts, s => s.pop);
  const MODES = {
    rate: { btn: "Substantiation rate", title: "Substantiation rate vs. city average, by precinct",
      sub: "Share of allegations substantiated, 2000–2019 · hover or click a precinct" },
    up: { btn: "Upheld per resident", get: s => s.upPer10k, hi: "--div-hi", word: "upheld",
      title: "Upheld allegations per resident, by precinct",
      sub: "Substantiated allegations per 10,000 residents per year, 2000–2019 · same scale as “not upheld”",
      city: d3.sum(resPrecincts, s => s.outc.Substantiated) / resPop * 10000 / YEARS },
    no: { btn: "Not upheld per resident", get: s => s.noPer10k, hi: "--div-lo", word: "not upheld",
      title: "Allegations not upheld per resident, by precinct",
      sub: "Allegations exonerated or unsubstantiated per 10,000 residents per year, 2000–2019 · same scale as “upheld”",
      city: d3.sum(resPrecincts, s => s.n - s.outc.Substantiated) / resPop * 10000 / YEARS },
  };
  let mode = "rate";
  let revealed = false, guess = null;

  // ---------- tooltips ----------
  const guessTip = (p, s) => rateable(p)
    ? `<b>${pname(p)}</b><br>${s.complaints.toLocaleString()} complaints filed, 2000–2019<br><span class="muted">Click to guess this precinct</span>`
    : `<b>${pname(p)}</b><br><span class="muted">Too few allegations to rate (${s ? s.n : 0})</span>`;
  const rateTip = (p, s) => s && s.n >= MIN_N
    ? `<b>${pname(p)}</b><br>${pct(s.rate, 1)} substantiated <span class="muted">(city ${pct(cityRate, 1)})</span><br><span class="muted">${s.n.toLocaleString()} allegations${s.income ? ` · median income ${usd(s.income)}` : ""}</span>`
    : `<b>${pname(p)}</b><br><span class="muted">Too few allegations to rate (${s ? s.n : 0})</span>`;
  const perResTip = (p, s) => {
    const m = MODES[mode];
    if (!s || !hasPop(p)) return `<b>${pname(p)}</b><br><span class="muted">Almost no residents, so no per-resident rate</span>`;
    return `<b>${pname(p)}</b><br>${m.get(s).toFixed(1)} ${m.word} allegations per 10,000 residents a year <span class="muted">(city ${m.city.toFixed(1)})</span>` +
      `<br><span class="muted">${(mode === "up" ? s.outc.Substantiated : s.n - s.outc.Substantiated).toLocaleString()} of ${s.n.toLocaleString()} allegations · ${Math.round(s.pop / 1000)}k residents</span>` +
      (COMMERCIAL.has(p) ? `<br><span class="muted">Few residents but many workers and visitors, so this rate is inflated.</span>` : "");
  };

  // ---------- map ----------
  const svg = d3.select("#map2").attr("viewBox", `0 0 ${MW} ${MH}`);
  const precincts = svg.append("g").selectAll("path").data(base.features).join("path")
    .attr("class", "precinct").attr("d", base.path)
    .on("mousemove", (ev, f) => {
      const p = +f.properties.precinct, s = stats.get(p);
      highlight(p);
      if (!revealed) { showTip(ev, guessTip(p, s)); return; }
      side.show(p);
      showTip(ev, mode === "rate" ? rateTip(p, s) : perResTip(p, s));
    })
    .on("mouseleave", () => { highlight(null); if (revealed) side.restore(); hideTip(); })
    .on("click", (ev, f) => {
      const p = +f.properties.precinct;
      if (!revealed) { if (rateable(p)) reveal(p); return; }
      side.togglePin(p);
    });
  const labels = svg.append("g");
  /** Put the reader's guess first so the label placer gives it priority and keeps other labels clear of it. */
  const withGuess = (items, fmt) => guess == null ? items
    : [{ p: guess, text: `Your guess: ${name(guess)} ${fmt(stats.get(guess))}` }, ...items.filter(d => d.p !== guess)];

  const buttons = d3.select("#m2-mode").selectAll("button").data(Object.entries(MODES)).join("button")
    .text(([, m]) => m.btn).attr("aria-pressed", ([k]) => k === mode)
    .on("click", (ev, [k]) => { mode = k; buttons.attr("aria-pressed", ([key]) => key === mode); render(500); });

  // one computed sentence in the prose below the map
  {
    const top = [...resPrecincts].sort((a, b) => b.noPer10k - a.noPer10k)[0], ues = stats.get(19);
    d3.select("#m2-note").html(`In <b>${HOOD[top.p]}</b>, ${top.noPer10k.toFixed(1)} allegations per 10,000 residents a year end without being upheld, ` +
      `${Math.round(top.noPer10k / ues.noPer10k)}× the rate on the Upper East Side (${ues.noPer10k.toFixed(2)}).`);
  }

  // ---------- the guess ----------
  function renderGuess() {
    precincts.attr("fill", f => rateable(+f.properties.precinct) ? css("--guess") : css("--nodata"));
    labels.selectAll("*").remove();
    d3.select("#legend2").html(`<span><span class="sw" style="background:var(--guess)"></span>Click any shaded precinct</span>` +
      `<span><span class="sw" style="background:var(--nodata);border:1px solid var(--border)"></span>Too few allegations to rate</span>`);
  }

  /** Reveal the real map, rippling outward from the reader's pick (or from the city center on a skip). */
  function reveal(p) {
    revealed = true; guess = p;
    hideTip();
    d3.select("#guess-prompt").style("display", "none");
    d3.select("#m2-head").style("display", null);
    d3.select("#side").classed("locked", false);
    const [ox, oy] = p != null ? base.centroid.get(p) : [MW / 2, MH / 2];
    const delay = f => { const [cx, cy] = base.centroid.get(+f.properties.precinct) || [ox, oy]; return Math.hypot(cx - ox, cy - oy) * 2.2; };
    render(900, delay);
    if (p != null) {
      precincts.classed("guess", f => +f.properties.precinct === p);
      side.pin(p);
    } else if (getHome() != null) side.pin(getHome());
    writeResult(p);
  }
  d3.select("#guess-skip").on("click", () => reveal(null));

  function writeResult(p) {
    const top = rated[0];
    const busy = byVol.slice(0, q), below = busy.filter(s => s.rate < cityRate).length;
    const busyHalf = new Set(byVol.slice(0, Math.ceil(byVol.length / 2)).map(s => s.p));
    const home = getHome(), hs = home != null ? stats.get(home) : null;
    const lines = [];
    if (p != null) {
      const s = stats.get(p), r = rateRank.get(p);
      lines.push(p === top.p
        ? `<p class="gr-big">You got it.</p><p><b>${name(p)}</b> had the highest substantiation rate in the city: <b>${pct(s.rate)}</b> of its allegations were upheld.</p>`
        : `<p class="gr-big">${pct(s.rate)}</p><p>of allegations in <b>${name(p)}</b> were substantiated, the <b>${ordinal(r)}</b> highest of ${rated.length} precincts. ` +
          `The highest was <b>${name(top.p)}</b>, at <b>${pct(top.rate)}</b>.</p>`);
      if (busyHalf.has(p) && p !== top.p) lines.push(`<p>If you picked a precinct with lots of complaints, that's a natural instinct: more complaints should mean more misconduct to find. The map says otherwise.</p>`);
    } else {
      lines.push(`<p>The highest substantiation rate belonged to <b>${name(top.p)}</b>, at <b>${pct(top.rate)}</b> of allegations upheld.</p>`);
    }
    lines.push(`<p>Now find the neighborhoods from the first map. Of the ${q} precincts with the most complaints, <b>${below}</b> fall below the city average of ${pct(cityRate)}: the red ones.</p>`);
    if (hs && home !== p) lines.push(hs.n >= MIN_N
      ? `<p class="you-line">Your neighborhood, <b class="you">${name(home)}</b>: <b>${pct(hs.rate)}</b> upheld, ${ordinal(rateRank.get(home))} of ${rated.length}.</p>`
      : `<p class="you-line">Your neighborhood, <b class="you">${name(home)}</b>, had too few allegations to rate.</p>`);
    d3.select("#guess-result").style("display", null).html(lines.join(""));
  }

  // ---------- the real map ----------
  function renderPerResident(dur, delay = 0) {
    const m = MODES[mode];
    const color = d3.scaleSequential(d3.interpolateRgb(css("--div-mid"), css(m.hi))).domain([0, perMax]).clamp(true);
    precincts.transition("fill").delay(delay).duration(dur).attr("fill", f => {
      const s = stats.get(+f.properties.precinct);
      return s && hasPop(s.p) && m.get(s) != null ? color(m.get(s)) : css("--nodata");
    });
    const items = [...resPrecincts].sort((a, b) => m.get(b) - m.get(a))
      .map((s, i) => ({ p: s.p, text: `${HOOD[s.p]} ${m.get(s).toFixed(1)}${COMMERCIAL.has(s.p) ? "*" : ""}`, minor: i >= 6 }));
    base.placeLabels(labels, withGuess(items, s => hasPop(s.p) ? m.get(s).toFixed(1) : ""), 18);
    d3.select("#legend2").html(
      `<span>0<span class="ramp" style="background:linear-gradient(to right,var(--div-mid),var(${m.hi}))"></span>${perMax.toFixed(1)}</span>` +
      `<span>${m.word[0].toUpperCase() + m.word.slice(1)} allegations per 10,000 residents per year · city average ${m.city.toFixed(1)}</span>` +
      `<span><span class="sw" style="background:var(--nodata);border:1px solid var(--border)"></span>Almost no residents</span>` +
      `<span>* Commercial district: few residents, so the rate is inflated</span>`
    );
  }

  function renderRate(dur, delay = 0) {
    const color = d3.scaleDiverging()
      .domain([cityRate - span, cityRate, cityRate + span])
      .interpolator(t => t < 0.5
        ? d3.interpolateRgb(css("--div-lo"), css("--div-mid"))(t * 2)
        : d3.interpolateRgb(css("--div-mid"), css("--div-hi"))((t - 0.5) * 2));
    precincts.transition("fill").delay(delay).duration(dur).attr("fill", f => {
      const s = stats.get(+f.properties.precinct);
      return s && s.n >= MIN_N ? color(s.rate) : css("--nodata");
    });
    // Label the precincts that stray furthest from the city average (weighted by size so tiny precincts
    // don't dominate), the busiest precinct first since the story keeps returning to it.
    const dev = s => Math.abs(s.rate - cityRate) * Math.sqrt(s.n);
    const notable = [...reliable].sort((a, b) => dev(b) - dev(a));
    const items = [byVol[0], ...notable.filter(s => s !== byVol[0])]
      .map((s, i) => ({ p: s.p, text: `${HOOD[s.p]} ${pct(s.rate)}`, minor: i >= 6 }));
    base.placeLabels(labels, withGuess(items, s => pct(s.rate)), 22);
    d3.select("#legend2").html(
      `<span>${pct(cityRate - span)}<span class="ramp" style="background:linear-gradient(to right,var(--div-lo),var(--div-mid),var(--div-hi))"></span>${pct(cityRate + span)}</span>` +
      `<span>Gray = city average, ${pct(cityRate, 1)}</span>` +
      `<span><span class="sw" style="background:var(--nodata);border:1px solid var(--border)"></span>Fewer than ${MIN_N} allegations</span>`
    );
  }

  function render(dur = 0, delay = 0) {
    if (!revealed) { renderGuess(); return; }
    d3.select("#m2-title").text(MODES[mode].title);
    d3.select("#m2-sub").text(MODES[mode].sub);
    (mode === "rate" ? renderRate : renderPerResident)(dur, delay);
    labels.selectAll("text").classed("guess-label", d => d.p === guess);
    precincts.filter(f => +f.properties.precinct === guess).raise();
  }

  onHighlight(p => {
    precincts.classed("hl", f => +f.properties.precinct === p);
    precincts.filter(f => +f.properties.precinct === p).raise();
  });
  onHome(p => {
    precincts.classed("home", f => +f.properties.precinct === p);
    precincts.filter(f => +f.properties.precinct === p).raise();
    if (revealed) { writeResult(guess); if (guess == null) side.pin(p); }
  });

  return { render, buttons, reveal };
}
