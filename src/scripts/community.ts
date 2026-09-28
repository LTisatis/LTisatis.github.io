import type { WalineInstance } from "@waline/client";
import { commentPath } from "../utils/community-utils";

let instance: WalineInstance | null = null;
let controller: AbortController | null = null;
let generation = 0;

function dispose() {
	generation++;
	controller?.abort();
	controller = null;
	instance?.destroy();
	instance = null;
}

async function mountComments() {
	dispose();
	const section = document.querySelector<HTMLElement>("[data-comments]");
	if (!section?.dataset.server) return;
	const current = generation;
	const serverURL = section.dataset.server;
	const preview = section.dataset.preview === "true" || ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
	const path = commentPath(section.dataset.path || location.pathname, preview);
	const status = section.querySelector<HTMLElement>("[data-comment-status]");
	const retry = section.querySelector<HTMLButtonElement>("[data-comment-retry]");
	const mount = section.querySelector<HTMLElement>("[data-comment-mount]");
	const previewNote = section.querySelector<HTMLElement>("[data-comment-preview]");
	if (!status || !retry || !mount) return;
	if (previewNote) previewNote.hidden = !preview;
	status.hidden = false;
	status.textContent = "正在连接评论区…";
	retry.hidden = true;
	const request = new AbortController();
	controller = request;
	const timeout = window.setTimeout(() => request.abort(), 15000);
	try {
		const endpoint = new URL(`${serverURL}/api/comment`);
		endpoint.search = new URLSearchParams({ path, page: "1", pageSize: "1", lang: "zh-CN" }).toString();
		const [response, client] = await Promise.all([
			fetch(endpoint, { signal: request.signal }),
			import("@waline/client"),
			import("@waline/client/waline.css"),
		]);
		if (!response.ok) throw new Error("Comment service unavailable");
		const payload = await response.json();
		if (payload.errno !== 0 || !payload.data) throw new Error("Invalid comment service response");
		if (current !== generation || !section.isConnected) return;
		instance = client.init({
			el: mount, serverURL, path,
			lang: "zh-CN", dark: "html.dark", login: "disable",
			meta: ["nick", "mail", "link"], requiredMeta: ["nick"],
			pageSize: 10, commentSorting: "latest",
			imageUploader: false, search: false, emoji: false,
			texRenderer: false, highlighter: false,
			pageview: false, comment: false, reaction: false,
			locale: { placeholder: "有什么想说的？留下你的心得、随想，或打个招呼吧。", mail: "邮箱（选填，不公开）", link: "网站（选填）" },
		});
		status.hidden = true;
	} catch {
		if (current !== generation || !section.isConnected) return;
		status.textContent = "暂时无法连接评论区，请稍后重试。文章仍可正常阅读。";
		retry.hidden = false;
	} finally {
		window.clearTimeout(timeout);
	}
}

function setupPage() {
	document.getElementById("nav-menu-panel")?.classList.add("float-panel-closed");
	document.getElementById("nav-menu-switch")?.setAttribute("aria-expanded", "false");
	for (const image of document.querySelectorAll<HTMLImageElement>("[data-friend-avatar]")) {
		image.onerror = () => { image.hidden = true; };
		if (image.complete && !image.naturalWidth) image.hidden = true;
	}
	void mountComments();
}

document.addEventListener("click", async (event) => {
	const target = event.target;
	if (!(target instanceof Element)) return;
	if (target.closest("[data-comment-retry]")) void mountComments();
	if (!target.closest("[data-copy-exchange]")) return;
	const text = document.querySelector<HTMLElement>("[data-exchange-text]")?.textContent;
	const status = document.querySelector<HTMLElement>("[data-copy-status]");
	if (!text || !status) return;
	try {
		await navigator.clipboard.writeText(text);
		status.textContent = "已复制，可以粘贴到对方的友链申请中。";
	} catch {
		status.textContent = "未能自动复制，请选中上方信息手动复制。";
	}
});

let hooked = false;
function setupNavigation() {
	if (hooked || !window.swup?.hooks) return;
	hooked = true;
	window.swup.hooks.on("content:replace", dispose, { before: true });
	window.swup.hooks.on("page:view", setupPage);
}
setupNavigation();
document.addEventListener("swup:enable", setupNavigation);
setupPage();
