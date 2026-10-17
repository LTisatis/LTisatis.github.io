export type PuppetState = "static" | "paused" | "running";

/** Reduced motion always wins. A user pause freezes an existing pose. */
export function puppetState(paused: boolean, reduced: boolean, hidden: boolean): PuppetState {
  if (reduced) return "static";
  return paused || hidden ? "paused" : "running";
}

export function createCharacterMotion(roots: HTMLElement[]) {
  for (const root of roots) {
    if (root.dataset.puppetBound) continue;
    root.dataset.puppetBound = "true";
    const parts = [...root.querySelectorAll<HTMLImageElement>("img")];
    let failed = false;
    function fallback() {
      if (failed) return;
      failed = true;
      root.dataset.puppetFailed = "true";
      root.dataset.puppetState = "static";
      const image = document.createElement("img");
      image.className = "puppet-fallback";
      image.alt = "";
      image.width = 1407;
      image.height = 1118;
      image.src = root.dataset.fallback ?? "";
      root.replaceChildren(image);
    }
    for (const part of parts) {
      part.addEventListener("error", fallback, { once: true });
      if (part.complete && part.naturalWidth === 0) fallback();
    }
  }
  return {
    sync(paused: boolean, reduced: boolean, hidden: boolean) {
      const state = puppetState(paused, reduced, hidden);
      for (const root of roots) {
        if (root.dataset.puppetFailed) continue;
        // Do not apply negative animation delays before the first enabled frame.
        if (state === "paused" && root.dataset.puppetState === "static") continue;
        root.dataset.puppetState = state;
      }
    },
  };
}
