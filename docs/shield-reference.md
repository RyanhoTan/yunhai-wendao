# 五行透明球形护盾 · 参考与游戏接入（2026-10-07）

用户要求角色周围形成透明球形护盾，可以看到内部人物，按元素区别颜色。先找参考的选型单元已提交24ef446；用户随后明确要求进游戏，现已在12bc630接入。1–5选五行、Z或HUD按钮施放，18真气/6秒持续/10秒共享冷却，42/60/78境界吸收；真实敌人命中、地面/御剑跟随、暂停/重试/到期均有当前实测，见[当前验收](../artifacts/final-evidence.md)。

首选[Flow Shield Effect](https://github.com/cortiz2894/flow-shield-effect)，作者Christian Ortiz。[实时演示](https://flow-shield-effect.vercel.app/)具有球形透明壳、边缘高光、流动能量、受击波纹和出现/消散。基于Three.js、React Three Fiber及自定义GLSL；效果核心为一个球网格、ShaderMaterial及uniform，可在本作纯Three.js中重新实现，无需迁移React/Next.js。

只读参考固定SHA bf34d9ea48fd4333f5b42ef3e3772c89de2adccb，位于游戏目录外outputs/reference-flow-shield。仅检出ForceShield源码、README及package元数据，没有引入参考模型、HDR或纹理。

- [shaderMaterial.ts](https://github.com/cortiz2894/flow-shield-effect/blob/bf34d9ea48fd4333f5b42ef3e3772c89de2adccb/src/components/ForceShield/shaderMaterial.ts)：透明/不写深度、边缘Fresnel、流动噪声、六次命中环形缓冲与球面扩散。
- [ForceShield组件](https://github.com/cortiz2894/flow-shield-effect/blob/bf34d9ea48fd4333f5b42ef3e3772c89de2adccb/src/components/ForceShield/index.tsx)：位置/尺度、材质uniform同步、受击坐标转局部空间、开启/关闭进度。
- [作者技术拆解](https://github.com/pmndrs/website/blob/main/data/blog/creating-flow-shield.mdx)：分层说明透明球壳、边缘、流动、显隐和命中。

独立Chromium窗口实际访问演示。第一次较早捕获仅显示页面界面，出现一次React hydration错误；第二次等待12秒后成功看到护盾，console error和requestfailed收集为空。最终[参考原图](../artifacts/qa/shield-reference-preview.png)为1280×720真实网页捕获，体现中央透明、边缘发光及球面纹理。本阶段不是参考项目的完整功能/性能认证，也不是本作游戏的实机画面。

实际适配：原创半径1.48m球、低透明中心与边缘高光，用细纹/曲纹/水波/升腾噪声/破碎轮廓形成五行身份。基色为淡金、青绿、水蓝、红、棕黄，持续期间保持施放元素。四槽命中环与真实吸收事件同步；双面单次绘制且内侧透明度仅20%，修复近墙镜头进入球内时消失。没有复制参考人物、贴图或React运行库。参考页原图与本作14个硬件状态分开保存，本作实机验收见当前报告。
