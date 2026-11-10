/** Native DOM panels share the article cards' light treatment, without canvas. */
export {};
const panels = new Map<HTMLElement, () => void>();
const pointer = matchMedia("(min-width: 1024px) and (pointer: fine)");
const reduce = matchMedia("(prefers-reduced-motion: reduce)");
const panelSelector = ".card-base, .friend-card, .section-intro, .music-player, .float-panel, #toc-inner-wrapper";
const inputSelector = "input, textarea, select, [contenteditable]";

function attachPanel(host: HTMLElement) {
  const request = new AbortController();
  const { signal } = request;
  const originalPosition = host.style.position;
  if (getComputedStyle(host).position === "static") host.style.position = "relative";
  host.setAttribute("data-panel-interactive", "");
  const enabled = () => pointer.matches && !reduce.matches && !document.hidden
    && document.documentElement.dataset.blogMotion !== "paused"
    && !/welcome-(pending|active|leaving)/.test(document.documentElement.className);
  const nearest = (target: EventTarget | null) => target instanceof Element ? target.closest("[data-panel-interactive], [data-canvas-feature]") : null;
  function reset() {
    host.removeAttribute("data-panel-hover");
    host.removeAttribute("data-panel-tilting");
    host.style.setProperty("--panel-rx", "0deg");
    host.style.setProperty("--panel-ry", "0deg");
  }
  function sync() {
    host.toggleAttribute("data-panel-paused", !enabled());
    if (!enabled()) reset();
  }
  host.addEventListener("pointermove", (event) => {
    if (!enabled() || event.pointerType === "touch" || nearest(event.target) !== host) { reset(); return; }
    const rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    host.style.setProperty("--feature-x", `${x * 100}%`);
    host.style.setProperty("--feature-y", `${y * 100}%`);
    host.setAttribute("data-panel-hover", "");
    // A reader typing or adjusting a slider needs a stationary control.
    const editing = (event.target instanceof Element && event.target.closest(inputSelector)) || (host.contains(document.activeElement) && document.activeElement?.matches(inputSelector));
    const entering = host.getAnimations().some(animation => animation instanceof CSSAnimation && animation.playState === "running");
    if (editing || entering) {
      host.removeAttribute("data-panel-tilting");
      return;
    }
    if (!host.hasAttribute("data-panel-tilting")) {
      // Preserve translation; quick re-entry must not sample our return motion.
      const returning = host.getAnimations().find(animation => animation instanceof CSSTransition && animation.transitionProperty === "transform");
      const destination = (returning?.effect as KeyframeEffect | null)?.getKeyframes().at(-1)?.transform;
      const transform = typeof destination === "string" ? destination : getComputedStyle(host).transform;
      host.style.setProperty("--panel-base-transform", transform === "none" ? "translate(0)" : transform);
    }
    const restrained = host.matches(".music-player, #navbar > .card-base, .float-panel, #toc-inner-wrapper");
    const limit = restrained ? 0.8 : 4;
    const limitX = Math.min(limit, 600 / rect.height);
    const limitY = Math.min(limit, 900 / rect.width);
    host.style.setProperty("--panel-rx", `${(0.5 - y) * 2 * limitX}deg`);
    host.style.setProperty("--panel-ry", `${(x - 0.5) * 2 * limitY}deg`);
    host.setAttribute("data-panel-tilting", "");
  }, { passive: true, signal });
  host.addEventListener("pointerleave", reset, { signal });
  host.addEventListener("focusin", (event) => {
    reset();
    host.toggleAttribute("data-panel-focus", nearest(event.target) === host);
  }, { signal });
  host.addEventListener("focusout", (event) => {
    if (nearest(event.relatedTarget) !== host) host.removeAttribute("data-panel-focus");
  }, { signal });
  pointer.addEventListener("change", sync, { signal });
  reduce.addEventListener("change", sync, { signal });
  document.addEventListener("visibilitychange", sync, { signal });
  document.addEventListener("blog:motionchange", sync, { signal });
  const state = new MutationObserver(sync);
  state.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-blog-motion"] });
  sync();
  return () => {
    request.abort();
    state.disconnect();
    reset();
    host.removeAttribute("data-panel-interactive");
    host.removeAttribute("data-panel-paused");
    host.removeAttribute("data-panel-focus");
    host.style.position = originalPosition;
    for (const name of ["--panel-base-transform", "--panel-rx", "--panel-ry", "--feature-x", "--feature-y"]) host.style.removeProperty(name);
  };
}

function collectPanels(root: ParentNode) {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>(panelSelector));
  if (root instanceof HTMLElement && root.matches(panelSelector)) candidates.unshift(root);
  for (const host of candidates) {
    if (!host.isConnected || host.closest("[data-canvas-feature]") || panels.has(host)) continue;
    panels.set(host, attachPanel(host));
  }
}
function setupPanels() {
  for (const [host, destroy] of panels) if (!host.isConnected) { destroy(); panels.delete(host); }
  collectPanels(document);
}
function clearPanels() { for (const destroy of panels.values()) destroy(); panels.clear(); }
let hooked = false;
function hookPanels() {
  if (hooked || !window.swup?.hooks) return;
  hooked = true;
  window.swup.hooks.on("content:replace", clearPanels, { before: true });
  window.swup.hooks.on("page:view", setupPanels);
}
setupPanels(); hookPanels();
// Islands and comment clients can insert panels after page:view. Inspect only
// added element subtrees, with one combined pass for each mutation batch.
const addedRoots = new Set<Element>();
let scanQueued = false;
const inserted = new MutationObserver(records => {
  for (const record of records) for (const node of record.addedNodes) if (node instanceof Element) addedRoots.add(node);
  if (scanQueued || !addedRoots.size) return;
  scanQueued = true;
  queueMicrotask(() => {
    scanQueued = false;
    for (const [host, destroy] of panels) if (!host.isConnected) { destroy(); panels.delete(host); }
    for (const root of addedRoots) if (root.isConnected) collectPanels(root);
    addedRoots.clear();
  });
});
inserted.observe(document.body, { childList: true, subtree: true });
document.addEventListener("swup:enable", hookPanels);
window.addEventListener("pagehide", clearPanels);
window.addEventListener("pageshow", setupPanels);
