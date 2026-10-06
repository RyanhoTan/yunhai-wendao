# 云海问道 · 自然山谷与可探索海岸验收（2026-10-06）

已把原有柱状远山和层叠树冠改成连续自然山谷、分叉树林与草蕨，并将天空、海洋、干湿沙滩和礁石接入同一可探索地图。人物可从宗门实际走到南岸、浅滩涉水，解锁后御剑探索海面。保留首章主线、地图、成长、战斗与本地存档。

试玩：<http://127.0.0.1:4194/>。WASD移动、右键拖动镜头、E交互、F御剑、Space/C升降、Shift闪避或飞行加速，完整说明见[README](../README.md)。起始镜头向南按S可沿通路到海边。

## 地形与资产

借鉴 [coastal-simulation](https://github.com/iamtechartist/coastal-simulation) 的海天、沙、浪与岩石观感，以及 [THREE.Terrain](https://github.com/IceCreamYou/THREE.Terrain) 的连续噪声、坡度/高度材质和植被分布思路。没有使用示例地图、heightmap、eztree模型、贴图或状态缓存。新代码、模型、shader和Canvas图集由本项目创作；参考checkout只作只读研究，不提交到游戏仓库。

- 连续固定种子地形，宗门/阵眼平地、山道和湖盆塑形；近景1m、远景2m的80m分块LOD，共用法线与角色三角插值高度。地图范围保持约600×600m，远山和远海只是边界外背景。
- 三类原创弯曲树干/分叉叶冠，自制树皮与叶/蕨/草图集；700树、7000草簇、350蕨，六区域批次，保护通路、任务平地、南岸与陡坡。
- 原创动态天云、解析岸浪、透明浅水色吸收近似、天光反射、泡沫和干湿沙；23块大礁石与碎石/卵石/沙丘草。不是浅水流体求解器，也没有复制参考项目的物理仿真。
- 深水禁止徒步/收剑；御剑高度以海面为基准。真气耗尽返浅滩，保存/读取搜索避开礁石的沙滩落点。高礁石有立体代理，只有超过岩顶才能飞越。

[设计简报](design-brief.md)、[关卡计划](level-plan.md)、[资产清单](asset-manifest.json)、[制作记录](game-progress.md)。三家外部生成凭据仍MISSING，采用原创程序资产，没有API费用或待完成生成任务。

## 构建与真实输入验收

当前源代码提交a5176e6，测试提交6e6a875；完整源文件SHA-256、报告范围与逐图指标见[本轮汇总](qa/test-summary-20261006.json)。类型检查与生产构建通过；Vite 8.3.1，JS 682.72kB/gzip185.70kB，CSS19.73kB/gzip5.44kB，source map约3.24MB。

[完整Playwright报告](qa/natural-coast-full-tests.json)：16项全部通过，0跳过、0不稳定、0失败；单worker独立Chromium硬件窗口，生产preview，1280×720与1024×768。主线从新游戏出发仅使用真实键鼠：师长对话、采药、复命、突破、御剑、阵眼守卫、灵匣、石灵与筑基，刷新后任务/境界/奇遇札记恢复。场景hook仅用于建立碰撞、动作或晚期截图的初始条件，未跳过主线进程。

[通关指标](qa/bot-metrics.json)：quest5、realm2、气血160、推进17704帧、errors空；score14包含阵眼数，不代表击杀14敌人。[真实通关截图](qa/real-input-completion.png)。失败重试、任务前炼丹保护、损坏存档、标题设置、对话回调、地图首帧与笔记本边界、生产入口诊断隐藏都通过。

[海岸输入](qa/coast-traversal.json)：从宗门按真实S行走约161m到浅滩，水深.742m、脚高与地面一致，继续前进被深水边界限制，气血100。真实右键转镜头、地图海岸标记通过。低空撞高礁石、高空越岩、存档重载不弹出岩体、海上拒绝收剑、升高与真气耗尽返岸均已验证；新测试见[coast.spec.ts](../tests/coast.spec.ts)。[地形回归](../tests/terrain.spec.ts) 检查近景地面误差<.08m和共享边界法线一致。

## 动作与画面证据

[海岸视频](qa/coast-motion.webm)、[16帧联系图](qa/coast-motion-contact-sheet.png)、[指标](qa/coast-motion.json) 覆盖真实海上移动/升高、保存重载、返浅滩及沙滩行走，视频包含启动和重载加载段。1.3秒水面区域变化比例.567，错误空；联系图看到浪线连续变化与岸边进退。

[人物视频](qa/hero-motion.webm)、[16帧联系图](qa/hero-motion-contact-sheet.png)、[指标](qa/motion-metrics.json) 覆盖起步/停止、剑斩接触、法术、闪避与御剑起降；查看了联系图及接触截图，动作未冻结，没有明显关节塌陷或重复根位移。仍采用程序关节动画，未宣称精确足底IK。轻缓动效保留核心人物动作。

在RTX4050的1.8秒宗门行走采样中，帧间隔7.109ms/140.67FPS，位移12.04m、腿部跨度1.560rad。只代表这台机器的该场景，不能当作整张地图或其他设备保证。动作样本最高240calls/625330三角形；实际浅滩镜头285calls/668674三角形。

当前[manifest](evidence.json) runId为natural-coast-20261006-r2，12声明场景全部捕获，GPU均RTX4050硬件，console/page errors均0；[覆盖检查](qa/evidence-check-20261006.txt)确认12报告和7动作/进程文件存在。全部原图已人工查看，没有用标题或静态hook代替输入验收。预算calls≤300、三角形≤750000、geometries≤300、textures≤60，所有声明场景通过。

| 场景 | 熵 | 边缘 | 对比 | 主色占比 | Calls | 三角形 | 几何/纹理 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| [natural-land](natural-coast-20261006-r2/desktop-natural-land.png) / [JSON](natural-coast-20261006-r2/desktop-natural-land.json) | 5.80 | 0.388 | 110.1 | 0.094 | 150 | 488722 | 106/9 |
| [forest](natural-coast-20261006-r2/desktop-forest.png) / [JSON](natural-coast-20261006-r2/desktop-forest.json) | 5.33 | 0.235 | 120.6 | 0.213 | 206 | 602200 | 112/9 |
| [coast](natural-coast-20261006-r2/desktop-coast.png) / [JSON](natural-coast-20261006-r2/desktop-coast.json) | 5.02 | 0.146 | 126.9 | 0.133 | 35 | 156380 | 42/4 |
| [coast-rocks](natural-coast-20261006-r2/desktop-coast-rocks.png) / [JSON](natural-coast-20261006-r2/desktop-coast-rocks.json) | 4.71 | 0.142 | 130.7 | 0.208 | 38 | 184894 | 44/6 |
| [coast-flight](natural-coast-20261006-r2/desktop-coast-flight.png) / [JSON](natural-coast-20261006-r2/desktop-coast-flight.json) | 5.90 | 0.187 | 125.1 | 0.086 | 46 | 203832 | 52/6 |
| [active-play](natural-coast-20261006-r2/desktop-active-play.png) / [JSON](natural-coast-20261006-r2/desktop-active-play.json) | 5.49 | 0.260 | 97.9 | 0.100 | 133 | 497082 | 101/9 |
| [flight](natural-coast-20261006-r2/desktop-flight.png) / [JSON](natural-coast-20261006-r2/desktop-flight.json) | 5.68 | 0.279 | 121.1 | 0.100 | 127 | 468944 | 101/9 |
| [boss](natural-coast-20261006-r2/desktop-boss.png) / [JSON](natural-coast-20261006-r2/desktop-boss.json) | 4.83 | 0.299 | 91.6 | 0.187 | 74 | 232132 | 90/9 |
| [map](natural-coast-20261006-r2/desktop-map.png) / [JSON](natural-coast-20261006-r2/desktop-map.json) | 2.88 | 0.093 | 36.3 | 0.344 | 245 | 630574 | 103/10 |
| [fail](natural-coast-20261006-r2/desktop-fail.png) / [JSON](natural-coast-20261006-r2/desktop-fail.json) | 1.46 | 0.029 | 12.4 | 0.717 | 67 | 177654 | 100/9 |
| [complete](natural-coast-20261006-r2/desktop-complete.png) / [JSON](natural-coast-20261006-r2/desktop-complete.json) | 1.94 | 0.038 | 16.6 | 0.527 | 244 | 629566 | 102/10 |
| [title](natural-coast-20261006-r2/desktop-title.png) / [JSON](natural-coast-20261006-r2/desktop-title.json) | 5.67 | 0.079 | 150.6 | 0.055 | 35 | 156380 | 42/4 |

地图、失败和完成场景的低对比/低熵来自菜单遮罩；环境评分基于活动探索、森林、御剑和战斗原图。DPR精致上限1.5，流畅1；精致2048阴影，流畅关闭阴影，无后处理链。自定义固定1/60秒角色物理与地形采样，建筑/礁石Box3和圆形代理，不是通用刚体世界。

## Review 与修复

[独立review记录](qa/environment-review.md)保留四项可量化缺陷及复核：高岩穿模、岩内存档恢复、地形chunk光照缝与最高38cm脚地误差。主任务修复后，reviewer离线复核原四项均消除。随后修复远山接缝、远岸悬空鳍片与云底拉丝，并完成最新完整测试和原图复核。reviewer在已提供源码复核和r1图片意见后遇到额度限制，本报告没有声称收到最终独立无缺陷认证。

森林前景硬边暗区在同机位关闭阴影后仍存在，射线指向数米外的实际山坡，后方另有远地面，确定是近坡遮挡轮廓；保留同机位，增加1m近景与地表细节，未靠换机位隐藏。历史r1及中间捕获保留为排查记录，没有重新标记为r2通过。

## 视觉自评与边界

按graphics skill十项0–3量表，已查看scene1/2/3校准图与全部本轮场景。这是主任务自评，供核对原图，不是外部认证。

| 类别 | 初版 | 本轮 | 依据 |
| --- | ---: | ---: | --- |
| 美术方向 | 2.5 | 2.5 | 自然海天与山谷融入青玉/暖金修仙主题 |
| 主角 | 2.2 | 2.2 | 保留分层衣袍、束发、剑与状态动作，面部简化 |
| 敌人 | 2.1 | 2.1 | 保留三尾/石甲轮廓、预警与战斗，种类有限 |
| 奖励/交互 | 2.3 | 2.3 | 草、阵眼、灵匣与反馈、札记保持完整 |
| 世界 | 2.2 | 2.5 | 连续山体、林斑、草蕨、沙丘、礁石与可探索海面 |
| 材质/纹理 | 2.3 | 2.5 | 坡度/高度材质、自绘枝叶、矿物岩与干湿沙；测量资源预算 |
| 光照/渲染 | 2.3 | 2.3 | 晴天主光/填光、PMREM天光、接触阴影、层次清晰 |
| 特效/动作 | 2.3 | 2.3 | 保留事件反馈，新增风摆与动态岸浪，未暂停视频 |
| UI/HUD | 2.5 | 2.5 | 保留国风界面，新增海岸标记，桌面/笔记本布局通过 |
| 性能证据 | 2.6 | 2.6 | 当前12图预算、16项回归、真实输入、LOD与动作指标 |

平均2.38/3；没有量表中的未解决自动失败。交付定位为原创风格化首章，不宣称写实3A或showcase。海洋采用解析波与视觉近似，没有流体求解、实时平面反射或游泳系统；地图有限，深海通过御剑探索。没有联机、后续章节或移动端触控验收。

本轮使用director、graphics-builder及其四份references、gameplay集成、QA-release及release/visual/bot/evidence references、commit skill；沿用此前已制作的角色/UI/音频。凭据缺失按asset-recovery使用原创程序资产。提交按用户要求分批，中文Conventional Commits逐批检查HEAD UTF-8，不push；前四批8c8f6a1、906a2fd、a5176e6、6e6a875，第5批782b6b1保存验收证据；第6批单独提交文档。
