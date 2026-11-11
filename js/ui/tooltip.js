// One shared tooltip element (#tooltip) for every chart.
const tip = () => document.getElementById("tooltip");

/** Show `html` next to the pointer, flipping sides near the viewport edge. */
export function showTip(ev, html) {
  const el = tip();
  el.innerHTML = html;
  el.style.opacity = 1;
  const pad = 14, r = el.getBoundingClientRect();
  let x = ev.clientX + pad, y = ev.clientY + pad;
  if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - pad;
  if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - pad;
  el.style.left = x + "px";
  el.style.top = y + "px";
}

export function hideTip() { tip().style.opacity = 0; }
