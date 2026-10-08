# 云海问道 · 太阳直径5倍（2026-10-08）

本小模块将太阳投影半径从.032放大至.16，日盘直径为上一版5倍。天空/海面共用日盘、光晕、射线同步放大。构建、代码自查、实机与真实输入、52图独立比较完成；无未解决新问题。

[当前manifest](evidence.json)的[日落原图](sun-fivefold-20261008/desktop-weather-sunset.png)1280×720 RTX4050、非软件渲染、请求/实际状态一致，页面/控制台错误0；34calls/276264三角/36几何/28纹理，预算内。[尺寸测量](sun-fivefold-20261008/scale-check.json)同镜头同日落时刻、258行亮盘宽44→218px，约4.95倍（边沿像素与AA），源码投影尺度严格5倍。巨大日盘在地平线后遮挡，下方海面出现相应倒影。

[真实控件输入](sun-fivefold-20261008/input.json)：Enter开调候、云量End/Home、时刻End、P关闭，核心56×56区域亮像素晴3136/云0/深夜0，错误0。主任务查看[晴](sun-fivefold-20261008/input-clear.png)、[云](sun-fivefold-20261008/input-clouded.png)、[夜](sun-fivefold-20261008/input-night.png)原图；晴空15时日盘顶部超出镜头，17:18更适合观察大太阳。云量100%仍有既有云隙，扩大的盘边可从隙中露出，不宣称整盘消失。输入来自实际键盘控件，冻结模拟后零dt更新渲染，没有用hook替代滑块操作。

共享海天52图[all更新](sun-fivefold-20261008/baseline-update.json)1用例通过37.863秒，[独立比较](sun-fivefold-20261008/baseline-tests.json)1用例通过21.301秒，0失败/跳过/flaky；保持1.2%阈值、无遮罩。[运行/产物指纹](sun-fivefold-20261008/fingerprint.json)记录76运行/29产物文件，与45cd191运行相比仅SolarDisc.ts改变。构建tsc+Vite通过，JS1027.62kB/gzip279.53kB，既有900kB chunk提示保留。

本轮为一个尺寸小模块，无新增资产、状态或测试代码；代码自查及原图review由主任务完成，没有另起独立review或声称重新通关/FPS。原太阳外观[报告](warm-sun-final-evidence-20261008.md)与[manifest](warm-sun-evidence-20261008.json)归档，原模块45cd191、原基线e9ca5d4为历史记录。当前预览4194，P面板保留；完成后立即本地提交，无push。
