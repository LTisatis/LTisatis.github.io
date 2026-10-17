import { readFile, readdir, stat, writeFile, mkdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";
import sharp from "sharp";
const files = await readdir("dist/_astro");
const entry = files.find(
	(f) => f.startsWith("character-renderer.") && f.endsWith(".js"),
);
if (!entry) throw new Error("Build the local blog before measuring.");
const visited = new Set();
async function chunk(file) {
	if (visited.has(file)) return;
	visited.add(file);
	const code = await readFile("dist/_astro/" + file, "utf8");
	for (const match of code.matchAll(
		/(?:from|import)\s*["']\.\/([^"']+\.js)["']/g,
	))
		await chunk(match[1]);
}
await chunk(entry);
// Conservative eager-code accounting includes the whole existing atmosphere entry.
const atmosphere = files.find(f=>f.startsWith('Atmosphere.') && f.endsWith('.js'));
const eager = atmosphere ? await readFile('dist/_astro/'+atmosphere) : Buffer.alloc(0);
const runtime = [];
for (const file of visited) {
	const data = await readFile("dist/_astro/" + file);
	runtime.push({ file, bytes: data.length, gzip: gzipSync(data).length });
}
const dir = "public/media/characters-v2",
	assets = [];
for (const file of await readdir(dir)) {
	const bytes = (await stat(path.join(dir, file))).size;
	let pixels = 0;
	if (file.endsWith(".webp")) {
		const m = await sharp(path.join(dir, file)).metadata();
		pixels = m.width * m.height;
	}
	assets.push({ file, bytes, rgbaBytes: pixels * 4 });
}
const manifest = JSON.parse(await readFile(dir + "/rigs.json", "utf8"));
let activePixels = 0, interactionMaskBytes = 0;
for (const rig of Object.values(manifest.characters)) {
	for (const p of rig.parts) {
		const scale=p.textureResolution||1;
		activePixels += p.width * p.height * scale**2;
		interactionMaskBytes += Math.ceil(p.width*scale/4)*Math.ceil(p.height*scale/4);
	}
	for (const e of rig.eyes) {
		activePixels += e.width * e.height * 3;
		interactionMaskBytes += Math.ceil(e.width/4)*Math.ceil(e.height/4)*3;
	}
}
const report = {
	runtime,
	runtimeGzip: runtime.reduce((n, f) => n + f.gzip, 0),
	eagerAtmosphereGzip: gzipSync(eager).length,
	// Shared helpers can make the renderer import the already-loaded atmosphere
	// chunk. Count that transfer once, rather than adding it again as eager code.
	combinedCodeGzip: runtime.reduce((n, f) => n + f.gzip, 0)+(visited.has(atmosphere) ? 0 : gzipSync(eager).length),
	assets,
	assetBytes: assets.reduce((n, f) => n + f.bytes, 0),
	activeTextureRGBA: activePixels * 4,
	interactionMaskBytes,
	staticImageRGBA: 1407 * 1118 * 4 * 2,
	allAssetsRGBA: assets.reduce((n, f) => n + f.rgbaBytes, 0),
	notes:
		"RGBA estimates exclude browser/GPU copies, mipmaps and framebuffers. Runtime gzip covers the renderer and statically imported chunks; local HTTP preview serves uncompressed JS.",
};
if (report.combinedCodeGzip > 350 * 1024 || report.assetBytes > 4 * 1024 * 1024)
	throw new Error("Character budget exceeded");
await mkdir(".artifacts/character-motion-v2", { recursive: true });
await writeFile(
	".artifacts/character-motion-v2/budget.json",
	JSON.stringify(report, null, 2),
);
console.log(JSON.stringify({ ...report, assets: undefined }, null, 2));
