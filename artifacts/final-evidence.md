# 云海问道 · 听潮坊街区验收（2026-10-06）

现有开放地图已增加听潮坊：约92m中央石街、东西各六间可进入商铺、四座二层门面、青瓦木构檐廊、两端牌坊与悬灯。南侧山道接入宗门，角色可以实际步行进入市集和店铺，解锁后御剑飞越。舆图/小地图标出路线与店铺，位置提示显示店名，店内存档能够继续探索。

生产构建通过；完整27项回归全部通过，耗时345.799秒，失败/跳过/不稳定均0。最新16场景捕获全部为RTX4050硬件渲染，运行时与控制台错误0，声明画面均在参考预算内。独立review发现的屋顶单面和地板共面问题已修复并复核。

试玩：[本地预览](http://127.0.0.1:4194/)。按M查看听潮坊，在宗门东南沿金色山道到南街口；WASD移动，右键拖动镜头，滚轮调远近，F御剑/收剑，Space/C升降，Esc暂停保存。目标是电脑键鼠，完整操作见[README](../README.md)。

## 原创街区与参考

参考[long-wind](https://github.com/jbang2004/long-wind)的Three.js街巷代码组织，固定参考提交4e7b6c35abb191a13fdc5414bbac5ff9fe385d70，主要研究town.js/town-arch.js的木构白墙、青瓦檐廊、招牌图集和材质合并。本作重新定义地形、街道、十二铺布局和几何，原创绘制八张共享Canvas纹理与十三块匾额图集；十二类货架/摆设分别对应药庐、茶舍、书斋、织坊、陶馆、酒肆、米行、香铺、笔庄、糕屋、食坊、杂货。

实现位于src/world/TownLayout.ts、Town.ts、TownMaterials.ts、TownProps.ts；共享布局接入World、Game和Hud。人物与首章系统沿用已经验收的国风剑客与骨骼动作，来源见[角色说明](../docs/character-sources.md)。没有引入long-wind模型、贴图或示例地图；没有生成API作业或费用。

## 真实输入与动态证据

- [街区探索视频](qa/town-exploration.webm)30.92秒和[十二帧全景联系图](qa/town-motion-sheet.png)：起步、西侧酒肆、东侧杂货、后墙阻挡、退回长街、行走到北牌坊。仅初始位置由测试hook设置，随后使用实际WASD输入；店内走道保持通畅，地板稳定，镜头与墙体保持遮挡关系。
- [宗门步行到街口](qa/town-approach.png)：从新游戏沿(0,65)→(52,72)→(87,127)→(125,137)，无位置传送，角色气血100，地面误差<8cm。
- 十二个门洞逐一检查角色半径0.55m的通路，所有后墙逐一检查实体阻挡。室内向上射线确认木屋顶背面法线Y<-0.2；地板面层间隙>3mm且<35mm。
- [街区地图](qa/town-map.png)：显示可探索市集、两排商铺与连通路线；茶舍内保存，重载后位置差<0.5m，可继续走出店铺。屋顶上方按F保持御剑并提示移到长街落地，飞到街道后能正常收剑。
- [首章真实输入指标](qa/bot-metrics.json)：seed42，推进6618帧、14次击杀、三阵眼开启、quest5/realm2筑基，气血160，错误空；[通关画面](qa/real-input-completion.png)。存档重载、死亡重试和海岸步行/浅水/御剑返回均通过。
- [人物未暂停视频](qa/hero-motion.webm)10.8秒、[人物联系图](qa/character-motion-sheet.png)与[动作指标](qa/motion-metrics.json)重新捕获，覆盖移动、剑斩接触、法术、闪避和御剑起降；命中窗剑尖向前、实际敌人掉血，飞剑足底对齐和恢复断言通过。

截图基线保护十二个场景，新增长街/街口/店内并更新新地图影响的九个已有画面。像素差异阈值保持1.2%，无遮罩；更新后单独比较通过，完整回归再次比较通过。[完整测试JSON](qa/town-full-tests.json)。

## 硬件画面与性能

当前runId为market-street-20261006-r1，[manifest](evidence.json)包含16个明确场景和12项附件，[证据检查](qa/town-evidence-check-20261006.txt)全部通过。报告和原图保存在[长街](market-street-20261006-r1/desktop-town.png)、[街口](market-street-20261006-r1/desktop-town-entrance.png)、[店内](market-street-20261006-r1/desktop-town-shop.png)、[御剑上空](market-street-20261006-r1/desktop-town-flight.png)等同目录文件。所有捕获均1280×720、DPR1，GPU为NVIDIA GeForce RTX4050，软件渲染标志false。

| 场景 | calls | 三角形 | 几何 | 纹理 |
| --- | ---: | ---: | ---: | ---: |
| 长街 | 229 | 708844 | 130 | 38 |
| 南街口 | 233 | 728366 | 130 | 39 |
| 茶舍内 | 77 | 432108 | 81 | 36 |
| 街区御剑 | 193 | 697576 | 126 | 38 |
| 人物背面（声明画面最大三角形） | 248 | 737386 | 115 | 32 |
| 参考预算 | 300 | 750000 | 300 | 60 |

街口最初765618三角形超预算，保留[原始报告](town-draft-20261006-r3/desktop-town-entrance.json)。铺石移除地形内隐藏面、屋顶减少细分，商铺四间一组65m细节LOD/8%滞回、145m整街轮廓LOD；同街口降至728366，近处保持完整店内模型。

[最新活动样本](qa/town-input-metrics.json)持续2.002秒，318帧、158.82FPS、P95帧间隔6.2ms，峰值710368三角形/229calls；人物1.8秒活动样本152.00FPS。先行的2秒街道样本曾在细节切换时达到778874三角形（高于参考3.85%），当时153.99FPS/P95 7.5ms；保留近处商铺几何，并在[汇总](qa/town-summary-20261006.json)记录此取舍。短样本代表本机这些活动片段，不能推导整张地图或其他设备的恒定帧率。

物理仍为自定义60Hz高度场、球形与Box3代理，当前diagnostics合计1003个代理。高画质DPR上限1.5、轻量1，2048阴影覆盖60m；街灯采用共享发光材质，没有新增逐灯PointLight。JavaScript产物809.88kB，gzip223.74kB，原人物资源约9.3MiB。生产默认隐藏QA hooks，显式?test=1才启用，静态部署相对base沿用既有配置。

## review与视觉复核

[街区review](qa/town-review.md)保存独立review的两项P2及修复。reviewer在返回具体意见后遇到额度限制，主任务完成最新源码、硬件原图、射线回归和动态视频复核，没有最终独立无缺陷认证声明。额外修复远处LOD山墙缝隙；存档脚本等地图关闭后才发送第二次Esc，避免同帧键事件合并。

本轮读取graphics量表三个校准画面，按新增街区范围复核；初始空地街区画面没有保存，不能编造前评分。保留十个量表项的范围说明：

| 项目 | 本轮复核 |
| --- | --- |
| 美术方向 | 沿用国风晴日山谷，木构白墙与青瓦街巷加入同一材质语言 |
| 主角 | 沿用前阶段角色；本次真实动作检查通过 |
| 敌人/障碍 | 沿用首章敌人；新增墙体、柜台、屋顶代理验证通过 |
| 奖励/交互物 | 沿用首章奖励；店名用于导航，货架为街景陈设 |
| 世界 | 新街区2.3：近中远街巷层次、十二铺摆设、可步行连接与室内 |
| 材质 | 新街区2.4：八张共享纹理、木/灰墙/青瓦/石/纸灯/陶器角色，匾额方向正确 |
| 照明 | 沿用前阶段2.4：暖阳冷天光，室内109.5、长街164.0亮度对比 |
| VFX/运动 | 沿用现有剑招与御剑；动态复核行走起停、进退和遮挡 |
| UI/HUD | 地图导航2.3：市集/店铺/路线与当前位置，桌面及1024×768布局通过 |
| 性能证据 | 2.6：16硬件画面、活动样本、27项回归、明确记录切换峰值取舍 |

长街entropy5.63/edgeDensity0.353/主色占比0.123，室内4.28/0.189/0.189。地图低对比来自墨绿界面和压暗背景，不作为世界画质评分。街区仍有重复立面节奏与安静街景；本轮完成可进入的商铺环境，上层门面为视觉建筑，没有楼梯、商人NPC或买卖系统。首章、联机与移动端范围沿用[设计简报](design-brief.md)，不将本轮局部扩展重新汇总为整款游戏的新等级。

## 复现与代码状态

```sh
npm run build
PLAYWRIGHT_JSON_OUTPUT_FILE=artifacts/qa/town-full-tests.json npx playwright test --reporter=line,json
npm run inspect:canvas -- --headed --manifest artifacts/evidence.json --url 'http://127.0.0.1:4194/?test=1' --seed 42
node scripts/create-motion-contact-sheet.mjs artifacts/qa/town-exploration.webm artifacts/qa/town-motion-sheet.png --full-frame
python3 /home/ryan/.codex/skills/threejs-game-director/scripts/check_evidence.py . --manifest artifacts/evidence.json
```

运行时代码提交4a4c0aa，测试/基线提交6403c92；全部src/public运行文件的SHA256、产物SHA256和测试统计保存在[汇总JSON](qa/town-summary-20261006.json)。运行文件指纹b407050047f71e5df33999ad900149203c5aeeef3ad627318ac7983a28caa6ca，文档提交后重新核对。分模块中文Conventional Commits、逐次HEAD UTF-8检查，本地提交不push，提交记录见[制作记录](game-progress.md)。
