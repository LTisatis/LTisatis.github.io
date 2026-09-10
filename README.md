# LTisatisのblog

记录心得与随想的中文个人博客。目标地址：https://ltisatis.github.io/ 。

基于 [Fuwari](https://github.com/saicaca/fuwari) 改良，保留 Astro 5、Svelte、Tailwind CSS 3、Pagefind 与原始依赖锁文件。导入版本见 [UPSTREAM.txt](UPSTREAM.txt)，模板代码遵循 [MIT 许可证](LICENSE)。个人文章版权归作者所有，不自动采用模板的 CC 许可。

## 本地运行

使用 `.node-version` 中的 Node.js 24.16.0 和 pnpm 9.14.4。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

如果本机 pnpm 版本不匹配，可用 `npm exec --yes --package=pnpm@9.14.4 -- pnpm <命令>` 调用固定版本，不要混用 npm install。

完整检查与正式预览：

```sh
pnpm check
pnpm lint
pnpm test
pnpm build
pnpm verify:build
pnpm verify:release
pnpm preview
```

搜索索引只在构建时生成。`pnpm dev` 可预览草稿；`pnpm build:preview` 可构建允许 demo 内容的本地版本，仍排除草稿和未来文章，并添加禁止搜索引擎收录的标记。此模式不能用于发布。正式上线务必重新执行 `pnpm build`。

## 写文章

```sh
pnpm new-post my-note
```

编辑 `src/content/posts/my-note.md`，填写标题、日期、摘要、分类和标签，完成后把 `draft` 改成 `false`。英文或拼音文件名决定 `/posts/my-note/` 地址；修改标题不会改变地址。

```yaml
---
title: 一篇新随想
published: 2026-09-10
description: 简短介绍这篇文章的内容。
tags: [随想]
category: 日常
draft: false
---
```

可选字段为 `updated`、`image`、`lang`；`demo: true` 仅用于演示内容。按上海时区的日历日期发布。未来文章需在发布日期推送一次提交或手动运行工作流，不会自动定时上线。首页每页 8 篇，归档、标签、RSS、搜索及前后文章统一排除草稿、演示和未来日期内容。同日文章按文件标识稳定排序。

公开仓库中的源码人人可见，`draft: true` 只影响网站生成；私人草稿应存放在仓库之外。配图使用有权使用的本地资源，Markdown 图片填写替代文字。关于页编辑 `src/content/spec/about.md`。

## 个人信息与外观

- `blog.config.json`：账号、标题、副标题、昵称、简介和发布准备状态。
- `src/config.ts`：导航、固定品牌色、公开链接、目录及模板设置。
- `src/styles/personal.css`：中文排版、手机布局与原创渐变横幅。
- `public/favicon.svg`：站点图标。

首篇 `welcome.md` 仅采用作者提供的简介。测试文章不随仓库发布，集成测试在运行时生成并清理临时夹具。

## GitHub Pages 发布

1. 在 LTisatis 账号下创建公开仓库 `LTisatis.github.io`；如已有仓库，先检查内容，不要覆盖。
2. 将本项目 `main` 分支推送至该仓库。
3. 仓库 Settings → Pages → Build and deployment → Source 选择 **GitHub Actions**。
4. Actions 中查看 **Check and deploy blog**。如首次推送早于 Pages 配置，配置后手动运行工作流。
5. 构建和部署均成功后打开 https://ltisatis.github.io/，检查文章直达链接、中文搜索、RSS 和不存在页面。

工作流对 PR 仅检查与构建，对 main 推送和手动执行发布。发布使用 GitHub 内置身份，无需把密码或访问令牌写入源码。个人站点使用根路径 `/`，不添加仓库名前缀，不配置 CNAME。

参考：https://docs.astro.build/en/guides/deploy/github/

## 验收、维护与回退

`pnpm test` 覆盖发布日期边界、草稿/未来文章过滤和排序。`node scripts/test-build.mjs` 会临时创建 9 篇公开夹具及草稿、未来日期夹具，验证分页、RSS 和私密内容排除，并清理夹具；它会重建 dist，完成后应再运行 `pnpm build` 得到正式产物。

日常流程：写作 → 本地预览 → 检查与构建 → 提交并推送 → 查看 Actions → 检查线上文章。

依赖升级在单独分支进行，保留 pnpm-lock.yaml。上游修复按需合并，不整体覆盖个人配置。构建失败先修复；线上回退通过撤销问题提交并重新部署完成。文章和原始图片另行备份。

完整路线见 `个人博客完整技术方案.txt`。实际验证状态见 `验收记录.txt`。
