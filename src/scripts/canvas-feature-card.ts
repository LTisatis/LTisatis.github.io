import type { CanvasSurface } from "./html-canvas-adapter";

const controllers = new Map<HTMLElement, () => void>();
const fine = matchMedia("(min-width: 1024px) and (pointer: fine)");
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
// CSS works on every card; only the current interaction owns a GPU surface.
let activeHost: HTMLElement | null = null;
let releaseActive: (() => void) | null = null;

function attach(host: HTMLElement) {
  const queriedSource = host.querySelector<HTMLElement>(".post-card");
  if (!queriedSource) return () => {};
  const source = queriedSource;
  const request = new AbortController();
  const { signal } = request;
  let surface: CanvasSurface | null = null;
  let loading = false;
  let pending: AbortController | null = null;
  let unavailable = false;
  let disposed = false;
  let hovering = false;
  let focused = false;
  let frame = 0;
  let intensity = 0;
  let px = .5;
  let py = .5;
  let lastTime = 0;
  let inView = true;
  const enabled = () => !disposed && fine.matches && !reduced.matches && !document.hidden && inView && document.documentElement.dataset.blogMotion !== "paused" && !/welcome-(pending|active|leaving)/.test(document.documentElement.className);
  const wantsCanvas = () => enabled() && hovering && !source.contains(document.activeElement);
  function releaseCanvas() {
    pending?.abort(); pending = null;
    cancelAnimationFrame(frame); frame = 0;
    intensity = 0; lastTime = 0;
    if (activeHost === host) { activeHost = null; releaseActive = null; }
    const focusedElement = source.contains(document.activeElement) ? document.activeElement as HTMLElement : null;
    surface?.destroy(); surface = null;
    if (focusedElement && document.activeElement !== focusedElement) focusedElement.focus({ preventScroll: true });
  }
  function claimCanvas() {
    if (!wantsCanvas() || unavailable) return;
    if (activeHost !== host) {
      releaseActive?.();
      activeHost = host;
      releaseActive = releaseCanvas;
    }
    void prepare();
  }
  function reset() {
    hovering = false;
    intensity = 0;
    lastTime = 0;
    cancelAnimationFrame(frame); frame = 0;
    host.removeAttribute("data-hover");
    host.style.setProperty("--feature-rx", "0deg");
    host.style.setProperty("--feature-ry", "0deg");
    surface?.render(0, 0, .5, .5);
  }
  function tick(now: number) {
    frame = 0;
    if (!enabled()) { reset(); return; }
    const dt = lastTime ? Math.min(.05, (now-lastTime)/1000) : 1/60;
    lastTime = now;
    intensity += ((hovering ? 1 : 0)-intensity)*(1-Math.exp(-dt*10));
    surface?.render(now/1000, intensity, px, py);
    if (!surface) return;
    if (hovering || intensity > .005) frame = requestAnimationFrame(tick);
    else { intensity = 0; lastTime = 0; surface?.render(0, 0, .5, .5); }
  }
  function wake() { if (!frame && enabled() && surface) frame = requestAnimationFrame(tick); }
  async function prepare() {
    if (!wantsCanvas() || activeHost !== host || loading || unavailable || surface) return;
    loading = true;
    let attempt: AbortController | undefined;
    try {
      const { mountHtmlCanvas } = await import("./html-canvas-adapter");
      if (!wantsCanvas() || activeHost !== host) return;
      attempt = new AbortController(); pending = attempt;
      const result = await mountHtmlCanvas(host, source, () => { unavailable = true; releaseCanvas(); }, attempt.signal);
      if (!enabled() || activeHost !== host || attempt.signal.aborted) { result?.destroy(); return; }
      surface = result;
      unavailable = !result;
      if (!result && activeHost === host) { activeHost = null; releaseActive = null; }
      wake();
    } catch { unavailable = true; }
    finally {
      loading = false; pending = null;
      if (attempt?.signal.aborted && wantsCanvas() && !surface && !unavailable && activeHost === host) queueMicrotask(() => { void prepare(); });
    }
  }
  function sync() {
    host.toggleAttribute("data-motion-paused", !enabled());
    if (!enabled()) { reset(); releaseCanvas(); }
    else if (hovering) claimCanvas();
  }
  host.addEventListener("pointermove", (event) => {
    if (!enabled() || event.pointerType === "touch") return;
    const rect = host.getBoundingClientRect();
    px = Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width));
    py = Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height));
    hovering = true;
    host.setAttribute("data-hover", "");
    host.style.setProperty("--feature-x", `${px*100}%`);
    host.style.setProperty("--feature-y", `${py*100}%`);
    host.style.setProperty("--feature-rx", `${(0.5-py)*6}deg`);
    host.style.setProperty("--feature-ry", `${(px-0.5)*8}deg`);
    claimCanvas(); wake();
  }, { passive: true, signal });
  host.addEventListener("pointerleave", () => {
    hovering = false;
    host.removeAttribute("data-hover");
    host.style.setProperty("--feature-rx", "0deg");
    host.style.setProperty("--feature-ry", "0deg");
    if (focused && surface) wake(); else releaseCanvas();
  }, { signal });
  host.addEventListener("focusin", () => {
    focused = true;
    pending?.abort(); surface?.repaint();
  }, { signal });
  host.addEventListener("focusout", (event) => {
    if (event.relatedTarget instanceof Node && host.contains(event.relatedTarget)) return;
    focused = false;
    if (hovering) claimCanvas(); else releaseCanvas();
  }, { signal });
  const resize = new ResizeObserver(() => surface?.resize());
  resize.observe(host);
  const visible = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; sync(); });
  visible.observe(host);
  const theme = new MutationObserver(() => { sync(); surface?.repaint(); });
  theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  fine.addEventListener("change", sync, { signal });
  reduced.addEventListener("change", sync, { signal });
  document.addEventListener("visibilitychange", sync, { signal });
  document.addEventListener("blog:motionchange", sync, { signal });
  for (const image of source.querySelectorAll("img")) image.addEventListener("load", () => surface?.resize(), { signal });
  void document.fonts.ready.then(() => { if (!disposed) surface?.resize(); });
  const timer = window.setTimeout(sync, 800);
  return () => {
    disposed = true;
    clearTimeout(timer); reset(); request.abort();
    resize.disconnect(); visible.disconnect(); theme.disconnect();
    releaseCanvas();
  };
}
function setup() {
  for (const [host, destroy] of controllers) if (!host.isConnected) { destroy(); controllers.delete(host); }
  for (const host of document.querySelectorAll<HTMLElement>("[data-canvas-feature]")) {
    if (!controllers.has(host)) controllers.set(host, attach(host));
  }
}
function cleanup() { for (const destroy of controllers.values()) destroy(); controllers.clear(); }
let hooked = false;
function hookNavigation() {
  if (hooked || !window.swup?.hooks) return;
  hooked = true;
  window.swup.hooks.on("content:replace", cleanup, { before: true });
  window.swup.hooks.on("page:view", setup);
}
setup(); hookNavigation();
document.addEventListener("swup:enable", hookNavigation);
window.addEventListener("pagehide", cleanup);
window.addEventListener("pageshow", setup);
