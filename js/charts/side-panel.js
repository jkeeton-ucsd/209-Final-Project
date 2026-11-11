// Act 2 side panel: findings, income, and top allegations for the hovered/pinned precinct (or the whole city).
import { OUTCOMES, BORO, YEARS, pname } from "../config.js";
import { pct, usd } from "../utils.js";

export function createSidePanel(model) {
  const { alleg, stats, cityRate, totalComplaints } = model;
  let pinned = null;

  // citywide figures don't change, so compute them once
  const cityOutc = Object.fromEntries(OUTCOMES.map(o => [o.key, alleg.filter(a => a.outcome === o.key).length]));
  const cityTop = d3.rollups(alleg, v => v.length, a => a.allegation).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const cityPer10k = totalComplaints / d3.sum([...stats.values()], s => s.pop || 0) * 10000 / YEARS;

  function show(p) {
    const s = p == null ? null : stats.get(p);
    const n = s ? s.n : alleg.length;
    const outc = s ? s.outc : cityOutc;
    const top = s ? s.top : cityTop;
    const rate = outc.Substantiated / n;
    const diff = rate - cityRate;

    d3.select("#side-title").text(s ? pname(p) : "All of NYC");
    d3.select("#side-sub").text(s
      ? `${BORO(p)} · ${n.toLocaleString()} allegations${pinned === p ? " · click again to unpin" : ""}`
      : `${n.toLocaleString()} allegations · hover or click a precinct`);
    d3.select("#side-rate").html(`${pct(rate)} <small>substantiated${s ? ` · ${diff >= 0 ? "+" : "−"}${Math.abs(diff * 100).toFixed(1)} pts vs. city` : ""}</small>`);
    d3.select("#side-demo").html(s && s.income
      ? `Median household income <b>${usd(s.income)}</b> · ${Math.round(s.pop / 1000)}k residents<br>` +
        `Per 10k residents a year: <b>${s.per10k.toFixed(1)}</b> complaints · <b>${s.upPer10k.toFixed(1)}</b> allegations upheld · <b>${s.noPer10k.toFixed(1)}</b> not upheld`
      : s ? "" : `Citywide: <b>${cityPer10k.toFixed(1)}</b> complaints per 10k residents a year`);
    d3.select("#side-stack").html(OUTCOMES.map(o => `<div style="width:${outc[o.key] / n * 100}%;background:var(${o.color})" title="${o.key}"></div>`).join(""));
    d3.select("#side-stack-legend").html(OUTCOMES.map(o => `<span><span class="sw" style="background:var(${o.color})"></span>${o.key} ${pct(outc[o.key] / n)}</span>`).join(""));
    const mx = top[0][1];
    d3.select("#side-top").html(top.map(([k, v]) =>
      `<div class="row"><span class="lbl">${k}</span><span class="val">${v.toLocaleString()}</span><div class="track"><div class="fill" style="width:${v / mx * 100}%;background:var(--text-muted)"></div></div></div>`).join(""));
  }

  return {
    show,
    /** Return to the pinned precinct (or citywide) after a hover ends. */
    restore: () => show(pinned),
    /** Click toggles a pin on that precinct. */
    togglePin(p) { pinned = pinned === p ? null : p; show(pinned); },
  };
}
