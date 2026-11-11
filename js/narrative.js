// Fills computed numbers into the article text, so the prose always matches the data.
import { pct, usd } from "./utils.js";

export function fillNarrative(model) {
  const { G, GI, rVol, totalComplaints, top10Share, rateBy } = model;
  const set = (id, html) => d3.select(id).html(html);
  const perResRatio = (GI.poor.per10k / GI.rich.per10k).toFixed(1);

  set("#h-total", totalComplaints.toLocaleString());
  set("#h-top10", pct(top10Share));
  set("#r-val", `r = ${rVol.toFixed(2)}`);

  set("#why-mix", `If the busiest precincts just had more force allegations, which are rarely upheld, that could explain the gap. They don't. ` +
    `Force makes up <b>${pct(G.busy.force)}</b> of allegations in the busiest quarter and <b>${pct(G.quiet.force)}</b> in the quietest. ` +
    `Based on allegation type alone, both groups would be expected to land near <b>${pct(G.busy.expected)}</b> substantiated.`);

  set("#why-race", `<b>${pct(G.busy.black)}</b> of allegations in the busiest precincts come from Black complainants, vs. <b>${pct(G.quiet.black)}</b> in the quietest. ` +
    `Citywide, allegations from Black complainants are substantiated less often than those from white complainants (<b>${pct(rateBy("Black"))}</b> vs. <b>${pct(rateBy("White"))}</b>).`);

  set("#why-income", `The poorest quarter of precincts (median household income ${usd(GI.poor.incLo)}–${usd(GI.poor.incHi)}) file <b>${perResRatio}×</b> ` +
    `as many complaints per resident as the richest quarter (${usd(GI.rich.incLo)}+). Their allegations are also upheld less often: ` +
    `<b>${pct(GI.poor.rate)}</b> vs. <b>${pct(GI.rich.rate)}</b>.`);

  set("#t-gap", pct(1 - G.busy.rate / G.quiet.rate));
  set("#t-income", `The poorest precincts file ${perResRatio}× as many complaints per resident as the richest, and get fewer of them upheld.`);
}
