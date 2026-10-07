# 云海问道 · 五行透明护盾验收（2026-10-07）

透明球形护盾已进入实际游戏，可看到内部人物，随地面行走与御剑移动。当前运行版本12bc630的15个相关唯一用例均已验证，40张基线独立比较通过；14个1280×720 RTX4050硬件状态零页面/控制台错误且全部在预算内。独立代码review发现的球内剔除问题已修复并复核，无待处理功能失败。

试玩：[本地预览](http://127.0.0.1:4194/)。刷新已有页，1–5选金/木/水/火/土，按Z或护盾按钮开启：18真气、持续6秒、施放起冷却10秒。金淡金、木青绿、水水蓝、火红、土棕黄；中央透明、边缘发光，受击时从来源方向扩散波环。三个境界分别吸收42/60/78伤害，五行当前共享防御数值。切换选择不改变已施放护盾，也不能重置冷却。

## 原创实现与参考

参考[Flow Shield源码与实看记录](../docs/shield-reference.md)的Fresnel边缘、出现/消散与球面命中结构；参考SHA bf34d9ea48fd4333f5b42ef3e3772c89de2adccb。参考网页画面单独保存，未当成本作实机截图。纯Three.js重新创作五行纹样、透明材质与防御系统，无React/Next.js、新模型、贴图、依赖或生成API作业。

球半径1.48m、中心在人物根位置上方1.5m，一网格/一材质、四槽命中环、零新纹理/后处理。低透明中心保持身体和动作可读，金细纹、木曲纹、水波、火升腾噪声、土破碎纹；轻缓模式降低流动并关闭轻微呼吸。透明球不写深度，双面单次绘制，内侧为外侧20%透明度，近墙镜头进入球体仍能看清人物与店内空间。

伤害沿用原闪避无敌窗口，先扣盾、余量扣气血；到期或耗尽渐隐。暂停冻结，低真气拒绝，菜单按键不排队，重试清空，页面释放移除球与释放共享资源。临时盾与冷却不写存档，真气沿用现有保存规则。T/G/V/R仍可同时使用，保留既有动作优先级。

## 实际输入与回归

[逐项汇总](qa/shield-tests-summary.json)为15个唯一用例，未解决失败0，运行源码相同：

- [六项组合运行](qa/shield-module-tests.json)：6通过/0失败，71.640秒。四项护盾、原真实死亡重试、桌面镜头/暂停/面板/设置及1024×768布局。
- [八项攻击交互](qa/shield-attack-regression-tests.json)：8通过/0失败，58.773秒。七项原T/G/V/R回归，另有真实Z+T同时施放、切元素后旧盾仍为火、发射实际扣敌人气血。
- [40张基线比较](qa/shield-baseline-tests.json)：1用例通过18.926秒。保留32个世界/攻击视角，新增五行盾、受击、御剑、球内8图；[全量更新](qa/shield-baseline-update-tests.json)32.748秒，原1.2%差异阈值、无遮罩。

[五行真实键盘及移动](qa/shield-runtime-12bc630/shield-input.json)覆盖五种颜色、真气与共享冷却、施放元素锁定、WASD/Space跟随，错误0。[石灵真实两击](qa/shield-runtime-12bc630/shield-damage.json)初始100气血，首击28由盾全吸收/余14盾，次击吸收14/溢出14，气血86。[生命周期](qa/shield-runtime-12bc630/shield-lifecycle.json)含到期隐藏与预热后几何/纹理严格稳定。[并用记录](qa/shield-runtime-12bc630/shield-attack-interaction.json)验证护盾与攻击共用真气而保持各自冷却。

主任务查看未暂停的[行走](qa/shield-runtime-12bc630/shield-frames/walk.jpg)、[御剑](qa/shield-runtime-12bc630/shield-frames/flight.jpg)、[石灵首击](qa/shield-runtime-12bc630/shield-frames/first-hit.jpg)、[破盾](qa/shield-runtime-12bc630/shield-frames/broken.jpg)、[开盾攻击](qa/shield-runtime-12bc630/shield-frames/attack-with-shield.jpg)，以及五行、命中、内侧和代表性世界PNG与[1024×768 HUD](qa/shield-runtime-12bc630/laptop-combat.png)。没有改人物骨骼/原动画，本轮不重计上轮动作录像为新的完整动画验收。

首次三项运行2通过/1满载工作站流程超时，241.395秒；[失败记录](qa/shield-initial-tests.json)保留。将五次逐按键截图移到独立稳定审图，单项上限改180秒，全部玩法断言保持；[中间两项复测](qa/shield-focus-tests.json)14.723秒通过，随后当前六项组合全通过。完整首章通关/存档、全世界和原人物录像属于[上轮历史验收](elemental-final-evidence-20261007.md)，没有宣称本轮重新跑完整首章。

## 硬件、透明度与构建

[当前manifest](shield-evidence-20261007.json)复用同一源码的shield-module-20261007实际采集：10个盾/无盾状态和活动、海岸、苍翠林、街口4状态，均RTX4050、softwareRendered=false、请求/实际状态一致、非空、页面/控制台错误0。模块原图与报告完整保留在[模块manifest](shield-module-20261007/evidence.json)。

| 状态 | calls | 三角 | 几何 | 纹理 |
| --- | ---: | ---: | ---: | ---: |
| 无盾对照 | 232 | 494244 | 177 | 30 |
| 五行盾/命中 | 233 | 497220 | 178 | 30 |
| 御剑盾 | 264 | 510120 | 201 | 30 |
| 球内盾 | 197 | 463469 | 187 | 38 |
| 14状态各项最大值 | 266 | 545662 | 201 | 39 |
| 桌面预算 | 300 | 750000 | 300 | 60 |

同机位开启增加1call/2976三角/1几何；没有额外帧率承诺。[配对像素](qa/shield-pixel-comparison.json)人物中央区域平均RGB差3.18–5.38（0–255），球内背景0.438、39341/46000像素变化，支持透明可读与内侧实际绘制判断。区域含背景与边缘，不作为alpha估值。固定shield-hit是hook指定命中时刻的审图，真实吸收由石灵两击证明。

[生产重建](qa/shield-release-build.txt)通过，JS1002.48kB/gzip271.77kB，较攻击版增加7.98/2.30kB，保留900kB chunk提示。默认生产隐藏hooks，显式?test=1开启QA；相对base可用于HTTP静态根目录/子目录。本轮未部署或push。

[运行指纹](qa/shield-runtime-fingerprint.json)66个src/public/package及入口/Vite/TS配置、26个生产文件SHA256，与运行提交12bc630一致；最终重建与所有已测画面的生产产物完全相同。35个既有world/public文件保持上轮内容，海洋、山地、森林、商街与人物资产未改。指纹fecbca8cd8892ee0288d8c2739b5fb114e7b8766bf02a5496c61c1b6719d78e6。

## Review与复现

[独立只读review](shield-review.md)发现FrontSide导致近墙球内镜头剔除，修复DoubleSide/abs(dot)/内侧透明度20%/forceSinglePass，独立复核确认P2闭环、无新明确问题。主任务实际茶舍后墙cameraInside=true并检查配对图；独立review未另开GPU窗口，不宣称独立实机认证。

本轮范围自评：VFX新增盾部分由not captured到2.2，事件吸收/命中环/透明跟随有实机证据；UI本次2.4，原界面评分作历史参照，增加盾容量/剩余时间/冷却且小屏可用。未改的美术方向、主角、敌人、交互、世界、其他材质及照明不重新评分；不发布整款平均或新的AAA认证。永久1–5/Z入口与40张基线构成本次视觉回归保护。

```sh
npm run build
npx playwright test tests/shield.spec.ts tests/visual.spec.ts tests/gameplay.spec.ts --grep 'shield|desktop start|combat pressure' --reporter=line --trace=off
npx playwright test tests/elemental.spec.ts tests/shield-interactions.spec.ts tests/baselines.spec.ts --reporter=line --trace=off
npm run inspect:canvas -- --headed --manifest artifacts/evidence.json --url 'http://127.0.0.1:4194/?test=1' --seed 42
python3 /home/ryan/.codex/skills/threejs-game-director/scripts/check_evidence.py . --report artifacts/final-evidence.md --manifest artifacts/evidence.json
```

已按小模块本地提交：12bc630护盾运行与实测、fc9a4f2基线、9cf3a6e攻击交互/历史归档；最终证据和操作说明作为独立提交保存，见[制作记录](game-progress.md)。[证据检查](qa/shield-evidence-check.txt)通过54份引用/manifest核验，JSON/本地链接/66个运行与26个生产指纹一致。
