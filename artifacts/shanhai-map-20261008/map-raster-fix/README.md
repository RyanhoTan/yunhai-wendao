# 地图首帧补充修复

最终检查复现大地图首帧全透明。尺寸有效、context未丢失；插入逐指令getImageData会得到正确绘制，原加速2D路径未稳定保留帧。Hud大小地图和MapTerrain底图改用`willReadFrequently:true`的CPU绘制，保持相同地形与符号。

构建、首帧/重开检查（7秒）及实际键鼠开图/暂停/设置/1024×768布局检查（10秒）通过，当前地图截图在regression目录，相关源码diff已review。该修改没有解决另一个静态WebGL/SVG采集错位，desktop-waterfall.png仍是拒绝的硬件截图；不得把它作为最终瀑布图。
