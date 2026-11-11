// Proposal page: six static charts drawn from the same data model as the main page.
// Every chart is rebuilt from scratch on render (re-run when the OS theme changes).
import { FADO, FADO_LABEL, OUTCOMES, MIN_N, HOOD, COMMERCIAL, YEARS } from "./config.js";
import { css, pct, usd, corr } from "./utils.js";
import { loadData, buildModel } from "./data.js";
import { createMapBase, MW, MH } from "./charts/map-base.js";

const MAP_VIEWBOX = `0 60 ${MW} ${MH - 60}`;   // crop the strip map-base reserves for the main page's clock
// Fill a placeholder if the page has it; skip quietly if the text was edited out, so the charts still draw.
const setText = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

// ---------- Figure 1: complaints per year ----------
function yearsChart(model) {
  const W = 560, H = 300, m = { t: 20, r: 8, b: 28, l: 44 };
  const counts = d3.rollups(model.complaints, v => v.length, c => Math.floor(c.mk / 12)).sort((a, b) => a[0] - b[0]);
  const svg = d3.select("#v-years").attr("viewBox", `0 0 ${W} ${H}`);
  svg.selectAll("*").remove();
  const x = d3.scaleBand().domain(counts.map(d => d[0])).range([m.l, W - m.r]).padding(0.2);
  const y = d3.scaleLinear().domain([0, d3.max(counts, d => d[1])]).nice().range([H - m.b, m.t]);
  svg.append("g").attr("class", "gridlines").attr("transform", `translate(${m.l},0)`)
    .call(d3.axisLeft(y).ticks(5).tickSize(-(W - m.l - m.r)).tickFormat(""));
  svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`)
    .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format("~s")).tickSizeOuter(0));
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`)
    .call(d3.axisBottom(x).tickValues(x.domain().filter(yr => yr % 4 === 0)).tickSizeOuter(0));
  const peak = counts.reduce((a, b) => b[1] > a[1] ? b : a);
  svg.append("g").selectAll("rect").data(counts).join("rect")
    .attr("x", d => x(d[0])).attr("width", x.bandwidth())
    .attr("y", d => y(d[1])).attr("height", d => y(0) - y(d[1])).attr("rx", 2)
    .attr("fill", d => d === peak ? css("--share-hi") : css("--pulse")).attr("fill-opacity", d => d === peak ? 1 : 0.55);
  svg.append("text").attr("class", "val-label").attr("text-anchor", "middle")
    .attr("x", x(peak[0]) + x.bandwidth() / 2).attr("y", y(peak[1]) - 6).text(peak[1].toLocaleString());
  const last = counts[counts.length - 1];
  setText("c-years", `Complaints in this dataset peaked in <b>${peak[0]}</b> (${peak[1].toLocaleString()}) and fell to ${last[1].toLocaleString()} by ${last[0]}. ` +
    `The data only covers officers still on the force when it was published in 2020, so early years are undercounted.`);
}

// ---------- Figure 2: top 15 precincts by complaints ----------
function topChart(model) {
  const top = [...model.stats.values()].sort((a, b) => b.complaints - a.complaints).slice(0, 15);
  const W = 560, rowH = 20, m = { t: 4, r: 44, b: 4, l: 170 };
  const H = m.t + top.length * rowH + m.b;
  const svg = d3.select("#v-top").attr("viewBox", `0 0 ${W} ${H}`);
  svg.selectAll("*").remove();
  const x = d3.scaleLinear().domain([0, top[0].complaints]).range([m.l, W - m.r]);
  const g = svg.append("g").selectAll("g").data(top).join("g").attr("transform", (d, i) => `translate(0,${m.t + i * rowH})`);
  g.append("text").attr("class", "anno").attr("x", m.l - 8).attr("y", rowH / 2).attr("dy", "0.35em").attr("text-anchor", "end")
    .text(s => `${HOOD[s.p]} (${s.p})`);
  g.append("rect").attr("x", m.l).attr("y", 3).attr("height", rowH - 6).attr("rx", 2)
    .attr("width", s => x(s.complaints) - m.l).attr("fill", (s, i) => i < 10 ? css("--pulse") : css("--unsub"));
  g.append("text").attr("class", "val-label").attr("x", s => x(s.complaints) + 5).attr("y", rowH / 2).attr("dy", "0.35em")
    .style("font-size", "11px").text(s => s.complaints.toLocaleString());
  setText("c-top", `The top 10 of the city's 77 precincts with the most complaints(in purple) account for <b>${pct(model.top10Share)}</b> of all complaints. ` +
    `${HOOD[top[0].p]} alone has ${top[0].complaints.toLocaleString()}.`);
}

