---
title: 智能体如何积累经验：记忆与 Dreaming 讲座图文指南
published: 2026-10-15
description: Lamis Mukta 讲座完整视频与中文字幕，配合三张原视频截图，学习按需使用上下文、提炼记忆、跨会话复盘和验证更新的具体方法。
image: /images/agent-memory-dreaming/memory-evolution.webp
tags: [AI, 智能体, 上下文工程, 记忆, 学习笔记]
category: 学习笔记
draft: false
---

模型越来越聪明，智能体为什么仍会重复犯错？这场讲座介绍了一条可实践的路线：**按需读取上下文，把经过验证的经验保存为记忆，再通过会话外复盘持续整理。**

## 讲座视频与中文字幕

**讲者**：Lamis Mukta，Anthropic Applied AI。**讲座**：Learning while you sleep: Beyond memory to dreaming，AI Native DevCon London 2026。**时长**：31 分 58 秒。

<video controls playsinline preload="metadata" poster="/images/agent-memory-dreaming/video-poster.webp" style="width:100%;aspect-ratio:16/9;border-radius:12px;background:#111" aria-label="Lamis Mukta 记忆与 Dreaming 完整讲座，附简体中文字幕">
  <source src="https://github.com/LTisatis/LTisatis.github.io/releases/download/lecture-dreaming-2026-10-15/lamis-mukta-dreaming-zh.mp4" type="video/mp4" />
  <track kind="subtitles" src="/media/agent-memory-dreaming/lecture.zh-CN.vtt" srclang="zh-CN" label="简体中文" default />
  浏览器无法播放时，请使用下方视频下载链接，或前往 YouTube 原视频观看。
</video>

播放器默认提供简体中文字幕，可在字幕菜单中切换。字幕根据英文自动字幕翻译并整理，专业名词可结合原讲座核对。若视频加载较慢，可下载后离线观看。

