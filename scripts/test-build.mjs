import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
const created = [];
const env = { ...process.env, ASTRO_TELEMETRY_DISABLED: "1" };
delete env.BLOG_PREVIEW;
function run(script, args = []) {
 const result = spawnSync(process.execPath, [script, ...args], { env, stdio: "inherit" });
 if (result.status !== 0) throw new Error(`${script} failed: ${result.status}`);
}
try {
 for (const [name, fields, marker] of [
  ["draft-example", "published: 2026-01-01\ndraft: true", "PRIVATE_DRAFT_SENTINEL_9340"],
  ["future-example", "published: 2099-01-01\ndraft: false", "FUTURE_POST_SENTINEL_9340"],
 ]) {
  const file = path.join("src/content/posts", `${name}.md`);
  fs.writeFileSync(file, `---\ntitle: 自动化测试\ndescription: 临时生成的过滤测试夹具\n${fields}\n---\n${marker}\n`, { flag: "wx" });
  created.push(file);
 }
 for (let index = 1; index <= 9; index++) {
  const file = path.join("src/content/posts", `qa-pagination-${index}.md`);
  fs.writeFileSync(file, `---\ntitle: 分页验收 ${index}\npublished: 2026-01-01\ndescription: 临时的公开文章测试夹具\ntags: [分页验收]\n---\n\nPUBLIC_SEARCH_SENTINEL_9340 中文搜索验收\n`, { flag: "wx" });
  created.push(file);
 }
 run("node_modules/astro/astro.js", ["build"]);
 run("node_modules/pagefind/lib/runner/bin.cjs", ["--site", "dist"]);
 run("scripts/verify-build.mjs");
 const home = fs.readFileSync("dist/index.html", "utf8");
 const second = fs.readFileSync("dist/2/index.html", "utf8");
 assert.ok(home.includes('href="/2/"'));
 assert.ok(second.includes('href="/"'));
 assert.ok((fs.readFileSync("dist/rss.xml", "utf8").match(/<item>/g) || []).length >= 9);
 assert.equal(fs.readdirSync("dist/posts").filter(name => name.startsWith("qa-pagination-")).length, 9);
 console.log("PASS: 9 articles, pagination, RSS, canonical URLs and private-content exclusion.");
} finally {
 for (const file of created) fs.unlinkSync(file);
}