// ---------- Figure 3: complaints per resident map ----------
function perCapMap(model, base) {
  const { stats, hasPop } = model;
  const res = [...stats.values()].filter(s => hasPop(s.p) && s.per10k != null);
  const max = d3.max(res, s => s.per10k);
  const color = d3.scaleSequential(d3.interpolateRgb(css("--share-lo"), css("--share-hi"))).domain([0, max]);
  const svg = d3.select("#v-percap").attr("viewBox", MAP_VIEWBOX);
  svg.selectAll("*").remove();
  svg.append("g").selectAll("path").data(base.features).join("path").attr("class", "precinct").attr("d", base.path)
    .style("cursor", "default")
    .attr("fill", f => { const s = stats.get(+f.properties.precinct); return s && hasPop(s.p) && s.per10k != null ? color(s.per10k) : css("--nodata"); });
  const ranked = [...res].sort((a, b) => b.per10k - a.per10k);
  base.placeLabels(svg.append("g"), ranked.slice(0, 10)
    .map((s, i) => ({ p: s.p, text: `${HOOD[s.p]} ${s.per10k.toFixed(1)}${COMMERCIAL.has(s.p) ? "*" : ""}`, minor: i >= 4 })), 10);
  const city = d3.sum(res, s => s.complaints) / d3.sum(res, s => s.pop) * 10000 / YEARS;
  setText("l-percap", `<span>0<span class="ramp" style="background:linear-gradient(to right,var(--share-lo),var(--share-hi))"></span>${max.toFixed(1)}</span>` +
    `<span><span class="sw" style="background:var(--nodata);border:1px solid var(--border)"></span>Almost no residents</span>` +
    `<span>* Commercial district: few residents, so the rate is inflated</span>`);
  const topRes = ranked.find(s => !COMMERCIAL.has(s.p));
  setText("c-percap", `Per capita complaints prevent the map from simply showing where people live. ` +
    `<b>${HOOD[topRes.p]}</b> has ${topRes.per10k.toFixed(1)} complaints per 10,000 residents a year, against a city average of ${city.toFixed(1)}.`);
}

// ---------- Figure 4: outcomes by allegation type ----------
function outcomesChart(model) {
  const { alleg, cityRate, fadoRates } = model;
  const rows = [{ label: "All allegations", as: alleg, bold: true }, ...FADO.map(f => ({ label: FADO_LABEL[f], as: alleg.filter(a => a.fado === f) }))];
  const W = 560, rowH = 34, labelW = 130;
  const H = rows.length * rowH;
  const svg = d3.select("#v-outcomes").attr("viewBox", `0 0 ${W} ${H}`);
  svg.selectAll("*").remove();
  const x = d3.scaleLinear().domain([0, 1]).range([labelW, W - 4]);
  rows.forEach((r, i) => {
    const g = svg.append("g").attr("transform", `translate(0,${i * rowH})`);
    g.append("text").attr("class", "val-label").attr("y", rowH / 2).attr("dy", "0.35em")
      .style("font-weight", r.bold ? 600 : 400).text(r.label);
    let acc = 0;
    for (const o of OUTCOMES) {
      const v = r.as.filter(a => a.outcome === o.key).length / r.as.length;
      const x0 = x(acc), w = Math.max(0, x(acc + v) - x0 - 2);
      g.append("rect").attr("x", x0).attr("y", 5).attr("width", w).attr("height", rowH - 10).attr("rx", 3).attr("fill", css(o.color));
      if (w > 34) g.append("text").attr("class", "val-label").attr("x", x0 + 6).attr("y", rowH / 2).attr("dy", "0.35em")
        .style("font-size", "11px").attr("fill", o.key === "Unsubstantiated" ? css("--text-primary") : "#fff").text(pct(v));
      acc += v;
    }
  });
  setText("l-outcomes", OUTCOMES.map(o => `<span><span class="sw" style="background:var(${o.color})"></span>${o.key}</span>`).join(""));
  const force = alleg.filter(a => a.fado === "Force");
  const forceExon = force.filter(a => a.outcome === "Exonerated").length / force.length;
  setText("c-outcomes", `Across all allegations, <b>${pct(cityRate)}</b> are substantiated. Force allegations are upheld only ` +
    `${pct(fadoRates.get("Force"))} of the time, and ${pct(forceExon)} end with the officer exonerated.`);
}

