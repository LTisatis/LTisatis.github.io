// Keep decorative downloads out of the initial page load, then start one at a time.
export function createAmbientPlayback(videos: HTMLVideoElement[], active: () => boolean) {
  const visible = new Set<HTMLVideoElement>();
  let ready = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function play(video: HTMLVideoElement) {
    video.muted = true;
    void video.play().then(() => {
      if (!active() || document.hidden || !visible.has(video)) video.pause();
    }).catch(() => { /* Leave the poster visible if playback is unavailable. */ });
  }

  function sync() {
    if (timer !== undefined) { clearTimeout(timer); timer = undefined; }
    const enabled = ready && active() && !document.hidden;
    for (const video of videos) {
      if (!enabled || !visible.has(video)) video.pause();
      else if (video.hasAttribute("src") && video.paused) play(video);
    }
    if (!enabled) return;
    const next = videos.find(video => visible.has(video) && !video.hasAttribute("src") && video.dataset.src);
    if (!next) return;
    timer = setTimeout(() => {
      timer = undefined;
      if (!active() || document.hidden || !visible.has(next)) { sync(); return; }
      next.src = next.dataset.src ?? "";
      play(next);
      sync();
    }, 400);
  }

  if (typeof IntersectionObserver === "function") {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const video = entry.target as HTMLVideoElement;
        if (entry.isIntersecting) visible.add(video);
        else visible.delete(video);
      }
      sync();
    });
    for (const video of videos) observer.observe(video);
  } else {
    for (const video of videos) visible.add(video);
  }

  const defer = () => { setTimeout(() => { ready = true; sync(); }, 1200); };
  if (document.readyState === "complete") defer();
  else window.addEventListener("load", defer, { once: true });
  return { sync };
}
