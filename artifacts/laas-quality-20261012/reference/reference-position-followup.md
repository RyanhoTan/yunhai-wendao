# LAAS 森林位置与真实时刻补查（2026-10-13）

本次仅读取已有记录、缓存源码与固定仓库文本；没有启动浏览器/GPU，没有生成新截图，没有修改游戏代码或操作 Git。以下位置均不能当作本轮已复现画面。

## 森林内部与根部的证据边界

- **森林内部候选：seed=1，x=-500，z=600。** 作者实际运行图 `author-runtime-hero-forest.png` 的 HUD 显示相机 `(-500.0,234.6,600.0)`、启动 T=11；图中有近中景树干、分枝、冠层和林下覆盖。图像精确匹配固定提交的 `shots/phase-5/floor-hero-19.5Mtris.png`，图像 SHA-256 为 `fa6a82a919f4fecb047a2b09e868394d9af2d2826d29f30f870ec12343940cca`。该图附属 `floor-hero.json` 仅有性能计数，**没有 yaw、pitch、fov 和距地高度**，因此完整 cam 未定位。HUD 的 T=11 也是启动参数，不能独立证明太阳内部状态。
- 下一轮可尝试 [森林候选 URL](https://dc5fzrbo8ssfx.cloudfront.net/laas/?seed=1&scene=world&x=-500&z=600&alt=4&yaw=-0.785&pitch=-0.05&T=12&preset=high&freeze=1&hud=1&dpr=1)。其中 x/z 来自作者图；**alt=4、yaw=-0.785、pitch=-0.05 是借用 Bookmark7 的搜索起点，不是已找回的作者镜头**。`TerrainScene.ts:269–278` 依据实际高度场取 y=ground+alt，避免把作者四舍五入的 y 当作精确贴地高度。4 米高度仍需降低到真实观察/行走高度并实际检查构图。
- Bookmark7 的完整定义为 x=-850、z=850、alt=4、yaw=-0.785、pitch=-0.05、tod=12.5（`Bookmarks.ts:38`）。但作者 `docs/DELTA.md:137–138` 将 `(-850,850)` 标为 riverbank；`STATUS.md:310–312` 还记其近树干构图需要调整。现有 seed42 的 creek/gorge 视图也不构成独立树根近景。
- 作者 `grass-floor` 的位置为 seed1 `(-1430.0,351.9,-250.0)`；`DELTA.md:137` 明确称此位置为 meadow，不能重命名为森林根部。
- **结论：森林内部有可信搜索位置；完整作者内部 cam 与独立树根/根周生态近景尚未定位或复现。** 下一轮必须在实际森林内部选择能辨认根外扩、落叶附着及枝叶关系的不同镜头，再记录精确 `getPose()` 与地面探测值。

## 严格 T=17.3 的启动与核验

1. 去掉 `shot` 参数；即使同时给 cam，`TerrainScene.ts:55–56` 仍会用 shot 的 tod 覆盖 T。seed42 已记录的山地位置可使用 [严格时刻候选 URL](https://dc5fzrbo8ssfx.cloudfront.net/laas/?seed=42&scene=world&cam=1500,580.1177673339844,1900,0.65,-0.18,55&T=17.3&preset=high&freeze=1&hud=1&dpr=1)。此参数方案源码成立，但现有纯 URL 实际启动失败，**不承诺运行稳定或已有黄金图**。
2. 固定源码 `TerrainScene.ts:60–62` 暴露 `window.__laasDbg={engine,sunSky}`；`tools/probe-state.ts:24–31,63–64` 已使用它读取真实太阳状态。下一轮首先检查在线部署是否也存在该句柄，不能把固定仓库版本直接等同于无版本在线部署。
3. 记录 `__laasDbg.sunSky.timeOfDay` 与 `sunSky.sun.position`。`SunSky.ts:83` 在 await atmosphere 前就写时刻，所以仅字段等于17.3仍不足。sun.position 在 atmosphere 更新后才赋值（`:85–94`）；由同一源码计算，T17.3 的归一化位置应约 `[0.2440806172,0.5294892933,0.8124443000]`，长度约9000。可同时核对 `engine.post.grade`（若在线运行时可读）与 `gradeParamsAt(17.3)`；`PostStack.ts:638–639` 更新调色值。
4. 同时确认 ready=true、error=null、实际非零绘制/三角面与森林计数，settle后再次读取状态，并保存完整URL、相机与无HUD截图。以前失败会话一度 ready，但最终出现显存错误、树计数0与draws0；ready或HUD单独不能证明正常画面。
5. 现有失败为 `VK_ERROR_OUT_OF_DEVICE_MEMORY` → `Instance dropped in popErrorScope` →截图timeout，已保存完整日志与摘要；本次没有重试。现有两张远景依然是 `timeCommanded17.3-actualTimeUnverified`。

**LAAS 的17.3时刻与作者最佳黄金构图应分别记录。** `Bookmarks.ts:34` 的作者 Golden vista 使用T=19；同一太阳模型计算，T17.3太阳高度约31.97°，T19约14.11°（`SunSky.ts:72–79`）。严格17.3成立不自动证明已复现作者T19的暖色低太阳效果；比较画面应同时报告时刻与景别，不依靠golden文件名判断。

## 固定来源

仓库：[Braffolk/fable5-world-demo](https://github.com/Braffolk/fable5-world-demo/tree/fd75fdb718996908aad3d22b59dfa297dc94298d)，固定提交 `fd75fdb718996908aad3d22b59dfa297dc94298d`。下表为该提交树中 Git blob SHA-1，位置由本次文本读取核对；不代表在线bundle相同。

| 源文件 | 相关行 | Git blob SHA-1 |
| --- | --- | --- |
| `src/debug/TerrainScene.ts` | 55–62、242–247、269–278 | `f168b4d2d378de7d823bd26e386f3a429b6e53d6` |
| `src/debug/Bookmarks.ts` | 34、38、43–46 | `89c26833395cf4c7fc87887ec02e02f37d278bba` |
| `src/debug/HUD.ts` | 81 | `2ca39ec8cca5fa6454309a0e9ace6ed8c23525ff` |
| `src/sky/SunSky.ts` | 14、72–94 | `ab1df36465e82f8891f05dc24ac82e128ada2769` |
| `src/render/PostStack.ts` | 60、638–639 | `32cea7f1d5dd955f1400b88da74ad61c6a1217fc` |
| `tools/probe-state.ts` | 24–31、63–64 | `475bbbd2f399e9069cb2a732d062b17c6811f829` |
| `docs/DELTA.md` | 137–138 | `f8bacdaf5c6acb1f4f247f2dd757a9b45a861aa4` |
| `STATUS.md` | 310–312 | `8f1fdf78120115b6a79c5fffbcc923580b783856` |
