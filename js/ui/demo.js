// Demo mode for recording the project video. Off unless the URL has ?demo, so readers never see it.
//
//   ?demo                 fresh start: clears any saved neighborhood so it can be picked on camera
//   ?demo&home=73         start with a neighborhood already chosen (precinct number; 73 = Brownsville)
//   &speed=60             Act 1 playback, ms per month (default 60 in demo mode, ~15 s for 20 years; normal is 300)
//   &theme=light|dark     force a theme regardless of the OS setting
//
// Keys (ignored while typing in a field):
//   1–6   glide to a scene: 1 title · 2 Act 1 map · 3 Act 2 guess map · 4 Act 3 scatter · 5 complaint mix · 6 takeaway
//   S     spotlight the current scene (dims everything around it); press again to turn off
//   P     play / pause the Act 1 animation without moving the mouse to the button
//   H     hide / show the mouse cursor
//   ?     show / hide this key list (hidden by default so it stays out of the recording)
import { setHome } from "./home.js";

const SCENES = [
  { name: "Title", el: () => document.querySelector(".hero") },
  { name: "Act 1 map", el: () => document.querySelector("#act1 .figure") },
  { name: "Act 2 guess", el: () => document.querySelector("#act2 .figure") },
  { name: "Act 3 scatter", el: () => document.querySelector("#act3 .figure") },
  { name: "Complaint mix", el: () => document.getElementById("mix").closest(".figure") },
  { name: "Takeaway", el: () => document.querySelector("section.takeaway") },
];

/** Turn demo mode on if the URL asks for it. Call after the charts and home pickers exist. */
export function initDemo(charts, precincts) {
  const q = new URLSearchParams(location.search);
  if (!q.has("demo")) return;
  const root = document.documentElement;
  root.classList.add("demo");

  const theme = q.get("theme");
  if (theme === "light" || theme === "dark") root.dataset.theme = theme;   // charts re-read colors below

  const home = +q.get("home");
  setHome(precincts.includes(home) ? home : null);

  charts.where.state.speed = +q.get("speed") || 60;
  if (theme) Object.values(charts).forEach(c => c.render(0));

  // ---- scene glide: a slow ease-in-out reads better on video than the browser's quick smooth scroll ----
  const navH = () => document.querySelector(".site-nav")?.offsetHeight || 0;
  let scene = 0, anim = null;
  function glide(i) {
    scene = i;
    const el = SCENES[i].el();
    const from = scrollY, to = i === 0 ? 0 : Math.max(0, el.getBoundingClientRect().top + scrollY - navH() - 16);
    const dur = Math.min(1600, 600 + Math.abs(to - from) * 0.25), t0 = performance.now();
    cancelAnimationFrame(anim);
    const step = now => {
      const t = Math.min(1, (now - t0) / dur), e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      scrollTo(0, from + (to - from) * e);
      if (t < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }

  // ---- spotlight: a hole in a dark overlay, tracking the scene's element as the page scrolls ----
  const spot = document.body.appendChild(document.createElement("div"));
  spot.className = "demo-spot";
  let spotOn = false;
  function track() {
    if (!spotOn) return;
    const r = SCENES[scene].el().getBoundingClientRect(), pad = 14;
    Object.assign(spot.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    requestAnimationFrame(track);
  }
  const setSpot = on => { spotOn = on; spot.classList.toggle("on", on); if (on) track(); };

  // ---- key list ----
  const help = document.body.appendChild(document.createElement("div"));
  help.className = "demo-help";
  help.innerHTML = `<b>Demo mode</b><br>${SCENES.map((s, i) => `${i + 1} ${s.name}`).join("<br>")}` +
    `<br>S spotlight · P play/pause<br>H hide cursor · ? close`;

  addEventListener("keydown", ev => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.target.closest("input, select, textarea")) return;
    const k = ev.key.toLowerCase();
    if (k >= "1" && k <= String(SCENES.length)) { glide(+k - 1); if (spotOn) track(); }
    else if (k === "s") setSpot(!spotOn);
    else if (k === "p") charts.where.state.playing ? charts.where.pause() : charts.where.play();
    else if (k === "h") root.classList.toggle("demo-nocursor");
    else if (k === "?") help.classList.toggle("on");
    else return;
    ev.preventDefault();
  });
}
