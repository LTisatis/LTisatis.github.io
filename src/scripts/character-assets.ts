import type { CharacterManifest } from "./character-renderer";

/** A single bounded queue shared by both characters; assembly order stays separate. */
export async function loadUnique<T>(urls: string[], load: (url: string) => Promise<T>, concurrency = 6) {
	const queue = [...new Set(urls)];
	const result = new Map<string, T>();
	let next = 0;
	let failed = false;
	async function worker() {
		while (!failed && next < queue.length) {
			const url = queue[next++];
			try { result.set(url, await load(url)); }
			catch (error) { failed = true; throw error; }
		}
	}
	// Drain in-flight work before the caller disposes resources after a failure.
	const settled = await Promise.allSettled(Array.from({ length: Math.min(queue.length, Math.max(1, concurrency)) }, worker));
	const failure = settled.find(item => item.status === "rejected");
	if (failure?.status === "rejected") throw failure.reason;
	return result;
}

function decodeImage(src: string, signal: AbortSignal): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		const abort = () => { img.src = ""; reject(new Error("Character loading cancelled")); };
		if (signal.aborted) { abort(); return; }
		signal.addEventListener("abort", abort, { once: true });
		img.src = src;
		img.decode().then(() => {
			if (!signal.aborted) resolve(img);
		}, reject).finally(() => signal.removeEventListener("abort", abort));
	});
}

export async function prepareCharacterAssets(signal?: AbortSignal) {
	const request = new AbortController();
	const abort = () => request.abort();
	if (signal?.aborted) abort();
	signal?.addEventListener("abort", abort, { once: true });
	const timeout = setTimeout(abort, 20000);
	const started = performance.now();
	try {
		const response = await fetch("/media/characters-v2/rigs.json", { signal: request.signal });
		if (!response.ok) throw new Error("Character manifest failed");
		const manifest: CharacterManifest = await response.json();
		const manifestReady = performance.now();
		const urls = Object.values(manifest.characters).flatMap(rig => [
			...rig.parts.map(part => part.src),
			...rig.eyes.flatMap(eye => ["open", "half", "closed"].map(state => eye.states[state].src)),
		]);
		const images = await loadUnique(urls, src => decodeImage(src, request.signal));
		return { manifest, images, timing: { started, manifestReady, imagesReady: performance.now() } };
	} finally {
		clearTimeout(timeout);
		signal?.removeEventListener("abort", abort);
	}
}

export type CharacterAssets = Awaited<ReturnType<typeof prepareCharacterAssets>>;
