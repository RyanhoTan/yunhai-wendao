# 云海问道 · 制作记录

## 已确认需求
- 从头制作独立 Three.js 修仙游戏，不读取或修改已有游戏。
- 第三人称动作冒险：开放探索、御剑飞行、即时战斗、境界突破。
- 国风幻想：风格化 3D、云海群山、古建宗门。
- 游戏资产原创制作；自行测试、独立 review，使用 commit skill 创建中文 Conventional Commit，不 push。
- 需求已逐项确认：单机完整首章，电脑键鼠优先。

## 工作区与资产
- 独立项目：outputs/yunhai-wendao。
- Director 的 profile-aware probe：Tripo、Gemini、ElevenLabs 均 MISSING。
- 按 asset-recovery.md 采用原创程序模型、自制材质、合成音效；尚无外部资产任务。

## 已完成
- 阅读 director、gameplay、graphics、UI、debug、QA、三个 generator 与 commit skill。
- 创建 Vite / TypeScript / Three.js 独立 scaffold。
- 实现连续山谷、原创人物/妖灵/石灵/古建/植被、原创 Canvas 材质与 Web Audio。
- 完成主线、奇遇、御剑、实时战斗、突破、炼丹、地图/札记/背包/设置、存档与死亡重试。
- 独立 review 已返回具体缺陷；已修复任务前炼丹卡死、剑斩朝向、原地踏步、札记恢复、标题设置存档覆盖、对话回调丢失、Tab 焦点和轻缓动效冻结人物。
- 真实键鼠首章已两次完成筑基，并刷新恢复境界、任务和奇遇札记；真实失败重试与桌面/笔记本 UI 测试通过。
- 完成未暂停动作视频与接触帧诊断；RTX 4050 硬件渲染确认。最初 SwiftShader 记录只作诊断，不作为 FPS 证据。
- 世界增加原创石路莲纹、地表细节、山体/树冠层次；远处妖灵 LOD 合并原模型并保留轮廓。
- 宗门 rear wall 的镜头遮挡、墙体碰撞与三级石台地面高度已修复；受阻镜头采用侧向空位，移动以实际镜头方向计算。

## 发布状态
- 最终构建、通关/存档/重试、动作、地图像素、桌面布局、基线比较与 7 场景 manifest 已通过，详细记录见 final-evidence.md。
- 地图首帧空白与画布溢出已修复，旧失败与当前证据分开保留；当前 runId 为 release-20261005-r2。
- 代码和证据已整理为独立 Git 交付；提交记录以项目 Git HEAD 为准，按 commit skill 检查中文 UTF-8，不 push。
- 无待处理资产任务或验收阻塞项；本地 preview 使用 4194，重启方式见 README。

## 恢复记录
- 已创建持续 goal，持续到测试、review、提交与交付完成。
- 两个资产/UI子任务遇到额度限制中断；保存的模型/世界/Hud.ts 已恢复，由主任务完成集成与CSS。
- 首次构建发现 diagnostics typing 缺 yaw，已补齐扩展字段。
- npm audit fix 后依赖审计为零漏洞。
- 只读权限曾阻塞修复，2026-10-05 已恢复写入，goal 已恢复 active。
- 独立 review 与场景精修两个子任务已结束，无待下载资产或付费生成任务。
