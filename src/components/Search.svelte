<script lang="ts">
import Icon from "@iconify/svelte";
import { onMount } from "svelte";
import type { SearchResult } from "@/global";

let keyword = "";
let results: SearchResult[] = [];
let busy = false;
let message = "输入关键词，查找文章。";
let requestId = 0;
let timer: ReturnType<typeof setTimeout>;
const open = () => document.getElementById("search-panel")?.classList.remove("float-panel-closed");
const close = () => document.getElementById("search-panel")?.classList.add("float-panel-closed");

async function search(value: string, id: number) {
 const query = value.trim();
 if (!query) { results = []; busy = false; message = "输入关键词，查找文章。"; return; }
 if (import.meta.env.DEV) { results = []; busy = false; message = "开发预览不生成搜索索引；请运行 pnpm build:preview 和 pnpm preview 测试搜索。"; return; }
 if (!window.pagefind) { results = []; busy = false; message = "搜索索引尚未就绪，请稍后重试。"; return; }
 busy = true;
 try {
  const response = await window.pagefind.search(query);
  const found = await Promise.all(response.results.slice(0, 20).map(item => item.data()));
  if (id !== requestId) return;
  results = found;
  message = found.length ? `找到 ${response.results.length} 篇文章` : "没有找到相关文章，试试其他关键词。";
 } catch {
  if (id !== requestId) return;
  results = []; message = "搜索暂时不可用，请稍后重试。";
 } finally { if (id === requestId) busy = false; }
}

function queue(value: string) {
 clearTimeout(timer);
 const id = ++requestId;
 timer = setTimeout(() => search(value, id), 180);
}

$: queue(keyword);
onMount(() => {
 const ready = () => queue(keyword);
 const handleEscape = (event: KeyboardEvent) => { if (event.key === "Escape") { close(); document.getElementById("search-switch")?.focus(); } };
 document.addEventListener("pagefindready", ready);
 document.addEventListener("keydown", handleEscape);
 return () => { clearTimeout(timer); document.removeEventListener("pagefindready", ready); document.removeEventListener("keydown", handleEscape); };
});
</script>

<div id="search-bar" class="hidden lg:flex items-center h-11 mr-2 rounded-lg bg-black/5 dark:bg-white/5">
 <Icon icon="material-symbols:search" class="text-xl ml-3 text-50" />
 <input aria-label="搜索文章" placeholder="搜索文章" bind:value={keyword} on:focus={open} class="w-36 pl-2 pr-3 h-full bg-transparent text-sm text-75" />
</div>
<button id="search-switch" aria-label="搜索文章" on:click={() => { open(); document.getElementById("mobile-search")?.focus(); }} class="btn-plain lg:!hidden rounded-lg w-11 h-11">
 <Icon icon="material-symbols:search" class="text-xl" />
</button>
<div id="search-panel" class="float-panel float-panel-closed search-panel absolute top-20 left-3 md:left-auto right-3 md:w-[30rem] p-3" role="search" aria-label="站内文章搜索">
 <div class="flex items-center justify-between gap-2 mb-2">
  <input id="mobile-search" aria-label="搜索关键词" placeholder="搜索文章" bind:value={keyword} class="lg:hidden w-full min-w-0 p-3 bg-black/5 dark:bg-white/5 rounded-lg text-75" />
  <span class="hidden lg:block text-75">站内搜索</span>
  <button on:click={close} class="btn-plain rounded-lg p-2" aria-label="关闭搜索">关闭</button>
 </div>
 <p role="status" aria-live="polite" class="text-sm text-50 px-2 py-3">{busy ? "正在搜索…" : message}</p>
 {#each results as item}
  <a href={item.url} on:click={close} class="block p-3 rounded-xl hover:bg-[var(--btn-plain-bg-hover)] focus-visible:bg-[var(--btn-plain-bg-hover)]">
   <div class="font-bold text-90 mb-1">{item.meta.title}</div>
   <div class="text-sm text-75">{@html item.excerpt}</div>
  </a>
 {/each}
</div>

<style>.search-panel { max-height: calc(100dvh - 100px); overflow-y: auto; }</style>
