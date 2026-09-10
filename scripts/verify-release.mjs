import assert from "node:assert/strict";
import fs from "node:fs";
import { shanghaiDay } from "../src/utils/publication.ts";
const config = JSON.parse(fs.readFileSync("blog.config.json", "utf8"));
assert.match(config.githubUsername, /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/);
assert.equal(config.readyToPublish, true, "请准备正式内容后，将 blog.config.json 的 readyToPublish 设为 true。");
assert.ok(config.title && config.author && config.bio);
const repository = process.env.GITHUB_REPOSITORY;
if (repository) assert.equal(repository.toLowerCase(), `${config.githubUsername}/${config.githubUsername}.github.io`.toLowerCase(), "仓库必须是此账号的个人主页仓库。");
// The generated RSS is the authoritative public article list, after schema validation and filtering.
const rss = fs.readFileSync("dist/rss.xml", "utf8");
assert.match(rss, /<item>/, "需要至少一篇真实公开文章；演示文章不算首次发布内容。");
assert.ok(!process.env.BLOG_PREVIEW, "不能将预览构建作为正式发布。");
console.log(`Release identity and content ready (${shanghaiDay(new Date())}).`);
