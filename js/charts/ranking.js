// Act 1 top-10 list: rows slide to their new rank, bars grow, and ▲/▼ marks recent rank changes during playback.
import { HOOD, BORO } from "../config.js";
import { highlight } from "../ui/highlight.js";

export function createRanking({ el, rows = 10, rowH = 40 }) {
  const box = d3.select(el).style("height", `${rows * rowH}px`);
  let prevRank = new Map();
  const moves = new Map();   // precinct -> { up, k } for the most recent rank change

  /** Forget rank history (call when the measure or window changes, which isn't a real rank change). */
  function reset() { prevRank = new Map(); moves.clear(); }

  /**
   * @param ranked     full ranking [{ p, n, val, rank }], best first
   * @param dur        transition length (ms)
   * @param cursor     current month key
   * @param trackMoves record rank changes (true only during playback)
   * @param valueHtml  d => html shown on the right of each row
   * @param barFrac    d => bar length, 0..1
   */
  function render({ ranked, dur, cursor, trackMoves, valueHtml, barFrac }) {
    const top = ranked.slice(0, rows);
    if (trackMoves) for (const d of top) {
      const prev = prevRank.get(d.p);
      if (prev !== undefined && prev !== d.rank) moves.set(d.p, { up: prev > d.rank, k: cursor });
    } else moves.clear();
    prevRank = new Map(ranked.map(d => [d.p, d.rank]));
    const arrow = d => {
      const m = moves.get(d.p);
      return m && cursor - m.k < 8 && cursor >= m.k ? `<span class="mv">${m.up ? "▲" : "▼"}</span>` : "";
    };

    // Rows mid-exit are excluded so a precinct that re-enters quickly gets a fresh row
    // instead of reusing one whose exit animation is still running.
    box.selectAll(".row:not(.exiting)").data(top, d => d.p).join(
      enter => enter.append("div").attr("class", "row")
        .style("top", `${rows * rowH}px`).style("opacity", 0)
        .html(d => `<span class="lbl"><b>${d.p}</b> ${HOOD[d.p] || ""} <span style="color:var(--text-muted)">· ${BORO(d.p)}</span></span>
          <span class="val"></span><div class="track"><div class="fill" style="width:0%"></div></div>`)
        .on("mouseenter", (ev, d) => highlight(d.p))
        .on("mouseleave", () => highlight(null)),
      update => update,
      exit => exit.classed("exiting", true).interrupt("pos")
        .transition("exit").duration(dur).style("top", `${rows * rowH}px`).style("opacity", 0).remove()
    ).call(sel => {
      sel.select(".val").html(d => arrow(d) + valueHtml(d));
      sel.transition("pos").duration(dur).ease(d3.easeLinear)
        .style("top", (d, i) => `${i * rowH}px`).style("opacity", 1);
      sel.select(".fill").transition("w").duration(dur).ease(d3.easeLinear)
        .style("width", d => `${Math.min(1, barFrac(d)) * 100}%`);
    });
    return top;
  }

  const highlightRow = p => box.selectAll(".row").classed("hl", d => d.p === p);

  return { render, reset, highlight: highlightRow };
}
