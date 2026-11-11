// Loading + every derived number the charts and prose use. Charts read from the returned `model`;
// nothing here touches the DOM.
import { FADO, OUTCOMES, YEARS, MIN_N, MIN_POP } from "./config.js";
import { corr } from "./utils.js";

export async function loadData() {
  const [geo, rows, incomeRows] = await Promise.all([
    d3.json("data/precincts.geojson"),
    d3.csv("data/allegations.csv"),
    d3.csv("data/precinct_income.csv", d3.autoType),
  ]);
  return { geo, rows, incomeRows };
}

export function buildModel({ geo, rows, incomeRows }) {
  const precinctIds = new Set(geo.features.map(f => +f.properties.precinct));

  // ---- allegation-level rows, 2000–2019, mappable precincts only ----
  const alleg = [];
  for (const r of rows) {
    const p = +r.precinct, y = +r.year_received;
    if (!precinctIds.has(p) || y < 2000 || y > 2019) continue;
    alleg.push({
      cid: r.complaint_id, precinct: p, mk: y * 12 + (+r.month_received - 1),
      fado: r.fado_type, allegation: r.allegation,
      outcome: r.board_disposition.split(" (")[0],
      compRace: r.complainant_ethnicity,
    });
  }

  // ---- complaint-level rows (Act 1 counts complaints, not allegations) ----
  const complaints = Array.from(d3.group(alleg, a => a.cid), ([cid, as]) => ({
    id: cid, precinct: as[0].precinct, mk: as[0].mk, fados: new Set(as.map(a => a.fado)),
  }));

  // ---- per-precinct stats (Acts 2–3) ----
  const cityRate = d3.mean(alleg, a => a.outcome === "Substantiated");
  // substantiation rate for each allegation type (gives a precinct's "expected" rate from its mix)
  const fadoRates = new Map(FADO.map(f => {
    const as = alleg.filter(a => a.fado === f);
    return [f, as.filter(a => a.outcome === "Substantiated").length / as.length];
  }));
  const stats = new Map();
  for (const [p, as] of d3.group(alleg, a => a.precinct)) {
    const n = as.length;
    const outc = Object.fromEntries(OUTCOMES.map(o => [o.key, as.filter(a => a.outcome === o.key).length]));
    stats.set(p, {
      p, n, outc,
      complaints: new Set(as.map(a => a.cid)).size,
      rate: outc.Substantiated / n,
      force: as.filter(a => a.fado === "Force").length / n,
      black: as.filter(a => a.compRace === "Black").length / n,
      top: d3.rollups(as, v => v.length, a => a.allegation).sort((a, b) => b[1] - a[1]).slice(0, 5),
      expected: d3.mean(as, a => fadoRates.get(a.fado)),
    });
  }

  // ---- Census layer: income + population (ACS tracts aggregated to precincts) ----
  const POP = new Map(incomeRows.map(r => [r.precinct, r.population]));
  const hasPop = p => (POP.get(p) || 0) >= MIN_POP;
  for (const r of incomeRows) {
    const s = stats.get(r.precinct);
    if (!s) continue;
    const per10kYr = count => r.population > 0 ? count / r.population * 10000 / YEARS : null;
    s.pop = r.population;
    s.income = r.median_income || null;
    s.per10k = per10kYr(s.complaints);                         // complaints per 10k residents per year
    s.upPer10k = per10kYr(s.outc.Substantiated);               // allegations upheld
    s.noPer10k = per10kYr(s.n - s.outc.Substantiated);         // allegations not upheld (exonerated + unsubstantiated)
  }

  // ---- precinct groupings for Act 3 ----
  const reliable = [...stats.values()].filter(s => s.n >= MIN_N && s.income && s.per10k);
  const byVol = [...reliable].sort((a, b) => b.complaints - a.complaints);
  const q = Math.floor(byVol.length / 4);
  const pool = (grp, f) => d3.sum(grp, s => f(s) * s.n) / d3.sum(grp, s => s.n);   // allegation-weighted
  const summarize = grp => ({
    rate: pool(grp, s => s.rate), force: pool(grp, s => s.force), black: pool(grp, s => s.black), expected: pool(grp, s => s.expected),
    per10k: d3.sum(grp, s => s.complaints) / d3.sum(grp, s => s.pop) * 10000 / YEARS,
    incLo: d3.min(grp, s => s.income), incHi: d3.max(grp, s => s.income), size: grp.length,
  });
  // two ways to split precincts into quarters: by complaint volume, and by median income
  const G = { busy: summarize(byVol.slice(0, q)), quiet: summarize(byVol.slice(-q)) };
  const byInc = [...reliable].sort((a, b) => a.income - b.income);
  const GI = { poor: summarize(byInc.slice(0, q)), rich: summarize(byInc.slice(-q)) };
  const rVol = corr(reliable.map(s => Math.log10(s.complaints)), reliable.map(s => s.rate));

  // ---- headline numbers ----
  const totalComplaints = complaints.length;
  const top10 = [...stats.values()].sort((a, b) => b.complaints - a.complaints).slice(0, 10);
  const top10Share = d3.sum(top10, s => s.complaints) / totalComplaints;
  const rateBy = race => {
    const as = alleg.filter(a => a.compRace === race);
    return as.filter(a => a.outcome === "Substantiated").length / as.length;
  };

  return {
    geo, precinctIds, alleg, complaints, cityRate, fadoRates, stats, POP, hasPop,
    reliable, byVol, q, G, GI, rVol, totalComplaints, top10, top10Share, rateBy,
  };
}
