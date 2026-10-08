# 天象、月亮与太阳参考（2026-10-08）

本轮参考 [ProfRino/tideline](https://github.com/ProfRino/tideline) 的天空、日照、云和雨，以及用户指定 [Emotive Engine 元素演示的 Moon](https://joshtol.github.io/emotive-engine/examples/3d/elemental-gestures.html)。天气按本作纯Three.js天空/海洋创作；月亮按用户最新要求保留原项目外观，采用原4K月面与Full Moon公式，不重绘月面，不引入整个引擎。

Tideline 固定源码 7999581dcd61e158e8277d9b54592b45c790e2b3，package 使用 Three.js ^0.185。主要入口 src/tideline.js：天空145–483、太阳时刻995–1037、滑块1060–1103、云1151–1197、雨1370–1443、光照1880–2026。参考FBM云密度、日夜色调、太阳高光与实例雨滴；本作采用共享天空/海面反射函数、轻量分层云、角色三维跟随雨和地面/屋顶高度遮挡。没有实际运行 Tideline 演示，不把源码研究当作画面验收。现实本地时钟、独立偏好及随机天气为本作新增逻辑。

Moon 固定源码 ae2accddc8f3e65a024c38b55e71a54b7fb10a14。实际演示入口依次是 site/public/examples/3d/elemental-gestures.html、MaterialFactory.js、Moon.js 的 createMoonMultiplexerMaterial、moonWithBlendLayers.js。参考球面法线、光方向、fwidth 明暗边界、弱蓝色地照和小光晕；初版以程序月海和12处环形山创作。用户随后要求不修改Moon外观，现改用仓库assets/textures/Moon/moon-color-4k.jpg原文件（4096×2048、2007445字节、SHA256 6563dd39fd90aade85495977c35499a71fc28809f27c3223f63aebf7914282af），Full Moon基本表面公式及55.5/-85/-60.5度面向校准。移除自创环形山、月海与蓝色光晕；月盘遮住背景星光，云层及海面反射仍联动。保留此前3倍直径，无新增后处理。

只读研究者实际在 RTX4050 Chromium 打开用户链接并点击 Full、First Quarter、Waxing Crescent；[请求和运行记录](../artifacts/qa/weather-reference/moon-preview-report.json)及[源码研究](../artifacts/qa/weather-reference/moon-source-intake.md)保留。演示 colorMapReady=false，资产基路径返回404，截图为灰色回退球及可用相位；当时未下载NASA贴图；本轮最新接入已从固定源码取原4K文件并本地提供，来源说明与MIT通知放在public/assets/moon/。上述参考图片仅用于初次研究验收，不作为本作截图。

- [参考 Full](../artifacts/qa/weather-reference/moon-full-reference.png)
- [参考 First Quarter](../artifacts/qa/weather-reference/moon-first-quarter-reference.png)
- [参考 Waxing Crescent](../artifacts/qa/weather-reference/moon-waxing-crescent-reference.png)

当前月亮是固定艺术满月；未实现现实日期月相。现实同步使用设备本地时区和时钟，太阳按原创06:00–18:00日弧表现，无经纬度、季节日长或在线真实气象服务。雨是视觉效果，不改变战斗数值；水体保留原有几何、浪形、岸线，仅调整环境色、天空反射与高光。

## 暖金色太阳（2026-10-08）

用户指定参考[hizzd/threejs-earth-sun](https://github.com/hizzd/threejs-earth-sun)，允许外观不同。只读核对固定源码2fe6359cdcee8d32bc1545d6ee1473625c8b21c2的[src/entity/sun.ts](https://github.com/hizzd/threejs-earth-sun/blob/2fe6359cdcee8d32bc1545d6ee1473625c8b21c2/src/entity/sun.ts)：暖色球体，BloomEffect、60采样GodRaysEffect和多张Lensflare贴图；不是噪声火焰表面。未运行参考演示，不将源码研究称为参考画面验收。

本作原创SolarDisc天空shader借鉴暖色发光与放射光感，采用乳金色核心、晨昏橙金边缘、两层指数光晕及克制角向射线；按用户随后要求将直径放大到本版本的5倍，投影半径从.032改为.032×5=.16（最初硬白盘约.02）。射线是天空空间的美术效果，不宣称体积散射或屏幕空间遮挡光束；不引入其图片、代码、后处理库或额外绘制通道。太阳只在朝阳半球和白昼出现，云雨与地平线之后遮挡，天空和海面反射共用同一公式。原月亮、昼夜时钟、海浪和岸线不变。
