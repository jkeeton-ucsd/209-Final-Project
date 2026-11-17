// Act 1 trend chart: every precinct's complaints-per-resident rate over time as a faint line. A focus panel
// picks which lines stand out: the top N at the cursor (optionally within one borough, optionally skipping
// commercial districts), plus any precincts the reader pins by search or by clicking the map. Lines draw in
// up to the playback cursor, so a change in the lead shows up as a crossing rather than a row jumping places.
import { START, END, K0, HOOD, COMMERCIAL, BORO, pname } from "../config.js";
import { kdate, mkey, fmtShort } from "../utils.js";
import { showTip, hideTip } from "../ui/tooltip.js";
import { highlight } from "../ui/highlight.js";

// Shared with the timeline below it so the two x-axes (and cursors) line up exactly.
export const TREND_W = 620, TREND_M = { l: 30, r: 132 };

const BOROS = ["All", "Manhattan", "Bronx", "Brooklyn", "Queens", "Staten Island"];
const TOP_OPTS = [[0, "None"], [3, "Top 3"], [5, "Top 5"], [10, "Top 10"]];
const hoodName = p => HOOD[p] || `Precinct ${p}`;

/**
 * @param {string} el       SVG selector
 * @param {(k:number)=>string} tipNote  extra tooltip line for month k (e.g. the window it covers)
 * @param {(k:number)=>void}   onScrub  called with a month key when the user clicks the chart
 * @param {(pins:Set<number>)=>void} onPinsChange  called whenever the pinned set changes
 */
