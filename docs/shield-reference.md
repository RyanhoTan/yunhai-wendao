# 五行透明球形护盾 · 参考选型（2026-10-07）

用户要求角色周围形成透明球形护盾，可以看到内部人物，按元素区别颜色。用户进一步要求先找参考，选型阶段优先演示与代码研究；开启方式已选择1–5选五行、Z施放，持续一段时间，消耗真气并吸收伤害。本阶段仅保存参考，不将护盾接入现有游戏或描述为已实现。

首选[Flow Shield Effect](https://github.com/cortiz2894/flow-shield-effect)，作者Christian Ortiz。[实时演示](https://flow-shield-effect.vercel.app/)具有球形透明壳、边缘高光、流动能量、受击波纹和出现/消散。基于Three.js、React Three Fiber及自定义GLSL；效果核心为一个球网格、ShaderMaterial及uniform，可在本作纯Three.js中重新实现，无需迁移React/Next.js。

只读参考固定SHA bf34d9ea48fd4333f5b42ef3e3772c89de2adccb，位于游戏目录外outputs/reference-flow-shield。仅检出ForceShield源码、README及package元数据，没有引入参考模型、HDR或纹理。

- [shaderMaterial.ts](https://github.com/cortiz2894/flow-shield-effect/blob/bf34d9ea48fd4333f5b42ef3e3772c89de2adccb/src/components/ForceShield/shaderMaterial.ts)：透明/不写深度、边缘Fresnel、流动噪声、六次命中环形缓冲与球面扩散。
- [ForceShield组件](https://github.com/cortiz2894/flow-shield-effect/blob/bf34d9ea48fd4333f5b42ef3e3772c89de2adccb/src/components/ForceShield/index.tsx)：位置/尺度、材质uniform同步、受击坐标转局部空间、开启/关闭进度。
- [作者技术拆解](https://github.com/pmndrs/website/blob/main/data/blog/creating-flow-shield.mdx)：分层说明透明球壳、边缘、流动、显隐和命中。

独立Chromium窗口实际访问演示。第一次较早捕获仅显示页面界面，出现一次React hydration错误；第二次等待12秒后成功看到护盾，console error和requestfailed收集为空。最终[参考原图](../artifacts/qa/shield-reference-preview.png)为1280×720真实网页捕获，体现中央透明、边缘发光及球面纹理。本阶段不是参考项目的完整功能/性能认证，也不是本作游戏的实机画面。

后续适配方向：保持低透明度中心以看清人物；轮廓包住身体并随角色移动；以云纹/符纹与元素流动替换过强的科幻网格。五行基色为淡金、青绿、水蓝、红、棕黄，持续期间保持该元素身份，避免把所有低耐久护盾统一染红。受击波纹与真实吸收事件同步；真气、冷却、吸收量、到期/破盾、暂停/重试/释放和御剑跟随均需完成后才能验收。
