# 云海问道 · 云岚初境

原创国风幻想 3D 修仙游戏，电脑键鼠优先。首章包含一片自然山谷、南部听潮海岸、宗门、松风林、玉镜潭、望月台与镇山台，可自由探索、御剑飞行、即时战斗、采药炼丹，完成历练后筑基。首章结束后仍可探索灵匣与未收集的灵草。

## 运行

需要 Node.js 22 或更新版本，以及支持 WebGL 2 的电脑浏览器。推荐近期 Chrome / Edge；本次验证使用 Chromium 148 与 RTX 4050。

```sh
npm ci
npm run build
npm run preview -- --port 4194
```

打开 http://127.0.0.1:4194/ 。开发模式：`npm run dev`，默认端口 5188。

## 操作

| 输入 | 动作 |
| --- | --- |
| WASD / 方向键 | 按实际镜头方向移动 |
| 右键拖动 / 滚轮 | 转动镜头 / 调整远近 |
| 鼠标左键 / R | 剑斩，近距离自动转向妖灵 |
| Q | 锁定御雷，消耗灵气 |
| Shift | 地面闪避；御剑时加速 |
| E | 交谈、采药、开启阵眼或灵匣 |
| B | 境界突破 |
| F | 解锁后御剑 / 收剑 |
| Space / C | 御剑升高 / 降低 |
| H | 服用回春丹 |
| M / J / I | 地图 / 札记 / 背包 |
| Esc | 暂停、返回或继续对话 |

向前与沈清尘交谈，带回三株青灵草，领取心诀并突破练气圆满。随后清除阵眼附近妖灵并注入灵气，解除北方石灵封印，击败石灵后筑基。红色蓄力圈提示敌人重击；闪避带有短暂无敌时间。落地恢复灵气，真气耗尽会自动降落。镇山结界要求落地战斗。

从宗门向南（起始镜头按 S）沿通路到听潮海岸。沙滩可以步行，浅滩可涉水；深水需御剑，F 不会让人物落到深海。海上真气耗尽时自动返回浅滩，海上存档重载会选择避开礁石的安全沙滩。

设置包含静音、音量、高/轻量画质、轻缓动效和全屏。轻缓动效保留行走与攻击动作，减少环境晃动和镜头震动。

## 存档

任务、境界、物品、已采灵草、阵眼、灵匣、已击败妖灵及位置保存在当前浏览器的 localStorage。关键事件、每 15 秒及离开页面时自动保存；暂停菜单可手动保存。标题页设置不会改写进度。死亡重试保留成长与任务；损坏存档会退回可开始新游戏的标题页。点击“重新启程”会重置当前浏览器进度。

## 原创资产

角色衣袍、发髻、剑、三尾妖灵、镇山石灵、古建、山体、植被、灵草、阵眼和灵匣均由项目程序建模。地表、石材、莲纹和宗门匾额由 Canvas 绘制；UI 使用原创 SVG 图标。音效、风声与五声音阶背景音由 Web Audio 合成。游戏运行资产没有下载美术素材或使用外部生成 API，具体来源见 [资产清单](artifacts/asset-manifest.json)。

本轮参考 [coastal-simulation](https://github.com/iamtechartist/coastal-simulation) 的海岸观感与 [THREE.Terrain](https://github.com/IceCreamYou/THREE.Terrain) 的自然地形、材质混合和植被分布思路；没有使用它们的示例地图。新世界以原创噪声生成、地形 LOD、程序树木和自绘图集构成，保留原首章任务坐标。

## 验证与静态发布

```sh
npm test
npm run inspect:canvas -- --headed --manifest artifacts/evidence.json --url 'http://127.0.0.1:4194/?test=1' --seed 42
python3 /home/ryan/.codex/skills/threejs-game-director/scripts/check_evidence.py . --manifest artifacts/evidence.json
```

测试在本机图形会话中使用独立 Chromium 窗口、单 worker。无图形界面的 CI 可设置 `CI=1` 使用 headless；软件渲染结果可检查功能和像素，不能证明硬件 FPS。首次使用需要 `npx playwright install --no-shell chromium`；Ubuntu 26.04 的 Playwright 安装器兼容平台可设 `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64`。

`dist/` 可放到 HTTP 静态服务的根目录或子目录，Vite 使用相对资源路径，不需要服务端路由。直接以 `file://` 打开不属于支持的运行方式。默认生产入口隐藏测试工具；显式 `?test=1` 为 QA 开启场景 hooks 与 diagnostics，不包含玩家作弊菜单。

详细通关、死亡重试、截图、动作视频、性能、review 和限制见 [验收证据](artifacts/final-evidence.md)。本作是有限地图的完整单机首章，包含三处灵匣奇遇；后续章节、联机和移动端操作不在当前范围。
