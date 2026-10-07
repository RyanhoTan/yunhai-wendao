# Moon原外观接入 · 独立只读review

weather_reference核对固定源码ae2accddc8f3e65a024c38b55e71a54b7fb10a14的Moon.js、moonWithBlendLayers.js与ThreeRenderer.js，未修改文件或启动GPU。

- P2：旧切线right=cross(worldUp,moon)导致贴图左右镜像。已改right=cross(moon,worldUp)、up=cross(right,moon)，对应源球体的屏幕右方向。
- P2：原+=合成把夜空/自创蓝色halo叠进月盘，并在月面上画星。已移除自创halo，先画背景星光，再按月盘遮罩mix来源表面；月亮保持不透明，云/雨的世界遮挡随后处理。
- 源4K图片Git blob与当前文件均2f072e87f2145604405cc1cc6c33223f05549a33；Full基本表面公式、SphereGeometry UV逆映射、Qx55.5×Qy-85×Qz+60.5逆矩阵（数值角差约3e-8）没有发现错误。加载等待、相对base及正常退出释放未发现具体缺陷。

闭环由主任务代码和当前五个实机画面核验；明确为只读代码review，不宣称review者另外进行硬件认证。保留原月海/环形山纹理、源表面默认参数及校准，不做染色或自制坑洞；游戏统一ACES/输出色彩管线和天气合成继续使用。
