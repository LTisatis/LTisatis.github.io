import { spawnSync } from "node:child_process";
const env = { ...process.env, BLOG_PREVIEW: "1", ASTRO_TELEMETRY_DISABLED: "1" };
for (const [script, args] of [["node_modules/astro/astro.js", ["build"]], ["node_modules/pagefind/lib/runner/bin.cjs", ["--site", "dist"]]]) {
 const result = spawnSync(process.execPath, [script, ...args], { env, stdio: "inherit" });
 if (result.status !== 0) process.exit(result.status ?? 1);
}
