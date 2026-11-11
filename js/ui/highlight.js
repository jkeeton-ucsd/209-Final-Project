// Linked highlighting: hovering a precinct in any chart highlights it in every chart that subscribed.
const listeners = [];

/** Subscribe; `fn(p)` receives a precinct number, or null when the highlight clears. */
export const onHighlight = fn => { listeners.push(fn); };

/** Broadcast a highlight (or null to clear). */
export const highlight = p => { listeners.forEach(fn => fn(p)); };
