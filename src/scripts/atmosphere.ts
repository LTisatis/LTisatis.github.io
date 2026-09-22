import confetti from "canvas-confetti";

const motionButton = document.querySelector<HTMLButtonElement>("#motion-toggle");
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const pointer = matchMedia("(pointer: fine)");
const desktopScene = matchMedia("(min-width: 1024px)");
const videos = [...document.querySelectorAll<HTMLVideoElement>("[data-ambient-video]")];
const layers = [...document.querySelectorAll<HTMLElement>("[data-depth]")];
const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const save = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* Storage can be unavailable in private contexts. */ } };
let paused = read("blog-motion-paused") === "true";
let frame = 0;
let x = 0;
let y = 0;
let tx = 0;
let ty = 0;
const stopped = () => paused || reduced.matches;
function animate() {
  x += (tx - x) * 0.045;
  y += (ty - y) * 0.045;
  for (const layer of layers) {
    const depth = Number(desktopScene.matches ? (layer.dataset.desktopDepth ?? layer.dataset.depth) : layer.dataset.depth);
    layer.style.translate = `${x * depth}px ${y * depth * 0.65}px`;
  }
  if (Math.abs(tx-x) + Math.abs(ty-y) > 0.001) frame = requestAnimationFrame(animate);
  else frame = 0;
}
function target(a: number, b: number) { tx = a; ty = b; if (!frame) frame = requestAnimationFrame(animate); }
function syncMotion() {
  if (motionButton) { motionButton.textContent = stopped() ? "动效已暂停" : "暂停动效"; motionButton.setAttribute("aria-pressed", String(stopped())); }
  if (stopped() || document.hidden) {
    cancelAnimationFrame(frame); frame=0; x=0; y=0; tx=0; ty=0;
    for (const layer of layers) layer.style.translate = "0px 0px";
    for (const video of videos) video.pause();
    confetti.reset();
  } else {
    for (const video of videos) {
      video.muted = true;
      void video.play().catch(() => { if (motionButton) motionButton.textContent = "点击启用动效"; });
    }
  }
}
document.addEventListener("pointermove", e => { if (!stopped() && pointer.matches) target((e.clientX/innerWidth-0.5)*2, (e.clientY/innerHeight-0.5)*2); }, { passive: true });
document.documentElement.addEventListener("pointerleave", () => target(0,0));
motionButton?.addEventListener("click", () => { paused=!paused; save("blog-motion-paused",String(paused)); syncMotion(); });
reduced.addEventListener("change",syncMotion);
document.addEventListener("visibilitychange",syncMotion);
let lastBurst=0;
document.addEventListener("click", e => {
  if (stopped() || e.detail===0 || performance.now()-lastBurst<90 || (e.target instanceof Element && e.target.closest("input,textarea,select,#motion-toggle"))) return;
  lastBurst=performance.now();
  void confetti({ particleCount: 14, spread: 360, startVelocity: 11, gravity: 0.45, ticks: 45, scalar: 0.65, shapes: ["circle","star"], colors: ["#f5a8c3","#ffcf7b","#b8dccc","#b8a7d9"], origin: {x:e.clientX/innerWidth,y:e.clientY/innerHeight}, disableForReducedMotion: true, zIndex: 90 });
});
syncMotion();

const audio = document.querySelector<HTMLAudioElement>("#background-audio");
const toggle = document.querySelector<HTMLButtonElement>("#music-toggle");
const expand = document.querySelector<HTMLButtonElement>("#music-expand");
const details = document.querySelector<HTMLElement>("#music-details");
const seek = document.querySelector<HTMLInputElement>("#music-seek");
const volume = document.querySelector<HTMLInputElement>("#music-volume");
const status = document.querySelector<HTMLElement>("#music-status");
const time = document.querySelector<HTMLElement>("#music-time");
const autoplayHint = document.querySelector<HTMLElement>("#music-autoplay-hint");
if (audio && toggle && expand && details && seek && volume && status && time) {
  const storedVolume=Number(read("blog-volume") ?? "0.35");
  audio.volume=Number.isFinite(storedVolume) ? Math.max(0,Math.min(1,storedVolume)) : 0.35;
  volume.value=String(audio.volume);
  toggle.addEventListener("click", async () => {
    if (!audio.paused) audio.pause();
    else { status.textContent="正在加载音乐…"; try { await audio.play(); } catch { status.textContent="暂时无法播放，请再次点击重试。"; } }
  });
  function reflect() {
    if (!audio || !toggle || !status) return;
    if (autoplayHint && !audio.paused) autoplayHint.hidden=true;
    toggle.setAttribute("aria-label",audio.paused ? "播放背景音乐" : "暂停背景音乐");
    toggle.setAttribute("aria-pressed",String(!audio.paused));
    status.textContent=audio.paused ? "音乐已暂停" : "正在播放 · 单曲循环";
  }
  audio.addEventListener("play",reflect); audio.addEventListener("pause",reflect);
  audio.addEventListener("error",()=>{status.textContent="音乐加载失败，请刷新后重试。";});
  audio.addEventListener("timeupdate",()=>{ if (Number.isFinite(audio.duration)) seek.value=String(audio.currentTime/audio.duration*100); time.textContent=`${Math.floor(audio.currentTime/60)}:${String(Math.floor(audio.currentTime%60)).padStart(2,"0")}`; });
  seek.addEventListener("input",()=>{if(Number.isFinite(audio.duration)) audio.currentTime=Number(seek.value)/100*audio.duration;});
  volume.addEventListener("input",()=>{audio.volume=Number(volume.value);save("blog-volume",volume.value);});
  expand.addEventListener("click",()=>{details.hidden=!details.hidden;expand.setAttribute("aria-expanded",String(!details.hidden));expand.setAttribute("aria-label",details.hidden ? "展开播放器" : "收起播放器");expand.textContent=details.hidden ? "⌃" : "⌄";});
  // Attempt audible playback; browser policy may require the explicit play button.
  void audio.play().catch(() => {
    if (autoplayHint) autoplayHint.hidden=false;
    status.textContent="点击播放按钮开启音乐。";
  });
}
