import fs from "node:fs";
import path from "node:path";
const slug = process.argv[2];
if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
 console.error("用法：pnpm new-post my-first-post（小写英文、数字与连字符）");
 process.exit(1);
}
const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const target = path.join("src/content/posts", `${slug}.md`);
fs.writeFileSync(target, `---\ntitle: ${JSON.stringify(slug)}\npublished: ${day}\ndescription: 请填写文章摘要\nimage: ''\ntags: []\ncategory: ''\ndraft: true\n---\n\n在这里开始写作。\n`, { encoding: "utf8", flag: "wx" });
console.log(`已创建 ${target}。私密草稿请保存在仓库之外，准备公开后再复制进来。`);
