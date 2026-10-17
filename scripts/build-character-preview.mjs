import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
const require = createRequire(import.meta.resolve("astro"));
const { build } = require("esbuild");
await mkdir(".artifacts/character-motion-v2", { recursive: true });
const result = await build({
	entryPoints: ["scripts/character-motion-lab.ts"],
	outfile: ".artifacts/character-motion-v2/preview.js",
	bundle: true,
	minify: true,
	format: "esm",
	target: "es2022",
	metafile: true,
	write: false,
});
for (const file of result.outputFiles) {
	await writeFile(file.path, file.contents);
	console.log(
		"Lab JS:",
		file.contents.length,
		"bytes; gzip:",
		gzipSync(file.contents).length,
	);
}
await writeFile(
	".artifacts/character-motion-v2/bundle-meta.json",
	JSON.stringify(result.metafile),
);
