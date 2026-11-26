// Scroll reveals: text, figures and section breaks ease in as they enter the viewport.
// Content is only hidden once this script has run (the "reveal-on" class), so the page still reads
// without JavaScript, and readers who prefer reduced motion get everything immediately.
export function initReveal() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;

  const targets = document.querySelectorAll(
    ".hero > *, .prose > :not(.callouts), .callout, .figure, .section-break"
  );
  document.documentElement.classList.add("reveal-on");

  const io = new IntersectionObserver(entries => {
    // items that arrive together get a short stagger, in reading order
    const shown = entries.filter(e => e.isIntersecting).map(e => e.target);
    shown.forEach((el, i) => {
      el.style.transitionDelay = `${Math.min(i, 4) * 90}ms`;
      el.classList.add("revealed");
      io.unobserve(el);
      // drop the delay afterwards so later hover/transition styles aren't held back
      el.addEventListener("transitionend", () => { el.style.transitionDelay = ""; }, { once: true });
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0 });

  targets.forEach(el => { el.classList.add("reveal"); io.observe(el); });
}
