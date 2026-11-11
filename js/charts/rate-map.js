// Act 2b — map of outcomes by precinct. Three views: substantiation rate vs. city average (diverging),
// and allegations upheld / not upheld per resident (sequential, sharing one scale so they compare by eye).
import { HOOD, COMMERCIAL, MIN_N, YEARS, pname } from "../config.js";
import { css, pct, usd } from "../utils.js";
import { showTip, hideTip } from "../ui/tooltip.js";
import { highlight, onHighlight } from "../ui/highlight.js";
import { MW, MH } from "./map-base.js";

export function initRateMap(model, base, side) {
  const { stats, reliable, byVol, cityRate, hasPop } = model;

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

  // ---------- tooltips ----------
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
      highlight(p); side.show(p);
      showTip(ev, mode === "rate" ? rateTip(p, s) : perResTip(p, s));
    })
    .on("mouseleave", () => { highlight(null); side.restore(); hideTip(); })
    .on("click", (ev, f) => side.togglePin(+f.properties.precinct));
  const labels = svg.append("g");

  const buttons = d3.select("#m2-mode").selectAll("button").data(Object.entries(MODES)).join("button")
    .text(([, m]) => m.btn).attr("aria-pressed", ([k]) => k === mode)
    .on("click", (ev, [k]) => { mode = k; buttons.attr("aria-pressed", ([key]) => key === mode); render(500); });

  // one computed sentence in the Act 2 prose
  {
    const top = [...resPrecincts].sort((a, b) => b.noPer10k - a.noPer10k)[0], ues = stats.get(19);
    d3.select("#m2-note").html(`In <b>${HOOD[top.p]}</b>, ${top.noPer10k.toFixed(1)} allegations per 10,000 residents a year end without being upheld, ` +
      `${Math.round(top.noPer10k / ues.noPer10k)}× the rate on the Upper East Side (${ues.noPer10k.toFixed(2)}).`);
  }

  function renderPerResident(dur) {
    const m = MODES[mode];
    const color = d3.scaleSequential(d3.interpolateRgb(css("--div-mid"), css(m.hi))).domain([0, perMax]).clamp(true);
    precincts.transition("fill").duration(dur).attr("fill", f => {
      const s = stats.get(+f.properties.precinct);
      return s && hasPop(s.p) && m.get(s) != null ? color(m.get(s)) : css("--nodata");
    });
    const items = [...resPrecincts].sort((a, b) => m.get(b) - m.get(a))
      .map((s, i) => ({ p: s.p, text: `${HOOD[s.p]} ${m.get(s).toFixed(1)}${COMMERCIAL.has(s.p) ? "*" : ""}`, minor: i >= 6 }));
    base.placeLabels(labels, items, 18);
    d3.select("#legend2").html(
      `<span>0<span class="ramp" style="background:linear-gradient(to right,var(--div-mid),var(${m.hi}))"></span>${perMax.toFixed(1)}</span>` +
      `<span>${m.word[0].toUpperCase() + m.word.slice(1)} allegations per 10,000 residents per year · city average ${m.city.toFixed(1)}</span>` +
      `<span><span class="sw" style="background:var(--nodata);border:1px solid var(--border)"></span>Almost no residents</span>` +
      `<span>* Commercial district: few residents, so the rate is inflated</span>`
    );
  }

  function renderRate(dur) {
    const color = d3.scaleDiverging()
      .domain([cityRate - span, cityRate, cityRate + span])
      .interpolator(t => t < 0.5
        ? d3.interpolateRgb(css("--div-lo"), css("--div-mid"))(t * 2)
        : d3.interpolateRgb(css("--div-mid"), css("--div-hi"))((t - 0.5) * 2));
    precincts.transition("fill").duration(dur).attr("fill", f => {
      const s = stats.get(+f.properties.precinct);
      return s && s.n >= MIN_N ? color(s.rate) : css("--nodata");
    });
    // Label the precincts that stray furthest from the city average (weighted by size so tiny precincts
    // don't dominate), East New York first since the story keeps returning to it.
    const dev = s => Math.abs(s.rate - cityRate) * Math.sqrt(s.n);
    const notable = [...reliable].sort((a, b) => dev(b) - dev(a));
    const items = [byVol[0], ...notable.filter(s => s !== byVol[0])]
      .map((s, i) => ({ p: s.p, text: `${HOOD[s.p]} ${pct(s.rate)}`, minor: i >= 6 }));
    base.placeLabels(labels, items, 22);
    d3.select("#legend2").html(
      `<span>${pct(cityRate - span)}<span class="ramp" style="background:linear-gradient(to right,var(--div-lo),var(--div-mid),var(--div-hi))"></span>${pct(cityRate + span)}</span>` +
      `<span>Middle (gray) = city average, ${pct(cityRate, 1)}</span>` +
      `<span><span class="sw" style="background:var(--nodata);border:1px solid var(--border)"></span>Fewer than ${MIN_N} allegations</span>`
    );
  }

  function render(dur = 0) {
    d3.select("#m2-title").text(MODES[mode].title);
    d3.select("#m2-sub").text(MODES[mode].sub);
    (mode === "rate" ? renderRate : renderPerResident)(dur);
  }

  onHighlight(p => {
    precincts.classed("hl", f => +f.properties.precinct === p);
    precincts.filter(f => +f.properties.precinct === p).raise();
  });

  return { render, buttons };
}
