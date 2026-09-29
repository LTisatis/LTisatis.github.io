# Netlify 评论直连试部署

## 当前状态

用户于 2026-09-29 确认关闭代理后，家庭宽带和手机流量各三轮读取与留言测试均通过。正式博客评论地址切换为 https://ltisatis-comments-test.netlify.app/.netlify/functions/comment；原 Vercel 服务保留作回退。
独立工程：`services/waline-netlify/`。已完成账户授权并创建 `ltisatis-comments-test`。
2026-09-29 测试部署 `6abb7e7197e11dea7ff0079f` 已为 ready；修正函数 SHA-256 摘要并重新使用完整文件清单后上传成功。
用户明确要求正式上线后，已关闭 Netlify 测试站点的团队私有访问。匿名 API 和管理页现可公开访问。读取已有文章评论、匿名测试留言、刷新后持久化、邮箱隐藏、跨域预检与 60 秒限流均已通过接口检查。本机 `curl --noproxy '*'` 使用正式博客 Origin 读取评论返回 HTTP 200，测试页返回 HTTP 200；这不能代替家庭宽带和手机流量验收。
无 Origin 的直接 API 请求返回 Waline 403 Forbidden，是来源限制生效，不是服务不可达。
2026-09-29 已查询账户：Free、每月 300 credits、自动充值关闭。未升级付费。
测试域名：https://ltisatis-comments-test.netlify.app
已将现有 Waline 三张表做一致性数据快照，保存在被 Git 忽略的 `.private/backups/`，包含 5 条评论及 1 个管理员。备份含私密数据，禁止提交公开仓库。

本机使用 `curl --noproxy '*'` 请求旧评论服务时，连接在 8 秒后超时。这仅说明本次命令行直连失败，不能替代手机和家庭网络验收，也不能确定具体运营商或拦截原因。

## 部署约束

- 仅部署独立工程的 `public/` 和 `netlify/functions/`，不要上传博客根目录或 `.private/`。
- 沿用 Waline 1.42.0，官方 Netlify Node 函数适配器使用 serverless-http，保留运行所需的外置模块与资源。
- 使用 Free 套餐，不启用付费升级或自动充值；部署前确认账户额度。
- 在 Netlify 服务端设置 `.env.example` 中的变量；数据库凭据复用现有 Neon，只保留同一套连接变量。禁止重新执行初始化 SQL。
- 数据库密码使用 Secret，限定 production 上下文及 builds/functions/runtime 作用域，避免平台禁止的 post-processing 作用域。这里 production 是独立测试服务的部署环境，不代表已切换正式博客。
- `SITE_NAME` 为 Netlify 保留变量，因此使用 `WALINE_SITE_NAME`，函数运行时映射给 Waline。匿名评论及密码登录无需第三方 OAuth，使用本地空提供商列表以去掉每次请求的外部 OAuth 依赖。
- 服务地址为 `https://实际域名/.netlify/functions/comment`；管理入口在该地址后加 `/ui`。沿用已有管理员账号。
- 本地预览用环境变量覆盖 PUBLIC_WALINE_SERVER_URL；不要修改正式默认地址，直到国内网络验收通过。

## 手机和宽带验收

部署后打开 `https://实际域名/connection-test.html`。先关闭代理，选择网络并勾选确认。每种网络完成三轮读取与提交，至少一轮隔一段时间重试；提交间隔超过 60 秒。分别下载记录，记录中不得伪称系统已自动检测网络。

测试页只向 `/__preview__/netlify-connectivity/` 写入明确标记的留言。15 秒超时后不自动重发；应先读取确认是否已入库。页面刷新会清空尚未导出的本地测试记录。

| 项目 | 家庭宽带 | 手机流量 |
| --- | --- | --- |
| 三轮读取及提交均在 15 秒内成功 | 用户确认通过 | 用户确认通过 |
| 刷新后仍可读取测试留言 | 用户确认通过 | 用户确认通过 |
| 间隔后首次请求正常 | 用户确认通过 | 用户确认通过 |

同时在本地完整博客验证跨域、页面切换、两篇文章与友链区隔离、回复、分页、失败保留输入、手机操作和已有留言可读。管理员验证删除测试留言；公开响应不含邮箱，恶意 HTML 不执行，同 IP 频率限制生效。测试页与 API 验证不能替代完整博客界面验收。

## 切换条件与回退

取得上述两类国内网络的真实结果且功能验收通过后，才更新博客正式服务地址、构建并发布 GitHub Pages。缺少证据或测试失败则不切换，报告结果。

保留旧 Vercel 服务。回退时恢复旧地址并重新发布，数据仍在同一 Neon 库中，无需搬迁。禁止在提交失败时自动向另一后端重发。上线后查看 Netlify 用量，免费额度不足时明确说明，不自动转付费。

来源：https://waline.js.org/en/guide/deploy/netlify.html
模板：https://github.com/walinejs/netlify-starter
额度：https://www.netlify.com/pricing/
