// Local acceptance runner. Supply PLAYWRIGHT_MODULE when Playwright isn't installed in this repo.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const base = process.env.CHARACTER_PREVIEW_URL || "http://127.0.0.1:4323";
const out = ".artifacts/character-motion-v2";
fs.mkdirSync(out, { recursive: true });
const report = { date: new Date().toISOString(), checks: [], performance: [] };
const pctl = (data, p) => {
	const a = [...data].sort((a, b) => a - b);
	return a[Math.floor((a.length - 1) * p)] ?? 0;
};
(async () => {
	const browser = await chromium.launch({ channel: "msedge", headless: true });
	async function page(options = {}) {
		const context = await browser.newContext({
			viewport: { width: 1280, height: 720 },
			...options,
		});
		const p = await context.newPage();
		p.errors = [];
		p.requests = [];
		p.on("pageerror", (e) => p.errors.push(e.message));
		p.on("request", (r) => p.requests.push(r.url()));
		return p;
	}
	async function enter(p) {
		await p.goto(base + "/", { waitUntil: "load" });
		if (await p.locator("html.welcome-active").count())
			await p.locator("#welcome-entry").press("Escape");
		await p.waitForTimeout(1300);
	}
	async function ready(p) {
		await p.waitForFunction(
			() =>
				document.querySelector(".character-stage")?.dataset.rendererReady ===
				"true",
		);
	}
	const handle = "document.querySelector('.character-stage').characterPreview";
	async function measure(p, label, seconds) {
		await p.waitForTimeout(1000);
		await p.evaluate(
			(h) => {
				const e =
					h === "lab"
						? window.characterLab
						: document.querySelector(".character-stage").characterPreview;
				e.metrics.updateMs.length = 0;
				e.metrics.intervalMs.length = 0;
			},
			label === "lab" ? "lab" : "blog",
		);
		await p.waitForTimeout(seconds * 1000);
		const data = await p.evaluate(
			(h) => {
				const e =
					h === "lab"
						? window.characterLab
						: document.querySelector(".character-stage").characterPreview;
				return {
					metrics: e.metrics,
					events: e.actors.map((a) => ({
						name: a.anchor.dataset.character,
						events: a.timeline.events,
					})),
					resources: performance
						.getEntriesByType("resource")
						.map((r) => ({
							name: r.name,
							transfer: r.transferSize,
							encoded: r.encodedBodySize,
							decoded: r.decodedBodySize,
						})),
				};
			},
			label === "lab" ? "lab" : "blog",
		);
		const m = data.metrics;
		report.performance.push({
			label,
			seconds,
			fps:
				1000 / (m.intervalMs.reduce((a, b) => a + b, 0) / m.intervalMs.length),
			intervalP50: pctl(m.intervalMs, 0.5),
			intervalP95: pctl(m.intervalMs, 0.95),
			cpuP50: pctl(m.updateMs, 0.5),
			cpuP95: pctl(m.updateMs, 0.95),
			resolution: m.resolution,
			targetFps: m.targetFps,
			qualityChanges: m.qualityChanges,
			events: data.events,
			resources: data.resources,
		});
		console.log(
			"PERFORMANCE",
			label,
			JSON.stringify(report.performance.at(-1), null, 0).slice(0, 450),
		);
	}
	try {
		let p = await page();
		await p.goto(base + "/__characters/", { waitUntil: "load" });
		await p.waitForFunction(() => window.characterLab);
		await measure(p, "lab", Number(process.env.PERF_SECONDS || 60));
		assert.equal(p.errors.length, 0);
		await p.context().close();
		for (const [width, height] of [
			[1280, 720],
			[1920, 1080],
			[768, 844],
			[390, 844],
		]) {
			p = await page({ viewport: { width, height }, deviceScaleFactor: 2 });
			await enter(p);
			if (width >= 1024) await ready(p);
			const boxes = await p
				.locator("[data-character]")
				.evaluateAll((es) => es.map((e) => e.getBoundingClientRect().toJSON()));
			for (const [i,b] of boxes.entries()) {
				if(width < 1024){
					assert.ok(b.left >= 12 && b.right <= width - 12);
					assert.ok(b.top >= 72 && b.width <= 100);
				}else{
					const span=i===0?.448:.445,center=i===0?.562:.456;
					assert.ok(Math.abs(b.height*span-height*.64)<1);
					assert.ok(Math.abs(b.left+b.width*center-width*(i===0?.17:.83))<1);
				}
			}
			if (width < 1024) {
				assert.ok(
					!p.requests.some(
						(u) => u.endsWith("/rigs.json") || u.includes("character-renderer"),
					),
				);
				await p.locator("#music-launcher").click();
				await p.locator("#mobile-motion-toggle").click();
				await p.locator("#music-close").click();
				await ready(p);
				await p.waitForTimeout(1500);
				const result = await p.evaluate(
					() =>
						document.querySelector(".character-stage").characterPreview.metrics,
				);
				assert.equal(result.resolution, 1);
				assert.ok(pctl(result.intervalMs, 0.5) >= 30);
			}
			await p.screenshot({ path: `${out}/blog-${width}.png` });
			assert.equal(p.errors.length, 0);
			report.checks.push({
				name: "viewport-" + width,
				boxes,
				mobileOptIn: width < 1024,
			});
			if (width === 1280) {
				await measure(p, "blog", Number(process.env.PERF_SECONDS || 60));
				await p.locator("#motion-toggle").click();
				const before = await p.evaluate(
					() =>
						document.querySelector(".character-stage").characterPreview.metrics
							.frames,
				);
				await p.waitForTimeout(500);
				assert.equal(
					await p.evaluate(
						() =>
							document.querySelector(".character-stage").characterPreview
								.metrics.frames,
					),
					before,
				);
				await p.locator("#motion-toggle").click();
				report.checks.push({
					name: "pause-freezes-without-redraw",
					passed: true,
				});
				await p.evaluate(() => {
					window.__sameCanvas = document.querySelector(".character-webgl");
				});
				await p.locator('#navbar a[href="/about/"]').first().click();
				await p.waitForURL("**/about/");
				await p.waitForTimeout(1200);
				assert.ok(
					await p.evaluate(
						() =>
							window.__sameCanvas ===
							document.querySelector(".character-webgl"),
					),
				);
				assert.equal(await p.locator(".character-webgl").count(), 1);
				report.checks.push({ name: "swup-preserves-one-canvas", passed: true });
				await p.evaluate(() => {
					Object.defineProperty(document, "hidden", {
						configurable: true,
						value: true,
					});
					document.dispatchEvent(new Event("visibilitychange"));
				});
				const hiddenFrame = await p.evaluate(
					() =>
						document.querySelector(".character-stage").characterPreview.metrics
							.frames,
				);
				await p.waitForTimeout(400);
				assert.equal(
					await p.evaluate(
						() =>
							document.querySelector(".character-stage").characterPreview
								.metrics.frames,
					),
					hiddenFrame,
				);
				await p.evaluate(() => {
					Object.defineProperty(document, "hidden", {
						configurable: true,
						value: false,
					});
					document.dispatchEvent(new Event("visibilitychange"));
				});
				await p.waitForTimeout(100);
				assert.ok(
					await p.evaluate(() =>
						document
							.querySelector(".character-stage")
							.characterPreview.actors.every(
								(a) => a.timeline.nextBlink - a.timeline.time > 2.8,
							),
					),
				);
				report.checks.push({
					name: "visibility-resets-waiting-deadlines",
					passed: true,
				});
				await p.emulateMedia({ reducedMotion: "reduce" });
				await p.waitForFunction(() => !document.querySelector('.character-stage').hasAttribute('data-renderer-ready'));
				assert.equal(
					await p
						.locator(".character-stage")
						.getAttribute("data-renderer-ready"),
					null,
				);
				await p.emulateMedia({ reducedMotion: "no-preference" });
				await ready(p);
				report.checks.push({
					name: "reduced-motion-restores-original",
					passed: true,
				});
				const loss = await p.evaluate(() => {
					const c = document.querySelector(".character-webgl");
					const gl = c.getContext("webgl2") || c.getContext("webgl");
					const ext = gl.getExtension("WEBGL_lose_context");
					if (ext) {
						ext.loseContext();
						return true;
					}
					return false;
				});
				assert.ok(loss);
				await p.waitForFunction(
					() => !document.querySelector(".character-webgl"),
				);
				assert.equal(
					await p
						.locator(".character-stage")
						.getAttribute("data-renderer-ready"),
					null,
				);
				report.checks.push({
					name: "context-loss-static-fallback",
					passed: true,
				});
			}
			await p.context().close();
		}
		for (const scenario of [
			"reduced",
			"saved-paused",
			"asset-failed",
			"webgl-unavailable",
			"manifest-failed",
		]) {
			p = await page(scenario === "reduced" ? { reducedMotion: "reduce" } : {});
			if (scenario === "saved-paused")
				await p.addInitScript(() =>
					localStorage.setItem("blog-motion-paused", "true"),
				);
			if (scenario === "asset-failed")
				await p.route("**/characters-v2/sonya-body.webp", (r) => r.abort());
			if (scenario === "manifest-failed")
				await p.route("**/characters-v2/rigs.json", (r) =>
					r.fulfill({ status: 200, body: "invalid" }),
				);
			if (scenario === "webgl-unavailable")
				await p.addInitScript(() => {
					const orig = HTMLCanvasElement.prototype.getContext;
					HTMLCanvasElement.prototype.getContext = function (type, ...args) {
						return /webgl/.test(type) ? null : orig.call(this, type, ...args);
					};
				});
			await enter(p);
			await p.waitForTimeout(500);
			assert.equal(
				await p.locator(".character-stage").getAttribute("data-renderer-ready"),
				null,
			);
			if (["reduced", "saved-paused"].includes(scenario))
				assert.ok(
					!p.requests.some(
						(u) => u.endsWith("/rigs.json") || u.includes("character-renderer"),
					),
				);
			assert.ok(await p.locator(".puppet-original").first().isVisible());
			assert.equal(p.errors.length, 0);
			report.checks.push({ name: scenario, passed: true });
			await p.context().close();
		}
		console.log("PASS", report.checks.length, "browser checks");
	} finally {
		fs.writeFileSync(
			out + "/browser-report.json",
			JSON.stringify(report, null, 2),
		);
		await browser.close();
	}
})().catch((e) => {
	console.error(e);
	process.exitCode = 1;
});