// ---------- Figure 5: substantiation rate map ----------
function rateMap(model, base) {
  const { stats, reliable, cityRate, rVol } = model;
  const ext = d3.extent(reliable, s => s.rate);
  const span = Math.max(cityRate - ext[0], ext[1] - cityRate);
  const color = d3.scaleDiverging().domain([cityRate - span, cityRate, cityRate + span])
    .interpolator(t => t < 0.5
      ? d3.interpolateRgb(css("--div-lo"), css("--div-mid"))(t * 2)
      : d3.interpolateRgb(css("--div-mid"), css("--div-hi"))((t - 0.5) * 2));
  const svg = d3.select("#v-rate").attr("viewBox", MAP_VIEWBOX);
  svg.selectAll("*").remove();
  svg.append("g").selectAll("path").data(base.features).join("path").attr("class", "precinct").attr("d", base.path)
    .style("cursor", "default")
    .attr("fill", f => { const s = stats.get(+f.properties.precinct); return s && s.n >= MIN_N ? color(s.rate) : css("--nodata"); });
  const dev = s => Math.abs(s.rate - cityRate) * Math.sqrt(s.n);   // size-weighted distance from the city average
  base.placeLabels(svg.append("g"), [...reliable].sort((a, b) => dev(b) - dev(a)).slice(0, 10)
    .map((s, i) => ({ p: s.p, text: `${HOOD[s.p]} ${pct(s.rate)}`, minor: i >= 4 })), 10);
  setText("l-rate", `<span>${pct(cityRate - span)}<span class="ramp" style="background:linear-gradient(to right,var(--div-lo),var(--div-mid),var(--div-hi))"></span>${pct(cityRate + span)}</span>` +
    `<span>Gray = city average, ${pct(cityRate, 1)}</span>` +
    `<span><span class="sw" style="background:var(--nodata);border:1px solid var(--border)"></span>Fewer than ${MIN_N} allegations</span>`);
  setText("c-rate", `Red precincts have allegations upheld less often than the city average. Across precincts, an increasing number of complaints is related to a lower ` +
    `substantiation rate (r = ${rVol.toFixed(2)} against log complaint volume), which is the question the final project digs into.`);
}

