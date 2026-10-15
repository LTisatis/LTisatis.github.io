# 科研文件夹整理 Skill

**research-folder-organizer 1.1.0** 用于初始化或整理科研项目目录，并维护研究思路、实验结果、测评规则、数据说明和进度交接。

本 Skill 基于 LTisatis 的[《AI时代的科研工作流总结》](https://ltisatis.github.io/posts/ai-research-workflow/)制作。既有目录适配、可逆迁移、路径引用检查和只读盘点工具是技能实现中的补充；来源边界见 [source-workflow.md](research-folder-organizer/references/source-workflow.md)。

## 获取与使用

- [浏览技能目录](research-folder-organizer/)
- [阅读 SKILL.md](research-folder-organizer/SKILL.md)
- [下载 1.1.0 完整技能包](https://ltisatis.github.io/downloads/research-folder-organizer-v1.1.0.zip)
- [博客公告](https://ltisatis.github.io/posts/research-folder-organizer/)

安装时保留 `research-folder-organizer/` 的完整目录结构，包含指令、参考资料、脚本和评估文件。将整个目录放入所用工具的本地技能目录，加载后指定要整理的科研项目路径：

```text
请使用 $research-folder-organizer 整理「科研项目路径」，沿用现有结构并补齐必要记录。
```

也可以明确要求“只检查、给出建议，不修改文件”。

## 工具与验证

只读盘点工具使用 Python 3.9+ 标准库，不需要联网或额外依赖；没有 Python 时，技能可使用环境提供的文件工具盘点。

- [工具输入输出与退出码](research-folder-organizer/references/inventory-cli.md)
- [评估、已知验证范围与版本维护](research-folder-organizer/evals/validation.md)

技能优先沿用已有目录结构，保护原始数据和实验版本，记录迁移及恢复依据。附带的行为案例是验收标准，不能视为已完成的模型效果评估。