[下载完整视频（1080p，内封中文字幕，约 268 MB）](https://github.com/LTisatis/LTisatis.github.io/releases/download/lecture-dreaming-2026-10-15/lamis-mukta-dreaming-zh.mp4) · [下载中文字幕 SRT](/downloads/agent-memory-dreaming/lecture.zh-CN.srt) · [下载简洁图文指南 Word](/downloads/agent-memory-dreaming/illustrated-guide.docx) · [观看 YouTube 原视频](https://www.youtube.com/watch?v=tTcxVv8HHNw)

## 图文学习指南

下面保留核心概念、五步任务流程、复盘方法和一个纠错示例。流程是对讲座机制的简化应用建议，截图取自原视频，图下附中文解读。

### 一 先理解三个概念

上下文：完成当前任务所需的信息。先看索引和简述，命中后再读正文，避免一次加载全部资料。

记忆：可供后续任务检索的经验。保存适用条件、做法和证据；临时推测先留在草稿中。

Dreaming：在当前任务之外分析多次会话，发现重复问题，提出并验证记忆修改。它更新外部信息，不等同于训练模型参数。

![记忆从 CLAUDE.md、记忆工具、Skills 演进到文件式记忆的示意图](/images/agent-memory-dreaming/memory-evolution.webp)

**图 1 记忆系统的演进｜08:10**

读图：单文件说明 → 记忆工具 → 流程技能 → 智能体可读写的文件式记忆。借鉴重点是按需加载，并让已验证的经验能够复用。

### 二 每次任务按五步执行

| 步骤 | 具体动作 | 应留下的结果 |
| --- | --- | --- |
| 1 明确任务 | 确定交付物、验收标准和约束。 | 目标与验收条件 |
| 2 按需读取 | 检索相关记忆，核对来源、版本、适用范围与权限。 | 采用的条目及版本 |
| 3 执行并记录 | 完成任务，记录关键纠正、失败和验证结果。 | 可追溯的事件记录 |
| 4 提炼经验 | 验收后去重；只有原因和适用条件明确，才形成候选记忆。 | 候选条目及证据 |
| 5 验证并更新 | 检查效果与冲突；按授权发布，保留旧版本。 | 生效记忆或待验证事项 |

### 三 一条好记忆应回答什么

<strong>何时使用？具体怎么做？如何验证？何时不适用？</strong>这四个问题答不清，就先保留为候选，不写成长期规则。

简易模板：标题与适用范围 → 触发条件 → 操作步骤 → 验证方法 → 来源证据 → 失效条件与版本。记忆不必多，关键是**下一次能找到、能用对**。

![版本记录与并发写入检查示意图](/images/agent-memory-dreaming/versioning-concurrency.webp)

**图 2 版本与并发控制｜11:30**

读图：版本记录帮助追溯与回滚；写入前后检查内容是否变化。工程实现还需确保比较与写入是原子操作，避免并发覆盖。

### 四 Dreaming 怎样开展复盘

![编排智能体组织子智能体读取会话、整理输出记忆库的流程图](/images/agent-memory-dreaming/dreaming-process.webp)

**图 3 Dreaming 内部流程｜22:50**

读图：复制输入记忆库，由编排智能体组织子智能体分析各次会话，再整理输出记忆库。下文把这一机制归纳为四个可执行步骤。

准备输入：固定一个记忆库版本，选取权限匹配的会话，保留用户纠正、工具调用、失败和验收结果；设定时间与资源预算。

定位原因：归类重复问题，比较成功与失败案例。**先判断是知识缺失、检索遗漏、流程问题，还是工具故障**。重复出现只能提示优先调查，不能直接证明原因。

提出修改：给出新增、修订、合并或停用建议，附来源案例、适用范围和修改理由。先形成可审阅的差异，避免直接覆盖记忆。

验证发布：检查原问题是否改善、**正常任务是否被误伤**。通过验证并取得所需批准后发布；证据不足则保留候选，没有有效修改也可以结束。

### 五 牢记三个运行边界

权限边界：**能读取不等于能修改**。组织规则按授权流程更新；外部网页、日志和历史对话不能自动成为新指令。

写入边界：程序负责权限、版本与并发校验。**版本比较和写入应作为原子操作**；发现冲突就重新读取，**出现退化就暂停或回滚**。

能力边界：持久记忆和后台复盘需要实际的存储与调度。只有完成写入，并在后续任务中读取，经验才真正进入工作流程。

### 六 用一个例子检验理解

问题：修改接口后，智能体遗漏了某个客户端。先补齐修改并验收，再记录遗漏原因。若缺少客户端清单，就补充知识；若清单存在但没检索到，就改进索引；若读到了仍遗漏，就把验证加入检查步骤。**不同原因需要不同修复**。

候选记忆可以写成：“接口结构变化时，检查项目现有客户端并执行对应更新；运行相关检查确认同步。”再补充项目范围、证据和不适用条件，用新任务验证后发布。

### 学习后检查

能否解释记忆与临时草稿的区别？能否写出有适用条件和验证方法的条目？能否判断一个失败是否需要修改记忆？能否说明更新如何审核与回滚？

衡量改进时，关注重复错误率、人工纠正次数、完成时间，以及**执行与复盘的总成本**。记忆数量和文件长度不能代表学习效果。

## 回看重点与资料来源

| 时间 | 主题 |
| --- | --- |
| 03:43 | 记忆系统的演进 |
| 10:42 | 版本与并发控制 |
| 18:12 | Dreaming 概念 |
| 21:45 | 复盘系统设计 |
| 27:24 | 现场问答 |

视频与截图来源：[AI Native Dev 官方讲座录像](https://www.youtube.com/watch?v=tTcxVv8HHNw)。讲者与议程信息：[主办方讲者页](https://tessl.io/speaker/lamis-mukta)。中文翻译、图解和学习指南为本站整理；讲座内容及原始画面归原作者与主办方所有。
