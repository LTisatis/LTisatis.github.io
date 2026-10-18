import confetti from "canvas-confetti";
import { createAmbientPlayback } from "./ambient-media";
import { createCharacterMotion } from "./character-motion";

const motionButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-motion-toggle]")];
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const pointer = matchMedia("(pointer: fine)");
const desktopScene = matchMedia("(min-width: 1024px)");
const videos = [...document.querySelectorAll<HTMLVideoElement>("[data-ambient-video]")];
const layers = [...document.querySelectorAll<HTMLElement>("[data-depth]")];
let charactersSettled = false;
const characters = createCharacterMotion([...document.querySelectorAll<HTMLElement>("[data-character]")], () => {
  charactersSettled = true;
  ambient.sync();
});
const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const save = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* Storage can be unavailable in private contexts. */ } };
const savedMotion = read("blog-motion-paused");
const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
let explicitMotion = savedMotion === "true" || savedMotion === "false";
let paused = savedMotion === "true" || (savedMotion !== "false" && (!desktopScene.matches || connection?.saveData === true));
let frame = 0;
let x = 0;
let y = 0;
let tx = 0;
let ty = 0;
const reading = () => !desktopScene.matches && !!document.querySelector("#post-container");
const stopped = () => paused || reduced.matches || reading();
// Mobile reading keeps posters even when the visitor enables character motion.
const ambient = createAmbientPlayback(videos, () => !stopped() && desktopScene.matches && charactersSettled);
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
function target(a: number, b: number) { tx = a; ty = b; characters.pointer(a,b); if (!frame) frame = requestAnimationFrame(animate); }
function syncMotion() {
  ambient.sync();
  characters.sync(paused || reading(), reduced.matches, document.hidden);
  for (const button of motionButtons) {
    button.textContent = reduced.matches ? "已减少动效" : reading() ? "阅读时已暂停动效" : paused ? "开启动效" : "暂停动效";
    button.setAttribute("aria-pressed", String(stopped()));
    button.disabled = reduced.matches || reading();
  }
  if (stopped() || document.hidden) {
    cancelAnimationFrame(frame); frame=0; x=0; y=0; tx=0; ty=0;
    for (const layer of layers) layer.style.translate = "0px 0px";
    confetti.reset();
  }
}
document.addEventListener("pointermove", e => { if (!stopped() && !document.hidden && pointer.matches) target((e.clientX/innerWidth-0.5)*2, (e.clientY/innerHeight-0.5)*2); }, { passive: true });
document.documentElement.addEventListener("pointerleave", () => { if (!stopped() && !document.hidden) target(0,0); });
for (const button of motionButtons) button.addEventListener("click", () => { explicitMotion=true; paused=!paused; save("blog-motion-paused",String(paused)); syncMotion(); });
reduced.addEventListener("change",syncMotion);
desktopScene.addEventListener("change", () => {
  if (!explicitMotion) paused = !desktopScene.matches || connection?.saveData === true;
  syncMotion();
});
document.addEventListener("visibilitychange",syncMotion);
let lastBurst=0;
document.addEventListener("click", e => {
  if (stopped() || e.detail===0 || performance.now()-lastBurst<90 || (e.target instanceof Element && e.target.closest("input,textarea,select,[data-motion-toggle],#music-player,#music-launcher"))) return;
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
const player = document.querySelector<HTMLElement>("#music-player");
const launcher = document.querySelector<HTMLButtonElement>("#music-launcher");
const musicClose = document.querySelector<HTMLButtonElement>("#music-close");
function closeMusic(restoreFocus = false) {
  player?.removeAttribute("data-mobile-open");
  launcher?.setAttribute("aria-expanded", "false");
  if (details) details.hidden = expand?.getAttribute("aria-expanded") !== "true";
  if (restoreFocus) launcher?.focus();
}
launcher?.addEventListener("click", () => {
  if (player?.hasAttribute("data-mobile-open")) { closeMusic(true); return; }
  player?.setAttribute("data-mobile-open", "true");
  launcher.setAttribute("aria-expanded", "true");
  if (details) details.hidden = false;
  musicClose?.focus();
});
musicClose?.addEventListener("click", () => closeMusic(true));
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && player?.hasAttribute("data-mobile-open")) closeMusic(true);
});
document.addEventListener("click", event => {
  if (event.target instanceof Element && !event.target.closest("#music-player,#music-launcher")) closeMusic();
});
desktopScene.addEventListener("change", () => closeMusic());
let navigationHooked = false;
function setupReadingNavigation() {
  if (navigationHooked || !window.swup?.hooks) return;
  navigationHooked = true;
  window.swup.hooks.on("page:view", () => { closeMusic(); syncMotion(); });
}
setupReadingNavigation();
document.addEventListener("swup:enable", setupReadingNavigation);
if (audio && toggle && expand && details && seek && volume && status && time) {
  const storedVolume=Number(read("blog-volume") ?? "0.35");
  audio.volume=Number.isFinite(storedVolume) ? Math.max(0,Math.min(1,storedVolume)) : 0.35;
  volume.value=String(audio.volume);
  toggle.addEventListener("click", async () => {
    if (!audio.paused) audio.pause();
    else {
      status.textContent="正在加载音乐…";
      if (!audio.hasAttribute("src") && audio.dataset.src) audio.src = audio.dataset.src;
      try { await audio.play(); } catch { status.textContent="暂时无法播放，请再次点击重试。"; }
    }
  });
  function reflect() {
    if (!audio || !toggle || !status) return;
    toggle.setAttribute("aria-label",audio.paused ? "播放背景音乐" : "暂停背景音乐");
    toggle.setAttribute("aria-pressed",String(!audio.paused));
    launcher?.setAttribute("data-playing",String(!audio.paused));
    status.textContent=audio.paused ? "音乐已暂停" : "正在播放 · 单曲循环";
  }
  audio.addEventListener("play",reflect); audio.addEventListener("pause",reflect);
  audio.addEventListener("error",()=>{status.textContent="音乐加载失败，请刷新后重试。";});
  audio.addEventListener("timeupdate",()=>{ if (Number.isFinite(audio.duration)) seek.value=String(audio.currentTime/audio.duration*100); time.textContent=`${Math.floor(audio.currentTime/60)}:${String(Math.floor(audio.currentTime%60)).padStart(2,"0")}`; });
  seek.addEventListener("input",()=>{if(Number.isFinite(audio.duration)) audio.currentTime=Number(seek.value)/100*audio.duration;});
  volume.addEventListener("input",()=>{audio.volume=Number(volume.value);save("blog-volume",volume.value);});
  expand.addEventListener("click",()=>{details.hidden=!details.hidden;expand.setAttribute("aria-expanded",String(!details.hidden));expand.setAttribute("aria-label",details.hidden ? "展开播放器" : "收起播放器");expand.textContent=details.hidden ? "⌃" : "⌄";});
}
