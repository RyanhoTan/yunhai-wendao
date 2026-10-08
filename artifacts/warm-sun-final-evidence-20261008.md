# 云海问道 · 暖金色太阳验收（2026-10-08）

太阳运行模块已通过构建、实机画面、真实天气输入与独立review。新太阳由乳金核心、晨昏橙金边缘、双层光晕和柔和射线构成；天空与海面共用外观。参考[hizzd固定源码](https://github.com/hizzd/threejs-earth-sun/blob/2fe6359cdcee8d32bc1545d6ee1473625c8b21c2/src/entity/sun.ts)暖色光球、Bloom/GodRays/Lensflare思路，本作重新创作解析shader，无新增图片、运行库或绘制pass。[参考说明](../docs/weather-references.md)记录取舍。

[本轮manifest](warm-sun-evidence-20261008.json)五个1280×720 RTX4050状态全部通过，softwareRendered=false，请求与实际状态一致，非空、页面/控制台错误0，预算内。最大264calls/563228三角/144几何/35纹理；像素通过不等于FPS或美术评分。主任务和[独立review](warm-sun-review.md)已查看五张原PNG：

- [晴空日盘](warm-sun-20261008/desktop-weather-sun-clear.png)：15:00，乳金核心与克制放射光清晰。
- [日落](warm-sun-20261008/desktop-weather-sunset.png)：17:18，暖橙边缘与海面倒影联动。
- [黎明](warm-sun-20261008/desktop-weather-dawn.png)：06:30，日盘被北侧山体挡住；不作为日盘可见证据。
- [云遮挡](warm-sun-20261008/desktop-weather-sun-clouded.png)：同15:00，云量100%遮住太阳。
- [夜晚Moon](warm-sun-20261008/desktop-weather-night.png)：太阳消失，原Moon外观与3倍直径保留。

[真实键盘记录](qa/warm-sun-input.json)及同目录原图：Enter打开调候、云量End/Home、时刻End、P关闭。日盘56×56区域亮像素1813→0→1813，23:59为0；几何/纹理数量稳定，错误0。输入来自真实控件，冻结模拟后用零dt发布/绘制当前天气，未通过hook替代滑块输入。

构建tsc+Vite通过，JS1027.61kB/gzip279.53kB，保留既有900kB chunk提示。射线是静态天空美术效果，不是体积散射或屏幕空间遮挡光束；旧海面独立高光仍按总体云量衰减。现实钟、日弧、Moon原图、海浪/岸线、角色与战斗未改；没有重跑整章、移动端或重新声称FPS。原月亮[报告](emotive-moon-final-evidence-20261007.md)与[manifest](emotive-moon-evidence-20261007.json)已归档。

太阳运行单元已提交45cd191，中文UTF-8核验通过。第二单元新增晴空/云遮太阳两张基线，刷新共用天空/海面既有50状态，总52图；[all更新](qa/warm-sun-baseline-update.json)1用例通过38.240秒，[独立比较](qa/warm-sun-baseline-tests.json)1用例通过21.921秒，0失败/跳过/flaky，保持1.2%阈值和无遮罩。人工查看当前晴空、云遮和日落基线。图像保护扩展到日盘与云遮挡，未新增镜像实现的功能测试或重复旧通关。

[运行/产物指纹](qa/warm-sun-runtime-fingerprint.json)：76个运行文件与45cd191逐文件一致，29个生产文件SHA256记录。相对原Moon运行d8b95f4仅改变Atmosphere.ts与Game.ts的QA状态，新增SolarDisc.ts，其余73个运行文件（含原Moon资源）不变。五张硬件图、真实输入和基线均来自同一运行版本。

本轮实现、相关QA、独立review与基线全部完成，无未解决新finding。预览4194，默认生产隐藏QA helpers；P开发面板按用户要求保留，无push或部署。第二单元完成后立即本地提交，记录见[制作记录](game-progress.md)。
