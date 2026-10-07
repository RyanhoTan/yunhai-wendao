# 云海问道 · 现实昼夜、天气与Moon验收（2026-10-07）

现实同步昼夜、日月、云雨和“观天调候”面板已进入可探索游戏。月亮参考用户指定Emotive Engine球面明暗思路，原创程序月海/环形山与小光晕；云可遮月，海面显示对应天色和日月高光。当前运行a86cbdc的17个唯一相关用例均通过，50张图像基线独立比较通过；15个RTX4050状态零页面/控制台错误、非空且在预算内。两个独立只读review发现的P2已经修正，无待处理功能失败。

试玩：[本地游戏](http://127.0.0.1:4194/)。刷新已有页，按P或右侧云图标打开天气面板。选择现实同步/手动预览，调整时刻、云量、雨量，或选晴空/阴云/落雨；启用随机天气后每2–4分钟平滑变化，手调会关闭随机。P/Esc收起，调候暂停战斗但可转镜头。偏好独立保存，不覆盖任务成长；之前保存的手动模式可通过“现实同步”恢复本机时钟。

## 原创适配与边界

[Tideline与Moon研究](../docs/weather-references.md)固定源码7999581dcd61e158e8277d9b54592b45c790e2b3和ae2accddc8f3e65a024c38b55e71a54b7fb10a14。Tideline只读源码研究，没有实际运行其演示；Moon在作者演示实际操作Full/Quarter/Crescent，参考[实际请求与运行记录](qa/weather-reference/moon-preview-report.json)。作者演示月面贴图404、colorMapReady=false，实际截图是灰色回退球与可用相位；没有下载NASA贴图，不把参考图片当成本作画面。

本作原创共享海天shader、轻量FBM分层云、星点、球面明暗/月海与12处稀疏环形山。沿用既有灯光、雾和水体，只调天色/强度/反射/高光，不修改浪形、岸线或湖泊几何。实例雨最多1200条、一批次，跟随人物三维位置与御剑高度；64×64/64米高度网格包含地面/海面与现有屋顶包围盒，角色每移动4米更新，雨不画在遮挡高度以下。轻量/轻缓减少滴数和速度，资源复用并在退出释放。

现实同步读取设备本地时钟和时区，即使其他菜单暂停仍刷新；当前机器Asia/Shanghai。日弧按原创06:00–18:00表现，固定艺术满月，没有纬度/季节日长、日期月相或在线真实气象。随机仅改变晴阴雨，8秒阻尼，不改变昼夜来源或战斗数值。PMREM是初始日间生成一次的PBR环境，日夜仅调强度；天空与海面反射动态同步，未逐帧重建PMREM。雨遮挡约1米网格/包围盒，未做精细瓦片或伞面碰撞。

## 实际输入与回归

[测试汇总](qa/weather-tests-summary.json)17个唯一用例，未解决失败0：

- [天气七项](qa/weather-module-tests.json)：7通过32.764秒，包含三项纯状态、跨午夜/暂停时现实钟跳变、真实P/滑块/选择/随机及独立偏好、行走/御剑/屋顶遮雨/资源稳定、雨夜真实Z/T战斗。
- [既有操作九项](qa/weather-regression-tests.json)：9通过102.867秒，四项护盾、并用攻击、地图首次绘制、标题设置/对话、桌面镜头/暂停/小屏、真实死亡重试。
- [50图独立比较](qa/weather-baseline-tests.json)：1用例通过22.327秒；[all模式更新](qa/weather-baseline-update-tests.json)38.370秒。40张旧世界/攻击/盾刷新，新增晨昏/月夜/雨夜/面板/御剑/茶舍/森林/街道10图；保持1.2%阈值、无遮罩、固定本地时区，冻结天气时钟用于确定画面。

[面板输入](qa/weather-panel-input.json)验证1024×768边界、战斗冻结/天气继续、背景右拖实时相机/焦点留在面板、关闭后实际移动、天气偏好重载与任务存档不变。[雨输入](qa/weather-rain-input.json)真实D行走和Space升高、雨中心三维跟随；茶舍两个雨时刻160×100墙面像素完全一致；重复切换预热后几何233/纹理39严格稳定。[雨夜攻击](qa/weather-combat-input.json)实际命中并扣敌人气血，同时水盾有效。

主任务查看[真实行走](qa/weather-frames/rain-walk.jpg)、[御剑](qa/weather-frames/rain-flight.jpg)、[茶舍](qa/weather-frames/rain-shop.jpg)、[雨夜战斗](qa/weather-frames/night-combat.jpg)、[开盾施法](qa/shield-frames/attack-with-shield.jpg)与[1024×768夜间HUD](qa/laptop-combat.png)，并逐张查看全部15张当前硬件PNG。没有修改骨骼/动作；完整首章通关/存档与原动作录像属于[攻击历史验收](elemental-final-evidence-20261007.md)，本轮没有重跑整章或把旧录像当作新的天气验收。

[初次](qa/weather-initial-tests.json)3通过/1失败24.707秒、[中间](qa/weather-intermediate-tests.json)6通过/1失败25.684秒，均为即时读取前一帧诊断，改为poll等待同一精确条件。[第三次](qa/weather-random-nochange-tests.json)6通过/1失败38.538秒：随机雨接近0，滑块已显示0时Home没有产生input；改为End真实变1再Home归0，仍要求精确0和随机关闭。三次失败和画面均保存，未放宽断言。早期六张[渲染检查](weather-initial-20261007/evidence.json)在冷补光和暖晨昏调整之前，明确不是当前最终版本。

## 画面、硬件与构建

[当前manifest](evidence.json)复用相同运行源码的[模块15状态采集](weather-module-20261007/evidence.json)：全部1280×720 RTX4050、softwareRendered=false，请求/实际状态匹配、页面/控制台错误0。覆盖晨午夕夜、晴阴雨/雨夜、面板、雨中御剑/店内、月下透明盾、森林/街道夜景、现实本地夜景。

| 15状态各项最大值 | 桌面预算 |
| --- | --- |
| 266 calls | 300 |
| 563228 三角 | 750000 |
| 201 几何 | 300 |
| 39 纹理 | 60 |

海岸月夜熵3.63/边缘0.124/亮度对比62.8，人物轮廓与浪线可见；森林夜景熵2.95/对比29.4，为偏暗林下，通路与人物轮廓仍可辨。没有为了指标增加噪声或过度提亮；林下细节仍比白天弱，不做高帧率或AAA认证。

对照skill校准图并评当前完整天气采集范围：照明本轮2.0（初次夜景偏暗，冷补光改善；林下压缩限制更高分）、UI天气面板2.4（国风身份、真实调候、屏内滚动与焦点）、性能证据2.4（硬件预算、严格资源稳定、产物指纹/基线；未新做FPS采样）。艺术方向、主角、敌人、交互物、世界拓扑、其他材质和战斗VFX七项保持历史评价，本轮不重评、不发布整款平均。

[最终生产构建](qa/weather-release-build.txt)通过，JS1025.09kB/gzip278.59kB、CSS27.00kB/gzip7.02kB；保留900kB chunk提示，无新依赖或媒体资源。[源码/产物指纹](qa/weather-runtime-fingerprint.json)71个运行/资源/入口/配置与26个产物SHA256匹配a86cbdc，最终重建与实测产物完全相同；33个既有world/public文件未变，CoastalEnvironment与World只做天气/水面色调适配。

[普通生产入口实测](qa/weather-production-entry.json)不带test参数：hooks/diagnostics隐藏，P打开默认现实同步/Asia/Shanghai面板，Esc关闭、错误0。用户要求开发面板，本预览默认启用；发行可用VITE_WEATHER_PANEL=0关闭入口/P。相对base支持HTTP根目录/子目录，未部署、未push。

## Review与复现

[独立只读review](weather-review.md)发现两项P2：天气面板暂停分支不更新相机导致关面板突跳/焦点逃出，以及日/月主灯在非零强度交接导致阴影跳变。分别修复天气暂停分支实时镜头/HUD inert/焦点约束/程序恢复，主灯地平线淡至0再切换、海面日月高光连续混合。闭环由主任务真实输入与当前画面核验，review者没有另开GPU验收。

```sh
npm run build
npx playwright test tests/weather.spec.ts tests/weather-state.spec.ts tests/baselines.spec.ts --reporter=line --trace=off
npx playwright test tests/visual.spec.ts tests/shield.spec.ts tests/shield-interactions.spec.ts tests/gameplay.spec.ts --grep 'shield|desktop start|title settings|map and minimap|combat pressure' --reporter=line --trace=off
npm run inspect:canvas -- --headed --manifest artifacts/evidence.json --url 'http://127.0.0.1:4194/?test=1' --seed 42
python3 /home/ryan/.codex/skills/threejs-game-director/scripts/check_evidence.py . --report artifacts/final-evidence.md --manifest artifacts/evidence.json
```

分模块本地提交：1b27a76天气状态、a86cbdc运行整合/原创Moon/实机验收、a81ff5a基线、cf355a7既有操作回归/历史归档；最后以独立文档提交保存当前manifest/指纹与操作说明。旧护盾[报告](shield-final-evidence-20261007.md)、[manifest](shield-evidence-20261007.json)及会被当前回归覆盖的输入/图片已归档，明确历史运行12bc630。具体见[制作记录](game-progress.md)。

[证据检查](qa/weather-evidence-check.txt)57份引用/manifest核验通过，[历史归档检查](qa/weather-shield-archive-check.txt)通过；[一致性核对](qa/weather-final-consistency.txt)验证本地链接、JSON、50张基线和全部源码/产物指纹。
