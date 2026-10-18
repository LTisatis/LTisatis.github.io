import type { CharacterRenderer } from "./character-renderer";
import { parallaxDepth } from "./character-deformation";
import { CharacterTimeline } from "./character-animation";
import { prepareCharacterAssets } from "./character-assets";
export type PuppetState = "static" | "paused" | "running";
export function puppetState(
	paused: boolean,
	reduced: boolean,
	hidden: boolean,
): PuppetState {
	return reduced ? "static" : paused || hidden ? "paused" : "running";
}
/** Small eager controller. No Pixi/model requests until motion is enabled. */
export function createCharacterMotion(roots: HTMLElement[], onSettled: () => void = () => {}) {
	let engine: CharacterRenderer | undefined;
	let loading = false;
	let failed = false;
	let destroyed = false;
	let paused = true;
	let reduced = false;
	let hidden = false;
	let wasHidden = false;
	const request = new AbortController();
	const host = roots[0]?.parentElement;
	let pointerX = 0;
	let pointerY = 0;
	const originals = roots.map((r) => r.querySelector<HTMLElement>(".puppet-original"));
	const waveControls=roots.map(r=>host?.querySelector<HTMLButtonElement>(`[data-wave-character="${r.dataset.character}"]`));
	const canWave=()=>!!engine&&!destroyed&&!failed&&!paused&&!reduced&&!hidden;
	function clickCharacter(event: MouseEvent) {
		if(!canWave()||event.defaultPrevented||event.button!==0)return;
		const target=event.target instanceof Element?event.target:null;
		const control=target?.closest('.character-wave-control');
		if(control){
			const index=waveControls.indexOf(control as HTMLButtonElement);
			if(index>=0)engine?.wave(index);
			return;
		}
		if(event.detail===0)return;
		// The portraits sit behind content. Clicking through an article, control,
		// or navigation must retain that element's own action without a greeting.
		if(!target?.closest('#welcome-entry')&&target?.closest('a,button,input,textarea,select,nav,main,aside,article,.card-base,.section-intro,[role="button"],[contenteditable]'))return;
		const index=engine?.hitTest(event.clientX,event.clientY) ?? -1;
		if(index>=0)engine?.wave(index);
	}
	document.addEventListener('click',clickCharacter);
	let originalFrame = 0;
	let originalLast = 0;
	let originalX = 0;
	let originalY = 0;
	let originalUsed = false;
	let originalTime = 0;
	const introPoses=roots.map(r=>new CharacterTimeline(1,r.dataset.character==='sonya'));
	const canMoveOriginal = () => !destroyed && !failed && !paused && !reduced && !hidden && !engine;
	function stopOriginal(reset = false) {
		cancelAnimationFrame(originalFrame);
		originalFrame = 0;
		originalLast = 0;
		if (reset) {
			originalX = originalY = 0;
			originalUsed = false;
			originals.forEach((img) => { if (img) {img.style.translate = "";img.style.transform="";} });
		}
	}
	function moveOriginal(now: number) {
		originalFrame = 0;
		if (!canMoveOriginal()) { originalLast = 0; return; }
		const dt = originalLast ? Math.min((now - originalLast) / 1000, 0.05) : 1 / 60;
		originalLast = now;
		originalTime+=dt;
		const follow = 1 - Math.exp(-dt * 6);
		originalX += (pointerX - originalX) * follow;
		originalY += (pointerY - originalY) * follow;
		originalUsed = true;
		originals.forEach((img, i) => {
			const depth = parallaxDepth(roots[i].dataset.character ?? "", innerWidth < 1024);
			// Translate the image child; entrance transforms and anchor bounds stay intact.
			if (img) {
				introPoses[i].time=originalTime;
				const pose=introPoses[i].pose;
				const scale=roots[i].offsetWidth/1407;
				img.style.translate = `${originalX * depth}px ${originalY * depth * 0.65}px`;
				img.style.transformOrigin=`${(roots[i].dataset.character==='sonya'?704:749)/1407*100}% ${1060/1118*100}%`;
				img.style.transform=`translate(${pose.bodyX*scale}px,${pose.breath*scale}px) rotate(${pose.bodyAngle}rad)`;
			}
		});
		originalFrame = requestAnimationFrame(moveOriginal);
	}
	function startOriginal() {
		if (canMoveOriginal() && !originalFrame) originalFrame = requestAnimationFrame(moveOriginal);
	}
	function fallback(error?: unknown) {
		request.abort();
		failed = true;
		waveControls.forEach(b=>{if(b)b.disabled=true;});
		stopOriginal(true);
		engine?.destroy();
		engine = undefined;
		host?.removeAttribute("data-renderer-ready");
		roots.forEach((r) => {
			r.dataset.puppetState = "static";
			r.dataset.puppetFailed = "true";
		});
		if (error) console.warn("Character animation: static fallback", error);
		onSettled();
	}
	function apply() {
		if (destroyed || failed || !host) return;
		waveControls.forEach(b=>{if(b)b.disabled=!canWave();});
		const state = puppetState(paused, reduced, hidden);
		roots.forEach((r) => { r.dataset.puppetState = state; });
		if (state === "running") startOriginal();
		else stopOriginal(reduced);
		if (reduced) {
			engine?.pause();
			host.removeAttribute("data-renderer-ready");
			return;
		}
		if (engine) {
			if (originalUsed) {
				engine.seedPointer(originalX, originalY);
				stopOriginal(true);
			}
			host.dataset.rendererReady = "true";
			if (state === "running") {
				engine.resize();
				engine.resume(wasHidden);
				wasHidden = false;
			} else engine.pause();
		} else if (state === "running" && !loading) {
			loading = true;
			const assets = prepareCharacterAssets(request.signal);
			// Start model downloads alongside the code import. Handle early rejection
			// immediately; createRenderer owns cleanup after both operations settle.
			void assets.catch(() => {});
			void import("./character-renderer")
				.then((m) => m.createRenderer(roots, host, fallback, assets))
				.then((e) => {
					if (destroyed || failed) {
						e.destroy();
						return;
					}
					engine = e;
					e.seedTime(originalTime);
					e.pointer(pointerX, pointerY);
					loading = false;
					// Inspection handle exists only on a loopback preview, never on the hosted blog.
					if (["127.0.0.1", "localhost"].includes(location.hostname))
						Object.defineProperty(host, "characterPreview", {
							value: e,
							configurable: true,
						});
					apply();
					onSettled();
				})
				.catch(fallback);
		}
	}
	const observer = new MutationObserver(() => {
		apply();
	});
	observer.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ["class"],
	});
	return {
		sync(p: boolean, r: boolean, h: boolean) {
			if (h) wasHidden = true;
			paused = p;
			reduced = r;
			hidden = h;
			apply();
		},
		pointer(x: number, y: number) {
			pointerX = x;
			pointerY = y;
			engine?.pointer(x, y);
			startOriginal();
		},
		destroy() {
			destroyed = true;
			request.abort();
			document.removeEventListener('click',clickCharacter);
			waveControls.forEach(b=>{if(b)b.disabled=true;});
			stopOriginal(true);
			observer.disconnect();
			engine?.destroy();
			host?.removeAttribute("data-renderer-ready");
		},
	};
}
