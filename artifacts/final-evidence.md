# 云海问道 · 妖兽交互与新增模型（2026-10-08）

已实现走近妖兽被身体挡住、侧向绕行、剑击接触时按距离/朝向扣血、每挥击对同目标只伤害一次与攻击间隔；死亡解除阻挡。新增四只苍狼妖兽与两只赤脊兽，带独立骨骼动作，保留原首章、敌人ID/坐标/属性与旧存档。

试玩：`http://127.0.0.1:4194/`，WASD移动，左键/R攻击，Shift闪避；按M到西部林道、东部/北部阵眼。当前P天气面板保留。

模型/动画/许可及体型见[来源说明](../docs/creature-sources.md)。现有原创三尾妖灵与石灵保留；新增为CC0折面模型，未直接获取Sketchfab参考原件，没有新增推动/撞飞、逐部位物理或坡面足部IK。

- 身体交互模块eabaa6e：4项新增检查与20项相关回归通过，包括52图原基线、真实输入通关、保存/重试、海岸与市集；[完整记录](creature-interaction-20261008/README.md)。
- 新模型运行模块1862a56：15项模型/身体/招式/盾检查，加新版4项通关/保存/重试/运动/存档回归通过；[当前记录](creature-models-20261008/README.md)。独立review发现咬击时序错开，修复后真实伤害帧对应源咬合接触点，随后恢复。
- 最终图像单元：新增狼/兽两图，原52图不改；54图独立比较通过，阈值仍1.2%、无遮罩。首次缺少新增图的生成失败如实保留；[最终比较](creature-models-20261008/baselines-compare.json)。
- 当前[manifest](evidence.json)声明四个1280×720 RTX4050场景，零错误、预算通过；最大242calls/476298三角/172几何/35纹理。只声明这些捕获的负载，不以静图证明FPS。
- [狼录像](creature-models-20261008/wolf-motion.webm)、[兽录像](creature-models-20261008/beast-motion.webm)、[兽侧面](creature-models-20261008/beast-profile.png)与联系图已检查；含死亡重载的资源加载画面。

逐模块中文本地commit、HEAD UTF-8检查与进度见[制作记录](game-progress.md)。无购买/生成API任务，无push或部署。太阳5倍直径原[报告](sun-fivefold-final-evidence-20261008.md)/[manifest](sun-fivefold-evidence-20261008.json)单独保留，其他历史验收沿用各自归档。
