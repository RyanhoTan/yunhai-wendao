# 云海问道 · 五行与范围招式验收（2026-10-07）

五行环绕发射、归墟吞噬、灵压震退与剑斩金色剑气已接入实际战斗。生产构建通过，同一运行版本的14个相关用例均已验证，32张基线比较通过，36个桌面硬件状态零错误且全部在预算内。原首章真实通关、存档重载、死亡重试及1024×768界面通过。review为主任务自查与实机审图。

试玩：[本地预览](http://127.0.0.1:4194/)。刷新已有页，1–5选金/木/水/火/土，T环绕后发射，G施放前方归墟，V落地震退，左键/R剑斩带金色剑气；HUD显示冷却和真气。

## 原创实现与来源

读取用户指定的three.quarks拖尾及Emotive Engine四种barrage代码，参考环绕阵列、错开发射和尾迹；完整链接见[参考记录](../docs/elemental-references.md)，原文件哈希见[源码记录](elemental-reference.json)。没有完整加载参考演示并进行视觉认证。分享页返回403，用户补充源码后继续制作。

three.quarks固定0.17.1负责拖尾/命中；Emotive Engine仅作代码研究，没有引入其运行库、模型或贴图。飞剑、扭曲藤叶束、流珠、炎羽、岩矢、64×64 Canvas径向纹理、贴坡旋涡和波环shader均由本项目制作，无新增生成API作业或支出。

| 招式 | 真气 / 冷却 | 实际行为 |
| --- | --- | --- |
| T五行诀 | 24 / 3.2秒，共享 | 五枚环绕后射向前方32m内目标；无目标也向前发射；扫掠命中、实体/地面阻挡、2.5秒寿命 |
| G归墟 | 32 / 9秒 | 前方24m目标或8m外空地，6m范围持续3秒；拉扯/间隔伤害/收束，击败各返还4真气并照常成长 |
| V灵压 | 28 / 6秒 | 落地7m波环，每目标一次伤害；震退/打断普通妖灵，0.65秒硬直，14cm以内分步检查实体 |
| 左键/R剑斩 | 沿用原规则 | 原命中窗出现金色剑气，原伤害/射程/冷却保持 |

石灵封印保护沿用；归墟对石灵拉扯18%/伤害60%，灵压缩小位移且不硬直。T/G/V附加短暂抬手，剑斩与闪避优先原动作。资源固定池为10个元素槽、8个命中槽；归墟/命中共用billboard批次，拖尾另一个批次。波环1网格、剑气3槽共享资源，暂停冻结、重试清空、页面离开保存后释放，dispose可重复调用。

## 测试与真实输入

[12项原始运行](qa/elemental-release-tests.json)为11通过/1失败，367.818秒。失败项重载后仍处于人物准备界面，10秒内菜单尚未创建；仅延长菜单准备等待至30秒，[目标复测](qa/elemental-release-focus-tests.json)通过27.0秒，存档一致性、Tab焦点和对话回调断言保持。运行代码未改，不把两次结果写成单轮全通过。

[逐项汇总](qa/elemental-tests-summary.json)合并上述12项、[原动作测试](qa/pulse-motion-tests.json)、[基线比较](qa/elemental-baseline-tests.json)，共14个唯一用例，未解决失败0。七项招式测试验证真实1–5/T/G/V/R、实际扣血、共享冷却、菜单冻结、重试清理、资源预热后严格稳定、归墟成长和真实后墙阻挡；另有原首章通关/重载、死亡重试与三项界面检查。

[五行输入](qa/elemental-input.json)、[归墟输入](qa/vortex-input.json)错误0；归墟真实吞噬4只妖灵、获得128修为。[灵压输入](qa/pulse-input.json)四只妖灵各一次伤害并有效震退，[后墙结果](qa/pulse-barrier.json)在听潮坊茶舍停于x>111.9一侧。[首章指标](qa/bot-metrics.json)：14次击败、任务5、境界2、气血160、错误0，[筑基画面](qa/real-input-completion.png)已查看，重载保持完成。

原动作测试用未暂停键鼠完成跑步、完整轻缓步态、剑斩接触、御雷、闪避与御剑起落。[动作指标](qa/motion-metrics.json)记录八个截图和接触窗口，腿部跨度0.874rad、跑步移动10.97m、错误0，[录像](qa/hero-motion.webm)保留。主任务查看八张未暂停截图、[实际剑气](qa/elemental-frames/sword-wave.jpg)、[旋涡拉扯](qa/elemental-frames/vortex-pull.jpg)及各元素原帧，不把静态场景截图当作动画录像。[1024×768 HUD](qa/laptop-combat.png)九槽/五行选择在视口内，舆图无溢出。

32张基线保留原19个世界视角，新增10个元素环绕/发射与归墟、灵压、剑气。首次商街PNG采集超时，[原始结果](qa/elemental-baseline-initial-tests.json)保留；只延长截图等待至30秒，原1.2%差异阈值、无遮罩。更新58.970秒通过，另一轮比较39.287秒通过；人工查看新增形态、拖尾、贴坡波环与代表性世界原图。

## 硬件与构建

[当前manifest](evidence.json)runId为elemental-release-20261007，36个1280×720、DPR1状态全为RTX4050硬件，软件标志false，hook请求/实际状态一致，页面与控制台错误0。含原23个世界状态和13个新招式状态；海岸、新区、街口、火发射、归墟、灵压最终原图已复核。

| 场景 | calls | 三角 | 几何 | 纹理 |
| --- | ---: | ---: | ---: | ---: |
| 火系环绕/发射 | 234 | 486510 | 176 | 30 |
| 归墟 | 244 | 483934 | 164 | 30 |
| 灵压 | 203 | 444934 | 134 | 30 |
| 剑气 | 197 | 442838 | 133 | 30 |
| 海岸 | 34 | 276264 | 38 | 28 |
| 苍翠林 | 109 | 490358 | 114 | 28 |
| 商街入口 | 266 | 545662 | 180 | 39 |
| 36状态各项最大值 | 277 | 568846 | 206 | 39 |
| 桌面预算 | 300 | 750000 | 300 | 60 |

[活动样本](qa/elemental-performance.json)：同场景预热3轮后真实Digit4/T/G/V，2.203秒333帧，151.16FPS、P95 8.3ms，峰值254calls/492788三角/236几何/35纹理，错误0。原跑步1.8秒样本121.42FPS。系统14GB内存/4GB交换区近满，出现冷启动菜单及PNG采集超时；使用串行GPU窗口并保留失败记录。短样本仅代表共享工作站当时片段，不能承诺全地图或其他设备固定帧率。

[生产构建日志](qa/elemental-build.txt)通过。JS994.50kB/gzip269.47kB，较森林版817.93/226.99增加176.57/42.48kB，存在900kB chunk提示。静态相对base和生产QA gating沿用，显式?test=1启用hooks。没有部署或push。

[运行指纹](qa/elemental-runtime-fingerprint.json)保存62个src/public及package/lock、26个生产文件SHA256，重建产物与已测版本一致。runtimeCommit829a891，指纹30539d4e99aae8274fdb561517b0787ea7768b43bedfe3d27ad8b9dd66243aac。35个既有world/public文件与森林验收一致；森林[原报告](forest-final-evidence-20261006.md)、[原manifest](forest-evidence-20261006.json)、通关/人物录像已归档，作为历史范围证据。

## 范围review

本轮聚焦VFX、动作和HUD，未重新认证整款视觉等级。自评VFX2.4、UI2.4；前轮同机位攻击未捕获，不编造前值或整款平均分。五行用独立轮廓/颜色，发射、吞噬与震退用不同方向提示，轻缓动效仍保留动作。火发射entropy5.17/edgeDensity0.283/主色占比0.130，归墟4.47/0.177/0.212，灵压4.67/0.227/0.195；数值不单独证明美术完成度。

| 项目 | 本轮复核 |
| --- | --- |
| 美术方向 | 延续晴日国风，五行、青玉/紫色范围招式协调 |
| 主角 | 沿用形象，抬手优先级与真实动作回归 |
| 敌人/障碍 | 扣血、打断、位移、后墙阻挡和石灵保护 |
| 奖励/交互 | 原成长、归墟返真气、原任务通关/存档 |
| 世界 | 原地形/海岸/森林/商街文件指纹保持 |
| 材质 | 原创几何、径向粒子、贴坡shader，既有材质沿用 |
| 照明 | 原照明，轮廓/光效可读，无新增后处理 |
| VFX/运动 | 环绕/发射/拖尾/命中、向内归墟、向外灵压、金色剑气 |
| UI/HUD | 选择、真气/冷却、九槽与1024×768边界 |
| 性能证据 | 36硬件状态、活动样本、固定资源池与14用例 |

自查修复环绕尺寸/姿态、批次分辨率、旋涡贴坡、页面离开释放和震退后立即走回。最初阻挡测试选址无实体，改真实后墙后通过；[阶段报告](pulse-module-report.md)保留初次失败。没有宣称独立评审认证。

## 复现与提交

```sh
npm run build
npx playwright test tests/elemental.spec.ts tests/visual.spec.ts tests/gameplay.spec.ts --reporter=line --trace=off
npx playwright test tests/motion.spec.ts tests/baselines.spec.ts --reporter=line --trace=off
node scripts/profile-elemental.mjs
npm run inspect:canvas -- --headed --manifest artifacts/evidence.json --url 'http://127.0.0.1:4194/?test=1' --seed 42
python3 /home/ryan/.codex/skills/threejs-game-director/scripts/check_evidence.py . --report artifacts/final-evidence.md --manifest artifacts/evidence.json
```

本地逐模块提交：ce065c8五行、a82f306归墟、829a891灵压/剑气/动作、89a1a5e基线、d0c8378合并测试、6b3410b统一证据。交付说明单独提交，运行版本继续保持829a891，记录见[制作记录](game-progress.md)。[证据检查](qa/elemental-evidence-check.txt)通过。
