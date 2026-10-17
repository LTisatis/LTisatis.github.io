import { createRenderer } from "../src/scripts/character-renderer";
const anchors = [...document.querySelectorAll<HTMLElement>("[data-character]")];
const status = document.querySelector<HTMLElement>("#status")!;
document.querySelector<HTMLAnchorElement>("#replay-welcome")!.onclick = () => {
	try { sessionStorage.removeItem("blog-welcome-seen"); } catch { /* Local storage may be blocked. */ }
};
try {
	const engine = await createRenderer(
		anchors,
		document.querySelector<HTMLElement>("#stage")!,
		(e) => {
			status.textContent = String(e);
		},
	);
	(window as unknown as { characterLab: typeof engine }).characterLab = engine;
	engine.resume();
	let playing = true;
	document.addEventListener('click',event=>{
		if(!playing||event.detail===0||event.button!==0||event.target instanceof Element&&event.target.closest('header,a,button,input,select'))return;
		const index=engine.hitTest(event.clientX,event.clientY);
		if(index>=0)engine.wave(index);
	});
	const pause = document.querySelector<HTMLButtonElement>("#pause")!;
	pause.onclick = () => {
		playing = !playing;
		playing ? engine.resume() : engine.pause();
		pause.textContent = playing ? "暂停" : "播放";
	};
	document.querySelector<HTMLButtonElement>("#wave")!.onclick = () =>
		engine.wave();
	document.querySelector<HTMLButtonElement>("#blink")!.onclick = () =>
		engine.blink();
	document.querySelector<HTMLSelectElement>("#speed")!.onchange = (e) =>
		engine.speed(Number((e.target as HTMLSelectElement).value));
	document.querySelector<HTMLInputElement>("#debug")!.onchange = (e) =>
		engine.debug((e.target as HTMLInputElement).checked);
	document.querySelector<HTMLInputElement>("#scrub")!.oninput = (e) => {
		playing = false;
		pause.textContent = "播放";
		const time = Number((e.target as HTMLInputElement).value);
		engine.seek(time);
		document.querySelector("#time")!.textContent = time.toFixed(3) + "s";
	};
	document.querySelector<HTMLSelectElement>("#version")!.onchange = (e) => {
		const old = (e.target as HTMLSelectElement).value === "v1";
		document.querySelector<HTMLElement>("#legacy")!.hidden = !old;
		document.querySelector<HTMLElement>("#stage")!.hidden = old;
		if (old) {
			engine.pause();
			const frame = document.querySelector<HTMLIFrameElement>("#legacy")!;
			if (!frame.src) frame.src = "/__characters/v1/";
		} else if (playing) engine.resume();
	};
	document.addEventListener("visibilitychange", () => {
		if (document.hidden) engine.pause();
		else if (playing) engine.resume(true);
	});
	setInterval(() => {
		const a = engine.metrics.updateMs.slice(-120).sort((a, b) => a - b);
		status.textContent = `WebGL · ${engine.metrics.targetFps}fps 目标 · DPR ${engine.metrics.resolution} · 更新+提交 p95 ${(a[Math.floor(a.length * 0.95)] ?? 0).toFixed(2)}ms · ${engine.metrics.frames} 帧`;
	}, 1000);
} catch (e) {
	status.textContent = "加载失败：" + String(e);
}
