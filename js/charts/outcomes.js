// Act 2a — 100% stacked bars: CCRB findings for all allegations and for each allegation type.
import { FADO, FADO_LABEL, OUTCOMES } from "../config.js";
import { css, pct } from "../utils.js";
import { showTip, hideTip } from "../ui/tooltip.js";

export function initOutcomes(model) {
  const { alleg, fadoRates } = model;
  const OW = 1140, rowH = 30, gap = 14, labelW = 150;
  const rows = [{ label: "All allegations", as: alleg }, ...FADO.map(f => ({ label: FADO_LABEL[f], as: alleg.filter(a => a.fado === f) }))];
  const OH = rows.length * (rowH + gap) + 8;
  const svg = d3.select("#outcomes").attr("viewBox", `0 0 ${OW} ${OH}`);
  const x = d3.scaleLinear().domain([0, 1]).range([labelW, OW - 8]);

  function render() {
    svg.selectAll("*").remove();   // static chart: rebuilt from scratch (only re-run on theme change)
    rows.forEach((r, i) => {
      const n = r.as.length;
      const g = svg.append("g").attr("transform", `translate(0,${i * (rowH + gap)})`);
      g.append("text").attr("x", 0).attr("y", rowH / 2).attr("dy", "0.35em").attr("class", "val-label")
        .style("font-weight", i === 0 ? 600 : 400).text(r.label);
      g.append("text").attr("x", 0).attr("y", rowH / 2 + 14).attr("dy", "0.35em").attr("class", "anno")
        .style("font-size", "11px").text(`${n.toLocaleString()} allegations`);
      let acc = 0;
      for (const o of OUTCOMES) {
        const v = r.as.filter(a => a.outcome === o.key).length / n;
        const x0 = x(acc), w = Math.max(0, x(acc + v) - x(acc) - 2);   // 2px gap between segments
        g.append("rect").attr("x", x0).attr("y", 2).attr("width", w).attr("height", rowH - 4).attr("rx", 3).attr("fill", css(o.color))
          .on("mousemove", ev => showTip(ev, `<b>${r.label}</b><br>${o.key}: ${pct(v, 1)}<br><span class="muted">${Math.round(v * n).toLocaleString()} of ${n.toLocaleString()} allegations</span>`))
          .on("mouseleave", hideTip);
        if (w > 44) g.append("text").attr("x", x0 + 8).attr("y", rowH / 2).attr("dy", "0.35em").attr("class", "val-label")
          .style("fill", o.key === "Unsubstantiated" ? css("--text-primary") : "#fff").style("pointer-events", "none").text(pct(v));
        acc += v;
      }
    });
    // annotation on the Force row
    const fy = rows.findIndex(r => r.label === "Force") * (rowH + gap);
    svg.append("text").attr("class", "anno").attr("x", x(1) - 4).attr("y", fy - 3).attr("text-anchor", "end")
      .text(`Force: only ${pct(fadoRates.get("Force"))} substantiated, and the officer is cleared outright in about half of cases`);
  }

  return { render };
}
