# 五行攻击与粒子参考

用户指定three.quarks和Emotive Engine示例作为技术及运动参考。已读取下列源码，研究五枚元素的环绕阵列、错开发射、元素轮廓、拖尾历史和命中粒子。本作重做米制几何与Canvas粒子纹理，并接入人物位置、镜头方向、敌人/地形/实体代理、伤害、真气、共享冷却和重试清理。

- [three.quarks Trail Demo](https://github.com/Alchemist0823/three.quarks/blob/master/packages/quarks.examples/trailDemo.js)：采用其粒子库0.17.1与Trail/BatchedParticleRenderer接口，使用本作纹理和常量发射器，无示例贴图。
- [Nature Barrage](https://github.com/joshtol/emotive-engine/blob/main/src/core/gestures/elemental/nature/naturebarrage.js)：参考环绕藤蔓、错开出现和向外投射；本作青藤为程序曲线与折面叶。
- [Water Barrage](https://github.com/joshtol/emotive-engine/blob/main/src/core/gestures/elemental/water/waterbarrage.js)：参考滴状轮廓与水滴环绕；本作流珠为原创旋转曲面。
- [Fire Barrage](https://github.com/joshtol/emotive-engine/blob/main/src/core/gestures/elemental/fire/firebarrage.js)：参考火舌、环绕与尾迹；本作炎羽为三股偏弯火舌几何。
- [Earth Barrage](https://github.com/joshtol/emotive-engine/blob/main/src/core/gestures/elemental/earth/earthbarrage.js)：参考岩石翻滚与投射；本作岩矢为原创变形岩块。

Emotive Engine未作为运行依赖，未使用其吉祥物、元素模型或纹理。五行可按1–5选择、T发射；本作将演示中的向上散射改为镜头前方定向、有限追踪与扫掠碰撞。无外部生成任务与费用。
