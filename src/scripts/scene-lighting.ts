type BurstDetail = { x: number; y: number; index?: number; strength?: number };
type PulseState = { started: number; from: number; peak: number; scaleFrom: number; scalePeak: number };

/** A short attack and one bounded fade, matching the compositor animation. */
export function pulseOpacityAt(elapsed: number, startOpacity: number, peakOpacity: number) {
  const peak = Math.max(0, Math.min(.16, Number.isFinite(peakOpacity) ? peakOpacity : 0));
  const start = Math.max(0, Math.min(peak, Number.isFinite(startOpacity) ? startOpacity : 0));
  if (!Number.isFinite(elapsed) || elapsed >= 1500) return 0;
  if (elapsed <= 0) return start;
  if (elapsed < 120) return start + (peak - start) * elapsed / 120;
  return peak * Math.max(0, 1 - (elapsed - 120) / 1380);
}

/** Repeated clicks continue the current radius instead of shrinking the light. */
export function pulseScaleAt(elapsed: number, from = .72, peak = .86) {
  const start = Math.max(.72, Math.min(1.08, Number.isFinite(from) ? from : .72));
  const middle = Math.max(start, Math.min(1.08, Number.isFinite(peak) ? peak : .86));
  if (!Number.isFinite(elapsed) || elapsed <= 0) return start;
  if (elapsed < 120) return start + (middle - start) * elapsed / 120;
  return middle + (1.08 - middle) * Math.min(1, (elapsed - 120) / 1380);
}

export function createSceneLighting() {
  const root = document.documentElement;
  const hostElement = document.querySelector<HTMLElement>("[data-scene-lighting]");
  const pulseElement = hostElement?.querySelector<HTMLElement>("[data-scene-pulse]");
  if (!hostElement || !pulseElement || hostElement.dataset.sceneLightingReady === "true") return;
  const host = hostElement;
  const pulse = pulseElement;
  host.dataset.sceneLightingReady = "true";
  const request = new AbortController();
  const { signal } = request;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const local = ["localhost", "127.0.0.1"].includes(location.hostname);
  let animation: Animation | null = null;
  let pulseState: PulseState | null = null;
  let pulseCount = 0;
  let disposed = false;
  function lightState() {
    if (/welcome-(pending|active|leaving)/.test(root.className)) return "welcome";
    if (document.hidden || reduced.matches || root.dataset.blogMotion !== "running") return "paused";
    return "running";
  }
  function clearPulse() {
    animation?.cancel();
    animation = null;
    pulseState = null;
    host.dataset.scenePulseActive = "false";
  }
  function sync() {
    if (disposed) return;
    const state = lightState();
    host.dataset.sceneLightState = state;
    if (state !== "running") clearPulse();
  }
  function burst(event: Event) {
    if (disposed || lightState() !== "running") return;
    const detail = (event as CustomEvent<Partial<BurstDetail>>).detail;
    if (!detail) return;
    const { x: pointX, y: pointY } = detail;
    if (typeof pointX !== "number" || typeof pointY !== "number" || !Number.isFinite(pointX) || !Number.isFinite(pointY)) return;
    const strength = detail.strength === undefined ? 1 : Math.max(0, Math.min(1, Number.isFinite(detail.strength) ? detail.strength : 0));
    if (!strength) return;
    const now = performance.now();
    const continuing = pulseState !== null;
    const from = pulseState ? pulseOpacityAt(now - pulseState.started, pulseState.from, pulseState.peak) : 0;
    const peak = Math.max(from, .16 * strength);
    const scaleFrom = pulseState ? pulseScaleAt(now - pulseState.started, pulseState.scaleFrom, pulseState.scalePeak) : .72;
    const scalePeak = Math.max(scaleFrom, .86);
    animation?.cancel();
    pulseState = { started: now, from, peak, scaleFrom, scalePeak };
    const x = Math.max(0, Math.min(innerWidth, pointX));
    const y = Math.max(0, Math.min(innerHeight, pointY));
    pulse.style.transition = continuing ? "left 250ms ease, top 250ms ease" : "none";
    pulse.style.left = `${x}px`;
    pulse.style.top = `${y}px`;
    host.dataset.scenePulseActive = "true";
    pulseCount++;
    if (local) {
      host.dataset.scenePulseCount = String(pulseCount);
      host.dataset.scenePulseOrigin = JSON.stringify({ x, y, index: detail.index });
      host.dataset.scenePulsePeak = String(peak);
    }
    try {
      const next = pulse.animate([
        { opacity: from, transform: `translate(-50%, -50%) scale(${scaleFrom})` },
        { opacity: peak, transform: `translate(-50%, -50%) scale(${scalePeak})`, offset: .08 },
        { opacity: 0, transform: "translate(-50%, -50%) scale(1.08)" },
      ], { duration: 1500, easing: "linear" });
      animation = next;
      next.onfinish = () => { if (animation === next) clearPulse(); };
    } catch { clearPulse(); }
  }
  const observer = new MutationObserver(sync);
  observer.observe(root, { attributes: true, attributeFilter: ["class"] });
  document.addEventListener("blog:scene-burst", burst, { signal });
  document.addEventListener("blog:motionchange", sync, { signal });
  document.addEventListener("visibilitychange", sync, { signal });
  reduced.addEventListener("change", sync, { signal });
  let hooked = false;
  function onPage() { clearPulse(); sync(); }
  function hookNavigation() {
    if (hooked || !window.swup?.hooks) return;
    hooked = true;
    window.swup.hooks.on("page:view", onPage);
  }
  hookNavigation();
  document.addEventListener("swup:enable", hookNavigation, { signal });
  window.addEventListener("pagehide", () => { clearPulse(); host.dataset.sceneLightState = "paused"; }, { signal });
  window.addEventListener("pageshow", sync, { signal });
  if (local) host.dataset.scenePulseCount = "0";
  clearPulse(); sync();
  return {
    sync,
    destroy() {
      disposed = true;
      clearPulse();
      request.abort(); observer.disconnect();
      if (hooked) window.swup?.hooks?.off?.("page:view", onPage);
      host.removeAttribute("data-scene-lighting-ready");
    },
  };
}

if (typeof document !== "undefined") createSceneLighting();