export function createTrendLines({ el, tipNote, onScrub, onPinsChange = () => {} }) {
  const W = TREND_W, H = 300, m = { t: 10, b: 22, ...TREND_M };
  const LABEL_GAP = 13;   // min vertical distance between labels (px)
  const opts = { topN: 5, boro: "All", smooth: 12, skipCommercial: true, pins: new Set(), home: null };

  const svg = d3.select(el).attr("viewBox", `0 0 ${W} ${H}`);
  const x = d3.scaleTime().domain([START, END]).range([m.l, W - m.r]);
  const y = d3.scaleLinear().range([H - m.b, m.t]);
  const xOf = k => x(kdate(k));

  const grid = svg.append("g").attr("class", "gridlines").attr("transform", `translate(${m.l},0)`);
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`)
    .call(d3.axisBottom(x).ticks(d3.timeYear.every(4)).tickSizeOuter(0));
  const yAxis = svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`);

  // Lines are drawn in full once; a clip rect reveals them up to the cursor.
  const clipId = `${el.replace("#", "")}-clip`;
  const clip = svg.append("clipPath").attr("id", clipId).append("rect")
    .attr("x", m.l).attr("y", m.t).attr("height", H - m.b - m.t).attr("width", 0);
  const linesG = svg.append("g").attr("clip-path", `url(#${clipId})`);
  const cityPath = svg.append("path").attr("class", "trend-city").attr("clip-path", `url(#${clipId})`);
  // annotation: the single highest point any (eligible) precinct reaches, shown once playback gets there
  const peakG = svg.append("g").attr("class", "trend-peak").style("display", "none");
  peakG.append("circle").attr("r", 4);
  const peakText = peakG.append("text").attr("class", "anno");
  const cursorLine = svg.append("line").attr("class", "trend-cursor").attr("y1", m.t).attr("y2", H - m.b);
  const marksG = svg.append("g");
  const hit = svg.append("rect").attr("x", m.l).attr("y", 0).attr("width", W - m.l - m.r).attr("height", H)
    .attr("fill", "transparent").style("cursor", "crosshair");

  let raw = [], rawCity = [], series = [], city = [], lines = linesG.selectAll("path.trend-line");
  let last = { cursor: K0, dur: 0 }, hl = null;

  // ---------- data ----------
  /** Trailing mean of the last `n` months (past values only, so playback never reveals the future). */
  const smooth = (vals, n) => n <= 1 ? vals : vals.map((v, i) => {
    if (v == null) return null;
    const win = vals.slice(Math.max(0, i - n + 1), i + 1).filter(u => u != null);
    return d3.mean(win);
  });

  /**
   * @param data [{ p, vals }] where vals[k - K0] is the rate in the window ending at month k (null = no rate)
   * @param cityVals the same rate for the whole city, drawn as a dashed reference line
   */
  function setData(data, cityVals = []) {
    raw = data; rawCity = cityVals;
    rebuild();
  }

  function rebuild() {
    series = raw.map(s => ({ p: s.p, vals: smooth(s.vals, opts.smooth) }));
    city = smooth(rawCity, opts.smooth);
    y.domain([0, d3.max(series, s => d3.max(s.vals)) || 1]).nice();
    yAxis.call(d3.axisLeft(y).ticks(5).tickSizeOuter(0));
    grid.call(d3.axisLeft(y).ticks(5).tickSize(-(W - m.l - m.r)).tickFormat(""));
    const gen = d3.line().defined(v => v != null).x((v, i) => xOf(K0 + i)).y(v => y(v)).curve(d3.curveMonotoneX);
    lines = linesG.selectAll("path.trend-line").data(series, d => d.p).join("path")
      .attr("class", "trend-line").attr("d", d => gen(d.vals));
    cityPath.attr("d", gen(city)).raise();
    fillSearchList();
  }

  const valAt = (p, k) => series.find(s => s.p === p)?.vals[k - K0];
  const inBoro = p => opts.boro === "All" || BORO(p) === opts.boro;

  /** The precincts that get the accent color at month k under the current focus settings. */
  function topAt(k) {
    if (!opts.topN) return [];
    return series
      .filter(s => s.vals[k - K0] != null && inBoro(s.p) && !(opts.skipCommercial && COMMERCIAL.has(s.p)))
      .sort((a, b) => b.vals[k - K0] - a.vals[k - K0] || a.p - b.p)
      .slice(0, opts.topN).map(s => s.p);
  }

  // ---------- drawing ----------
  /** Reveal lines up to `cursor` and restyle/label them for the current focus. */
  function render({ cursor, dur = 0 }) {
    last = { cursor, dur };
    const top = topAt(cursor), topSet = new Set(top), pins = opts.pins, cx = xOf(cursor);
    clip.transition("reveal").duration(dur).ease(d3.easeLinear).attr("width", Math.max(0, cx - m.l));
    cursorLine.transition("reveal").duration(dur).ease(d3.easeLinear).attr("x1", cx).attr("x2", cx);

    const home = opts.home;
    const role = p => p === "city" ? "city" : p === hl ? "hl" : p === home ? "pin home" : pins.has(p) ? "pin" : topSet.has(p) ? "top" : inBoro(p) ? "" : "dim";
    lines.attr("class", d => `trend-line ${role(d.p)}`);
    lines.filter(d => topSet.has(d.p)).raise();
    lines.filter(d => pins.has(d.p) || d.p === home).raise();
    lines.filter(d => d.p === hl).raise();
    cityPath.raise();

    renderPeak(cursor);

    // labels at the line heads (plus the city average), nudged apart so they never overlap
    const shown = [...new Set([...top, ...pins, ...(home != null ? [home] : []), ...(hl != null ? [hl] : [])])];
    const items = [...shown.map(p => ({ p, v: valAt(p, cursor) })), { p: "city", v: city[cursor - K0] }].filter(d => d.v != null)
      .map(d => ({ ...d, hy: Math.max(m.t, y(d.v)) })).sort((a, b) => a.hy - b.hy);
    items.forEach((d, i) => { d.ly = i ? Math.max(d.hy, items[i - 1].ly + LABEL_GAP) : d.hy; });
    const over = items.length ? items[items.length - 1].ly - (H - m.b - 4) : 0;
    if (over > 0) for (let i = items.length - 1; i >= 0; i--) {
      items[i].ly -= over;
      if (i && items[i - 1].ly > items[i].ly - LABEL_GAP) items[i - 1].ly = items[i].ly - LABEL_GAP; else break;
    }

    marksG.selectAll("g.trend-mark").data(items, d => d.p).join(
      enter => {
        const g = enter.append("g").attr("class", "trend-mark").style("opacity", 0).attr("transform", `translate(${cx},0)`);
        g.append("path").attr("class", "trend-lead");
        g.append("circle").attr("class", "trend-dot").attr("r", 3);
        g.append("text").attr("class", "trend-label").attr("x", 10).attr("dy", "0.35em");
        return g;
      },
      update => update,
      exit => exit.transition("mark").duration(Math.min(dur, 300)).style("opacity", 0).remove()
    ).call(g => {
      g.attr("class", d => `trend-mark ${role(d.p)}`);
      g.select("text").text(d => d.p === "city" ? `City, same window ${d.v.toFixed(1)}`
        : `${hoodName(d.p)}${COMMERCIAL.has(d.p) ? "*" : ""}${d.p === home ? " (you)" : ""} ${d.v.toFixed(1)}`);
      const t = g.transition("mark").duration(dur).ease(d3.easeLinear)
        .attr("transform", `translate(${cx},0)`).style("opacity", 1);
      t.select("circle").attr("cy", d => d.hy);
      t.select("text").attr("y", d => d.ly);
      t.select(".trend-lead").attr("d", d => `M4,${d.hy}L8,${d.ly}`);
    });

    renderLegend(cursor, items);
  }

  /** Annotate the highest point reached by any precinct the current focus allows, once the cursor passes it. */
  function renderPeak(cursor) {
    let best = null;
    for (const s of series) {
      if (!inBoro(s.p) || (opts.skipCommercial && COMMERCIAL.has(s.p))) continue;
      s.vals.forEach((v, i) => { if (v != null && (!best || v > best.v)) best = { p: s.p, v, k: K0 + i }; });
    }
    const show = best && cursor >= best.k;
    peakG.style("display", show ? null : "none");
    if (!show) return;
    const px = xOf(best.k), py = y(best.v), left = px > (m.l + W - m.r) / 2;
    peakG.raise().select("circle").attr("cx", px).attr("cy", py);
    peakText.attr("x", px + (left ? -8 : 8)).attr("y", py - 6).attr("text-anchor", left ? "end" : "start")
      .text(`Highest point: ${hoodName(best.p)}, ${best.v.toFixed(1)} in ${kdate(best.k).getFullYear()}`);
  }

  function renderLegend(cursor, items) {
    const scope = [opts.boro !== "All" && `in ${opts.boro}`, opts.skipCommercial && "excluding commercial districts"].filter(Boolean).join(", ");
    d3.select("#trend-legend").html(
      (opts.topN ? `<span><span class="sw line" style="background:var(--pulse)"></span>${opts.topN} highest in ${fmtShort(kdate(cursor))}${scope ? ` (${scope})` : ""}</span>` : "") +
      (opts.pins.size || opts.home != null ? `<span><span class="sw line" style="background:var(--pin)"></span>${[opts.home != null && "Your neighborhood", opts.pins.size && "pinned"].filter(Boolean).join(" and ").replace(/^p/, "P")}</span>` : "") +
      `<span><span class="sw line dashed"></span>City average over the same window</span>` +
      `<span><span class="sw line" style="background:var(--text-muted);opacity:.45"></span>Other precincts</span>` +
      (items.some(d => COMMERCIAL.has(d.p)) ? `<span>* Commercial district: few residents but many workers and visitors, so its rate is inflated</span>` : ""));
  }

  const redraw = () => render({ ...last, dur: 0 });

  /** The reader's home neighborhood: always drawn and labeled, in the pin color. */
  function setHome(p) { opts.home = p; redraw(); }

  /** Emphasize one precinct's line (from hovering here or anywhere else on the page). */
  function setHighlight(p) { hl = p; redraw(); }

  // ---------- pins ----------
  function setPin(p, on) {
    if (on) opts.pins.add(p); else opts.pins.delete(p);
    d3.select("#trend-pins").selectAll("button").data([...opts.pins], d => d).join("button")
      .attr("class", "pin-chip").attr("aria-label", d => `Unpin ${hoodName(d)}`)
      .html(d => `${hoodName(d)} <span aria-hidden="true">×</span>`)
      .on("click", (ev, d) => setPin(d, false));
    onPinsChange(opts.pins);
    redraw();
  }
  const togglePin = p => setPin(p, !opts.pins.has(p));

  // ---------- focus controls ----------
  const topBtns = d3.select("#trend-top").selectAll("button").data(TOP_OPTS).join("button")
    .text(d => d[1]).attr("aria-pressed", d => d[0] === opts.topN)
    .on("click", (ev, [n]) => { opts.topN = n; topBtns.attr("aria-pressed", d => d[0] === n); redraw(); });

  d3.select("#trend-boro").selectAll("option").data(BOROS).join("option")
    .attr("value", d => d).text(d => d === "All" ? "All boroughs" : d);
  d3.select("#trend-boro").on("change", ev => { opts.boro = ev.target.value; redraw(); });

  d3.select("#trend-smooth").property("value", opts.smooth)
    .on("change", ev => { opts.smooth = +ev.target.value; rebuild(); redraw(); });

  d3.select("#trend-commercial").property("checked", opts.skipCommercial)
    .on("change", ev => { opts.skipCommercial = ev.target.checked; redraw(); });

  // search: a datalist of "Neighborhood (precinct)" entries; also accepts a bare precinct number or a partial name
  const optionText = p => `${hoodName(p)} (${p})`;
  function fillSearchList() {
    d3.select("#trend-hoods").selectAll("option")
      .data(series.filter(s => s.vals.some(v => v != null)).map(s => s.p).sort((a, b) => hoodName(a).localeCompare(hoodName(b))))
      .join("option").attr("value", optionText);
  }
  function findPrecinct(q) {
    q = q.trim().toLowerCase();
    if (!q) return null;
    const ps = series.filter(s => s.vals.some(v => v != null)).map(s => s.p);
    return ps.find(p => optionText(p).toLowerCase() === q)
      ?? ps.find(p => String(p) === q)
      ?? ps.find(p => hoodName(p).toLowerCase().startsWith(q))
      ?? ps.find(p => hoodName(p).toLowerCase().includes(q)) ?? null;
  }
  const search = document.getElementById("trend-search");
  const submitSearch = () => {
    const p = findPrecinct(search.value);
    search.setCustomValidity(p == null && search.value.trim() ? "No matching neighborhood" : "");
    if (p == null) { search.reportValidity(); return; }
    setPin(p, true);
    search.value = "";
  };
  search.addEventListener("change", submitSearch);   // fires when a datalist entry is picked
  search.addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); submitSearch(); } });
  search.addEventListener("input", () => search.setCustomValidity(""));

  // ---------- hover / click ----------
  const monthAt = (ev, max) => {
    const [mx] = d3.pointer(ev, svg.node());
    return Math.max(K0, Math.min(max, mkey(d3.timeMonth.round(x.invert(mx)))));
  };
  /** The drawn line nearest the pointer (within 24px), or null. */
  function nearest(ev) {
    const k = monthAt(ev, last.cursor), [, my] = d3.pointer(ev, svg.node());   // only lines drawn so far
    const cand = series.filter(s => s.vals[k - K0] != null && (inBoro(s.p) || opts.pins.has(s.p)));
    const near = d3.least(cand, s => Math.abs(y(s.vals[k - K0]) - my));
    return near && Math.abs(y(near.vals[k - K0]) - my) <= 24 ? { near, k } : null;
  }
  hit.on("mousemove", ev => {
      const hitLine = nearest(ev);
      if (!hitLine) { highlight(null); hideTip(); return; }
      const { near, k } = hitLine;
      highlight(near.p);
      showTip(ev, `<b>${pname(near.p)}</b><br>${near.vals[k - K0].toFixed(1)} complaints per 10,000 residents per year` +
        `<br><span class="muted">${tipNote(k)}${opts.smooth > 1 ? `, ${opts.smooth}-month average` : ""}</span>` +
        (COMMERCIAL.has(near.p) ? `<br><span class="muted">Few residents but many workers and visitors, so this rate is inflated.</span>` : "") +
        `<br><span class="muted">Click to ${opts.pins.has(near.p) ? "unpin" : "pin"}</span>`);
    })
    .on("mouseleave", () => { highlight(null); hideTip(); })
    // click a line to pin/unpin it; click empty space to jump to that month
    .on("click", ev => { const h = nearest(ev); h ? togglePin(h.near.p) : onScrub(monthAt(ev, mkey(END))); });

  return { setData, render, highlight: setHighlight, togglePin, setHome, opts };
}
