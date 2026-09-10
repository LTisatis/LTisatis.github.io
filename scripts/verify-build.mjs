import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const preview = process.argv.includes("--preview");
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
const files = walk("dist");
for (const needed of ["index.html", "about/index.html", "archive/index.html", "404.html", "rss.xml", "sitemap-index.xml", "robots.txt", "pagefind/pagefind.js"]) {
 assert.ok(fs.existsSync(path.join("dist", needed)), `Missing ${needed}`);
}
for (const file of files.filter(f => /\.(html|xml|json|txt|js)$/.test(f))) {
 const text = fs.readFileSync(file, "utf8");
 for (const secret of ["PRIVATE_DRAFT_SENTINEL_9340", "FUTURE_POST_SENTINEL_9340", "/posts/draft-example/", "/posts/future-example/"]) assert.ok(!text.includes(secret), `${file} leaks ${secret}`);
 if (/\.(html|xml)$/.test(file)) {
  assert.ok(!text.includes("fuwari.vercel.app"), `Demo domain in ${file}`);
  if (!preview) assert.ok(!text.includes("/posts/reading-preview/"), `Demo content in ${file}`);
 }
}
for (const file of files.filter(f => f.endsWith(".html"))) {
 const html = fs.readFileSync(file, "utf8");
 assert.match(html, /<html[^>]*lang="zh-CN"/);
 assert.match(html, /rel="canonical"/);
 if (!preview) assert.ok(!html.includes('name="robots" content="noindex, nofollow"') || file.endsWith("404.html"));
}
assert.ok(!fs.existsSync("dist/posts/draft-example"));
assert.ok(!fs.existsSync("dist/posts/future-example"));
console.log(`Verified ${files.length} build artifacts (${preview ? "local preview" : "production"}).`);
