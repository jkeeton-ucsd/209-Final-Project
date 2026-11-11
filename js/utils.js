// Small formatting and math helpers shared by every chart. Uses the global `d3` loaded in index.html.

/** Read a CSS custom property (theme token) from :root, e.g. css("--sub"). */
export const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** 0.248 -> "25%" (or "24.8%" with d = 1). */
export const pct = (v, d = 0) => (v * 100).toFixed(d) + "%";

/** 55123 -> "$55k"; top-coded at $200k to match the Census brackets. */
export const usd = v => v >= 200000 ? "$200k+" : "$" + Math.round(v / 1000) + "k";

export const fmtMonth = d3.timeFormat("%B %Y");
export const fmtShort = d3.timeFormat("%b %Y");

/** Months are handled as integer keys (year * 12 + month) so windows are simple subtraction. */
export const mkey = d => d.getFullYear() * 12 + d.getMonth();
export const kdate = k => new Date(Math.floor(k / 12), k % 12, 1);

/** Pearson correlation. */
export function corr(xs, ys) {
  const mx = d3.mean(xs), my = d3.mean(ys);
  const num = d3.sum(xs, (x, i) => (x - mx) * (ys[i] - my));
  return num / Math.sqrt(d3.sum(xs, x => (x - mx) ** 2) * d3.sum(ys, y => (y - my) ** 2));
}
