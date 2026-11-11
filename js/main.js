// Entry point: load data → build the model → fill the prose → set up each chart → draw.
import { MIN_N } from "./config.js";
import { loadData, buildModel } from "./data.js";
import { fillNarrative } from "./narrative.js";
import { createMapBase } from "./charts/map-base.js";
import { initWhereMap } from "./charts/where-map.js";
import { initOutcomes } from "./charts/outcomes.js";
import { createSidePanel } from "./charts/side-panel.js";
import { initRateMap } from "./charts/rate-map.js";
import { initScatter } from "./charts/scatter.js";
import { initDumbbell } from "./charts/dumbbell.js";

async function main() {
  const status = document.getElementById("status");
  let raw;
  try {
    raw = await loadData();
  } catch (e) {
    status.innerHTML = `<span class="error">Couldn't load the data/ files. Serve this folder over HTTP (for example, <code>python -m http.server</code>) instead of opening the file directly.</span>`;
    return;
  }

  const model = buildModel(raw);
  fillNarrative(model);

  const base = createMapBase(model.geo);       // shared projection + labels for both maps
  const side = createSidePanel(model);         // shared by the Act 2 map and the Act 3 scatter
  const charts = {
    where: initWhereMap(model, base),          // Act 1
    outcomes: initOutcomes(model),             // Act 2a
    rateMap: initRateMap(model, base, side),   // Act 2b
    scatter: initScatter(model, side),         // Act 3a
    dumbbell: initDumbbell(model),             // Act 3b
  };

  // Full redraw; also re-run when the OS theme flips, since chart colors are read from CSS tokens.
  const renderAll = () => {
    Object.values(charts).forEach(c => c.render(0));
    side.restore();
  };
  renderAll();
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", renderAll);

  status.textContent = `${model.alleg.length.toLocaleString()} allegations in ${model.totalComplaints.toLocaleString()} complaints, 2000–2019. ` +
    `${model.reliable.length} of 77 precincts have ≥ ${MIN_N} allegations.`;

  window.app = { model, charts };   // handy for debugging in the browser console
}

main();
