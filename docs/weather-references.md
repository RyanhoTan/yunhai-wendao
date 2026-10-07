# 天象与月亮参考（2026-10-07）

本轮参考 [ProfRino/tideline](https://github.com/ProfRino/tideline) 的天空、日照、云和雨，以及用户指定 [Emotive Engine 元素演示的 Moon](https://joshtol.github.io/emotive-engine/examples/3d/elemental-gestures.html)。按本作现有纯 Three.js 天空和海洋重新创作，不引入参考引擎、模型或纹理。

Tideline 固定源码 7999581dcd61e158e8277d9b54592b45c790e2b3，package 使用 Three.js ^0.185。主要入口 src/tideline.js：天空145–483、太阳时刻995–1037、滑块1060–1103、云1151–1197、雨1370–1443、光照1880–2026。参考FBM云密度、日夜色调、太阳高光与实例雨滴；本作采用共享天空/海面反射函数、轻量分层云、角色三维跟随雨和地面/屋顶高度遮挡。没有实际运行 Tideline 演示，不把源码研究当作画面验收。现实本地时钟、独立偏好及随机天气为本作新增逻辑。

Moon 固定源码 ae2accddc8f3e65a024c38b55e71a54b7fb10a14。实际演示入口依次是 site/public/examples/3d/elemental-gestures.html、MaterialFactory.js、Moon.js 的 createMoonMultiplexerMaterial、moonWithBlendLayers.js。参考球面法线、光方向、fwidth 明暗边界、弱蓝色地照和小光晕；本作以程序月海与12处稀疏环形山原创月面，天空云层可覆盖月亮，海面加入冷色月光高光，无新增纹理/后处理。

只读研究者实际在 RTX4050 Chromium 打开用户链接并点击 Full、First Quarter、Waxing Crescent；[请求和运行记录](../artifacts/qa/weather-reference/moon-preview-report.json)及[源码研究](../artifacts/qa/weather-reference/moon-source-intake.md)保留。演示 colorMapReady=false，资产基路径返回404，截图为灰色回退球及可用相位；没有下载NASA贴图。参考图片仅用于参考验收，不作为本作截图。

- [参考 Full](../artifacts/qa/weather-reference/moon-full-reference.png)
- [参考 First Quarter](../artifacts/qa/weather-reference/moon-first-quarter-reference.png)
- [参考 Waxing Crescent](../artifacts/qa/weather-reference/moon-waxing-crescent-reference.png)

当前月亮是固定艺术满月；未实现现实日期月相。现实同步使用设备本地时区和时钟，太阳按原创06:00–18:00日弧表现，无经纬度、季节日长或在线真实气象服务。雨是视觉效果，不改变战斗数值；水体保留原有几何、浪形、岸线，仅调整环境色、天空反射与高光。