// ---------- Figure 6: income vs. complaints per resident ----------
function incomeChart(model) {
  const { reliable, GI } = model;
  // Commercial districts are drawn (hollow rings) but kept out of the correlation and the label picks,
  // since their per-resident rates are inflated by workers and visitors.
  const isCom = s => COMMERCIAL.has(s.p);
  const pts = reliable.filter(s => !isCom(s)), com = reliable.filter(isCom);
  const W = 560, H = 340, m = { t: 12, r: 12, b: 40, l: 46 };
  const svg = d3.select("#v-income").attr("viewBox", `0 0 ${W} ${H}`);
  svg.selectAll("*").remove();
  const [x0, x1] = d3.extent(reliable, s => s.income), [y0, y1] = d3.extent(reliable, s => s.per10k);
  const x = d3.scaleLog().domain([x0 / 1.1, x1 * 1.1]).range([m.l, W - m.r]);
  const y = d3.scaleLog().domain([y0 / 1.2, y1 * 1.2]).range([H - m.b, m.t]);
  const lead125 = v => { const l = v / 10 ** Math.floor(Math.log10(v) + 1e-9); return [1, 2, 5].some(k => Math.abs(l - k) < 1e-6); };
  svg.append("g").attr("class", "gridlines").attr("transform", `translate(${m.l},0)`)
    .call(d3.axisLeft(y).ticks(5).tickSize(-(W - m.l - m.r)).tickFormat(""));
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`)
    .call(d3.axisBottom(x).ticks(5).tickFormat(v => lead125(v) ? usd(v) : "").tickSizeOuter(0));
  svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`)
    .call(d3.axisLeft(y).ticks(5).tickFormat(v => lead125(v) ? d3.format("~r")(v) : "").tickSizeOuter(0));
  svg.append("text").attr("class", "anno").attr("x", (m.l + W - m.r) / 2).attr("y", H - 6).attr("text-anchor", "middle")
    .text("Median household income, 2020–24 (log scale) →");
  svg.append("text").attr("class", "anno").attr("transform", `translate(12,${(m.t + H - m.b) / 2}) rotate(-90)`).attr("text-anchor", "middle")
    .text("Complaints per 10k residents / yr (log)");
  svg.append("g").selectAll("circle").data(pts).join("circle")
    .attr("cx", s => x(s.income)).attr("cy", s => y(s.per10k)).attr("r", 4.5)
    .attr("fill", css("--pulse")).attr("fill-opacity", 0.7).attr("stroke", css("--surface-1")).attr("stroke-width", 1);
  svg.append("g").selectAll("circle").data(com).join("circle")
    .attr("cx", s => x(s.income)).attr("cy", s => y(s.per10k)).attr("r", 5)
    .attr("fill", css("--surface-1")).attr("stroke", css("--text-primary")).attr("stroke-width", 1.75);

  // Labels: commercial districts first, then residential extremes. Each tries right, left, above, below
  // its dot and is skipped if every spot overlaps a label already placed.
  const byInc = [...pts].sort((a, b) => a.income - b.income), byRate = [...pts].sort((a, b) => b.per10k - a.per10k);
  const picks = [...new Set([...com, byRate[0], byRate[1], byInc[byInc.length - 1], byRate[byRate.length - 1]])];
  const placed = [];
  svg.append("g").selectAll("text").data(picks).join("text").attr("class", "map-label").style("font-weight", 500)
    .text(s => HOOD[s.p] + (isCom(s) ? "*" : ""))
    .each(function (s) {
      const cx = x(s.income), cy = y(s.per10k);
      for (const [dx, dy, anchor] of [[8, 4, "start"], [-8, 4, "end"], [0, -9, "middle"], [0, 16, "middle"]]) {
        this.setAttribute("x", cx + dx); this.setAttribute("y", cy + dy); this.setAttribute("text-anchor", anchor);
        const b = this.getBBox();
        if (b.x < m.l || b.x + b.width > W) continue;
        if (!placed.some(o => b.x < o.x + o.width && b.x + b.width > o.x && b.y < o.y + o.height && b.y + b.height > o.y)) {
          placed.push(b); return;
        }
      }
      this.style.display = "none";
    });

  setText("l-income", `<span><span class="sw round" style="background:var(--pulse);opacity:0.8"></span>Residential precinct</span>` +
    `<span><span class="sw round" style="background:var(--surface-1);border:1.5px solid var(--text-primary)"></span>* Commercial district: few residents, many workers and visitors</span>`);
  const r = corr(pts.map(s => Math.log10(s.income)), pts.map(s => Math.log10(s.per10k)));
  setText("c-income", `Precincts with a lower median household income file far more complaints per resident (r = ${r.toFixed(2)} on log scales). ` +
    `The poorest quarter of precincts files <b>${(GI.poor.per10k / GI.rich.per10k).toFixed(1)}×</b> as many per resident as the richest quarter. ` +
    `Commercial districts (hollow rings: ${com.map(s => HOOD[s.p]).join(", ")}) are shown but left out of r, because their per-resident rates count complaints from people who work or visit there.`);
}

async function main() {
  const status = document.getElementById("status");
  let model;
  try {
    model = buildModel(await loadData());
  } catch (e) {
    status.innerHTML = `<span class="error">Couldn't load the data/ files. Serve this folder over HTTP (for example, <code>python -m http.server</code>).</span>`;
    return;
  }
  setText("d-alleg", model.alleg.length.toLocaleString());
  setText("d-comp", model.totalComplaints.toLocaleString());
  const base = createMapBase(model.geo);
  const renderAll = () => {
    yearsChart(model); topChart(model); perCapMap(model, base);
    outcomesChart(model); rateMap(model, base); incomeChart(model);
  };
  renderAll();
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", renderAll);
  status.textContent = "All figures are computed live from the files in data/.";
}

main();
