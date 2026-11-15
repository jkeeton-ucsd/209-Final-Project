// The reader's home neighborhood: chosen once near the top, then followed through every section.
// Charts subscribe with onHome(fn); every picker on the page (class "home-select") stays in sync.
import { HOOD, BORO } from "../config.js";

const KEY = "nypd-home-precinct";
const listeners = [];
let home = null;

/** Current home precinct number, or null. */
export const getHome = () => home;

/** Subscribe; fn(p) runs now and whenever the home precinct changes (p may be null). */
export function onHome(fn) { listeners.push(fn); fn(home); }

export function setHome(p) {
  home = p == null || Number.isNaN(p) ? null : p;
  try { home == null ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, String(home)); } catch { /* storage blocked: fine */ }
  document.querySelectorAll(".home-select").forEach(sel => { sel.value = home == null ? "" : String(home); });
  listeners.forEach(fn => fn(home));
}

/**
 * Fill every .home-select with the precincts that have residents, grouped by borough, and restore a saved choice.
 * @param {number[]} precincts  precinct numbers to offer
 */
export function initHomePickers(precincts) {
  const boros = d3.groups(precincts, BORO);
  d3.selectAll(".home-select").each(function () {
    const sel = d3.select(this);
    sel.selectAll("*").remove();
    sel.append("option").attr("value", "").text("Choose your neighborhood…");
    for (const [boro, ps] of boros) {
      sel.append("optgroup").attr("label", boro).selectAll("option")
        .data(ps.sort((a, b) => (HOOD[a] || "").localeCompare(HOOD[b] || ""))).join("option")
        .attr("value", p => p).text(p => `${HOOD[p] || "Precinct " + p} (${p})`);
    }
    sel.on("change", ev => setHome(ev.target.value === "" ? null : +ev.target.value));
  });
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch { /* storage blocked */ }
  if (saved && precincts.includes(+saved)) setHome(+saved);
}
