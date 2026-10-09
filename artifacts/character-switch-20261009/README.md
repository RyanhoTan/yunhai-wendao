# 角色形象切换验收（2026-10-09）

已导入用户下载的黑衣角色「玄影行者」，可按 K 或点击右侧“角色”与「翡翠花影」切换。标题页和暂停菜单也有入口。切换保持当前位置、朝向、修行、物品、战斗与御剑状态，形象偏好单独记忆，原修行存档不变。

资源接入提交为 `ce55105`，角色选择与切换提交为 `d08b2bd`。两个模块均完成相关验证与源码 review 后立即本地提交，中文 UTF-8 已核验，未 push。

## 动作与资源

玄影行者源文件为 `/home/ryan/下载/Meshy_AI_Shadowbound_Wanderer_All_Animations.glb`。仅把内嵌 PNG 纹理改为 WebP，运行 GLB 为 14,990,020 字节，模型、蒙皮、骨骼和所有原始动画保留。来源指纹及二进制对比见 [资产检查](asset-review.json) 和 [接入说明](asset-import.md)。

每名角色只使用自己文件内的动画。玄影自带行走、跑步、三连击、越障跳跃和死亡片段；游戏使用前四种覆盖既有行走、跑步、攻击、闪避和落地。缺少的待机与御剑保持模型原始站姿，动作时间为 0，来源为 `rest-pose`，没有借用或生成片段，没有新增施法摆臂。死亡片段仍在 GLB 中，本次未扩展死亡表现。

## 验证结果

- `npm run build` 通过，既有 Vite 大包提示保留。
- 资源模块的 `npx playwright test tests/character.spec.ts` 五项通过。
- 最终 `npx playwright test tests/character-switch.spec.ts tests/save.spec.ts tests/regression.spec.ts` 七项通过，约 1.1 分钟，零失败/跳过/flaky。覆盖标题选择与重载、非法形象回退、真实旧存档、重复切换、焦点恢复、Tab 范围、三个尺寸布局和真实输入操作。
- [切换数据](switch-preservation.json)：位置 (116, 3.4, 65.5)、修为 47、境界 1、任务 3、气血 81、灵草 4、丹药 6 等前后完全一致，原存档字符串不变。两个模型预热后连续十次切换，几何仍为 156，纹理仍为 25。
- [实际输入数据](native-input.json)：`Running` 跑步、`Triple_Combo_Attack` 攻击并扣血、`Jump_Over_Obstacle_2` 闪避；城镇实体后墙前 x≈112.075 停住。御剑中切换保留完整状态，恢复后真实 W 输入使 z 从 -70 前进至约 -81.732，收剑落地正常。浏览器错误 0。
- 桌面 1280×720、笔记本 1024×768、窄屏 390×844 的面板边界、图片加载、键盘焦点及滚动通过，关闭按钮一直可见。游戏仍以电脑键鼠为主要玩法，窄屏验证仅涵盖本次面板。
- `node scripts/capture-character-switch.mjs` 和 `check_evidence.py` 通过。使用独立浏览器中的同一形象偏好和既有真实场景 hooks，正面与御剑画布均为 RTX 4050 硬件渲染、非空且零浏览器错误；对应 19/95 calls、311953/439102 三角形，均在桌面预算内。这些静态检查不作为 FPS 测量。

本次视觉保护采用实际面板截图、布局断言、模型动作截图与动态录像审查；保留世界的原基线，不为新增界面刷新无关场景。没有改变首章玩法或难度，未重新运行整章 bot。第一次自动化失败来自测试过早发出按键，已等待资源加载和面板实际关闭后再输入；最终整组全部通过。

## 画面与录像

- [桌面角色面板](panel-desktop.png)、[笔记本面板](panel-laptop.png)、[窄屏已选择状态](panel-narrow-selected.png)。
- [人物正面](shadowbound-front.png)、[静态御剑姿态](shadowbound-flight.png)。
- [原生攻击](native-attack.png)、[闪避](native-dash.png)、[墙体阻挡](native-wall.png)、[御剑移动](native-flight.png)、[落地](native-landed.png)。
- [未暂停的真实输入录像](native-motion.webm) 与 [录像抽帧](motion-sheet.png) 已查看；可见跑步、攻击、墙前受阻、静态御剑移动及落地，没有新增缺失动画。录像包含游戏资源加载段。
- [当前验收清单](evidence.json) 声明两种桌面状态及必要面板/动态/数据证据，检查确认全部 9 项。

复验：先执行构建并启动开发服务，再运行上述 Playwright 命令，最后执行 `node scripts/capture-character-switch.mjs`；脚本可接收带 `?test=1` 的预览 URL 参数。录像抽帧从开发服务读取项目内的 `.webm` 文件，因此使用生产预览参数时该文件也需能通过 HTTP 访问。
