# 项目开发规则

本文件适用于《云海问道》仓库及其全部子目录，后续每次继续开发都须遵守。

## 小模块完成即提交

- 每完成一个小模块或一个独立、可验收的进度单元，完成相关验证和代码 review 后，立即创建一次 Git commit，再开始下一个独立模块。
- 不把多个已完成模块积累到最后一次性提交。模块应按功能或开发进度划分，不按文件数量机械拆分。
- 同一模块所需的实现、类型、调用方和必要测试应一起提交，保持该提交完整、可构建；未完成的工作不得描述为已完成。
- 验证范围与改动相匹配：运行受影响的测试与必要构建；图形或玩法改动还应检查相关实机画面与真实输入。纯文档修改检查内容和 diff 即可。
- 只暂存当前模块相关文件，不混入用户或其他模块的改动。已有暂存变更按用户明确选择处理。
- 使用 `/home/ryan/.codex/skills/commit/SKILL.md` 的流程创建简体中文 Conventional Commit，并立即检查 `HEAD` 中提交信息的 UTF-8 编码。
- `.git-commit-message.txt` 仅作临时输入，不得提交，校验结束后删除。
- 用户已授权上述逐模块本地提交，无须每次重复询问；默认不 push，不改写较早的提交历史。
- 在进度记录中说明已完成模块、验证结果和提交标识。提交失败时保留工作并说明原因，不宣称已提交。

## Project Architecture and Incremental Refactoring

- Simple pages, prototypes, and small tools may start in a single file. Avoid introducing complex architecture before it is needed.
- Before adding a feature, review the responsibilities and complexity of the existing files and decide whether the current structure is still appropriate.

### When to Split Files

Complete the necessary structural changes before adding more functionality when any of the following applies:

- A file handles multiple independent pages or business modules, such as the home page, login and registration, settings, and lists.
- UI, state, and event handling for unrelated features are mixed together, making changes to one feature likely to affect others.
- UI or logic is repeated in several places and would benefit from being extracted into a shared module.
- A file has become difficult to read, navigate, or modify. Line count may be a useful signal, but must not be the sole criterion.

### How to Refactor

- Split files by page, business module, or component responsibility so that each file has a clear purpose.
- Keep entry files focused on the application entry point, overall layout, and module composition. Put feature-specific logic in the corresponding modules.
- Organize pages, styles, scripts, and shared logic according to the actual technology stack, following existing project conventions where appropriate.
- Introduce only the structure currently needed. Splitting a page should not automatically require a new framework or complex tooling.
- Treat structural improvements as part of feature development. When refactoring is needed, complete it proactively instead of merely suggesting it and continuing to add code to the same file.
- Preserve existing functionality and UI behavior while refactoring, and update imports, resource paths, navigation, and event bindings as needed.
- Place new features in their corresponding modules. Continue incremental refactoring whenever responsibilities become mixed again.

### Example

A project with only a home page may use `index.html`. After adding login and registration, decide whether to split the implementation based on its complexity. When adding independent features such as settings and lists, reassess the structure, organize them into separate pages or view modules, and extract reusable parts instead of continuing to put everything in `index.html`.

## 当前陆地改造：Three.js（2026-10-10 用户覆盖指令）

- 用户明确改为直接使用 Three.js：山体结构与道路按地图图像，植被和地表参考 `Braffolk/fable5-world-demo`；只改陆地，海洋与海边保持现状。
- 此轮暂停旧 GLB 制作与接入工作，保留已有资产、任务与记录；不调用 Meshy，不要求用户审批程序化地形代码。
- 以下 GLB 工作流保留为历史规范，只有用户重新要求 GLB 时适用。

## AI 地形 GLB 工作流

- 地形改造按 [AI 地形制作工作流](docs/ai-terrain-workflow.md) 执行；继续时先读取 `artifacts/terrain-pipeline/plan.json` 和 `artifacts/game-progress.md`。
- 用户只审批地图图像与地形概念图；批准对应输入图后，Meshy Image to 3D、GLB 优化、拼接、碰撞、验证由 AI 执行。地图批准不等于所有地形输入图批准，不以沉默替代审批。
- 建筑继续用 Three.js 建模；地形主体使用 GPT 概念图与 Meshy GLB。审批及外部任务状态以真实图像版本、哈希和任务 ID 记录，未生成/未验证的工作不得描述为完成。
