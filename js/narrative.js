// Fills computed numbers into the article text, so the prose always matches the data, and keeps the
// personalized sentences in sync with the reader's home neighborhood.
import { HOOD, MIN_N } from "./config.js";
import { pct, usd } from "./utils.js";
import { onHome } from "./ui/home.js";

const name = p => HOOD[p] || `Precinct ${p}`;
const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const listJoin = xs => xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

export function fillNarrative(model) {
  const { G, GI, rVol, totalComplaints, topPerRatio, topPerBoros, stats, cityRate, cityPer10k,
    perRank, byPer, rateRank, rated } = model;
  const set = (id, html) => d3.select(id).html(html);
  const perResRatio = (GI.poor.per10k / GI.rich.per10k).toFixed(1);

  // ---- opening ----
  set("#h-total", totalComplaints.toLocaleString());
  set("#h-ratio", `${topPerRatio.toFixed(1)} times`);
  set("#h-boros", listJoin(topPerBoros.map(([b, n], i) => `${i ? words[n] : words[n][0].toUpperCase() + words[n].slice(1)} in ${b === "Bronx" ? "the Bronx" : b}`)));

  // ---- why ----
  set("#r-val", `r = ${rVol.toFixed(2)}`);
  // within-type comparison (Act 3 dumbbell and the "why" callout): how many complaint types the busiest precincts trail in, and by how much
  const types = Object.keys(G.busy.up);
  const gaps = types.map(k => G.quiet.up[k] - G.busy.up[k]);
  const trailing = gaps.filter(g => g > 0).length;
  const within = trailing === types.length ? "within every type of complaint" : `within ${words[trailing]} of the ${words[types.length]} types of complaint`;
  const pts = g => Math.round(g * 100);
  set("#why-mix", `Both groups file a similar mix of complaints, so by type alone they'd both land near <b>${pct(G.busy.expected)}</b> upheld. ` +
    `Instead the busiest precincts trail ${within}, by <b>${pts(d3.min(gaps))}</b> to <b>${pts(d3.max(gaps))}</b> points.`);
  set("#why-income", `The poorest quarter of precincts files <b>${perResRatio}×</b> as many complaints per resident as the richest, and sees fewer upheld: <b>${pct(GI.poor.rate)}</b> vs. <b>${pct(GI.rich.rate)}</b>.`);

  // ---- takeaway ----
  set("#t-gap", pct(1 - G.busy.rate / G.quiet.rate));

  // ---- personalized sentences ----
  onHome(p => {
    const s = p == null ? null : stats.get(p);
    d3.selectAll(".you-name").text(p == null ? "" : name(p));
    d3.select("#you-hero").html(p == null
      ? "We'll follow your neighborhood through the story."
      : `We'll follow <b class="you">${name(p)}</b> through the story. Look for it in this color.`);

    d3.select("#you-act1").style("display", s && perRank.has(p) ? null : "none").html(s && perRank.has(p)
      ? `Over the full 20 years, <b class="you">${name(p)}</b> filed <b>${s.per10k.toFixed(1)}</b> complaints per 10,000 residents a year, ` +
        `${perRank.get(p) <= 10 ? "among the highest in the city" : s.per10k > cityPer10k ? "above the city rate" : "below the city rate"} ` +
        `(${cityPer10k.toFixed(1)}), ranking <b>${perRank.get(p)}</b> of ${byPer.length} neighborhoods.`
      : "");

    d3.select("#you-takeaway").style("display", p == null ? "none" : null).html(p == null ? "" : !s || s.n < MIN_N
      ? `<b class="you">${name(p)}</b> had too few allegations in this record (${s ? s.n : 0}) to rate reliably.`
      : `In <b class="you">${name(p)}</b>, <b>${pct(s.rate)}</b> of allegations were substantiated, ranking <b>${rateRank.get(p)}</b> of ${rated.length} precincts; ` +
        `the city as a whole upheld <b>${pct(cityRate)}</b>. Residents there filed <b>${(s.per10k / cityPer10k).toFixed(1)}×</b> the city's rate of complaints per person` +
        (s.income ? `, in a neighborhood with a median household income of <b>${usd(s.income)}</b>.` : "."));
  });
}
