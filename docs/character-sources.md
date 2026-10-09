# 角色骨架、表面与动作来源

玩家使用用户提供的完整 Meshy 模型。师长模块仅导入可复用的人体骨架、加权服装轮廓和动作，不导入参考项目的世界、控制器或战斗系统；师长的脸、束发与国风服饰改造由《云海问道》另行创作。

## 当前玩家角色

- 玩家使用用户从 Meshy 导出的翡翠花影汉服角色 `Meshy_AI_Jade_Blossom_Hanfu_All_Animations.glb`。源文件 SHA-256 与优化后的 `public/assets/character/jade-blossom.glb` 见同目录 `jade-blossom-source.json`。
- 打包脚本仅把三张内嵌 PNG 纹理转成 WebP；几何、骨骼和全部九个动画保留。游戏调用模型自带的待机、行走、跑步、挥剑、御剑与闪避/落地动作，将 Hips 水平位移锁定在游戏碰撞体上。
- 新增用户提供的 `Meshy_AI_Shadowbound_Wanderer_All_Animations.glb`，游戏名为玄影行者。运行文件 `public/assets/character/shadowbound-wanderer.glb` 为 14,990,020 字节，来源指纹在同目录 `shadowbound-wanderer-source.json`；639 个非图像 bufferView 与源文件逐字节相同，28 根骨骼和全部五段动画保留。
- 玄影行者自带 `Walking`、`Running`、`Triple_Combo_Attack`、`Jump_Over_Obstacle_2` 与 `dying_backwards`。游戏使用前四段支持行走、跑步、攻击、闪避和落地；待机、御剑缺少对应片段，保持原始站姿。没有借用、生成缺失动作或增加施法摆臂覆盖，死亡片段保留在 GLB 中但没有新增死亡动作功能。
- 两个玩家模型通过角色面板切换，继续使用原玩家碰撞代理与玩法状态。缩略图直接来自各自模型。形象偏好独立于修行存档；切换不改位置、境界、任务、物品或御剑状态。新面板、资源与实机验收见 `artifacts/character-switch-20261009/README.md`；翡翠花影首次接入的详细验证见 `artifacts/meshy-character-20261009/README.md`。
- 下文列出的 Shadowflame Samurai 与 Mixamo 动作继续用于师长。

## 师长的人体模型与贴图

- 名称：[Shadowflame Samurai](https://sketchfab.com/3d-models/shadowflame-samurai-03def921ed814b3a9de5c5962b86a45c)。
- 作者：[dark_igorek](https://sketchfab.com/dark_igorek)。
- 许可：[Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)。Sketchfab 官方模型 API 于 2026-10-06 核对为 `CC Attribution`，要求署名、允许商业使用。
- 中转来源：[SamuraiThirdPersonTemplateThreeJS](https://github.com/achrefelouafi/SamuraiThirdPersonTemplateThreeJS)，提交 `496862cda55bfba3be6d02eec5aee3ca808a31a3` 的 `public/models/tpose.fbx` 与 `public/models/textures.glb`。
- 本模块修改：FBX 转 GLB、保留骨架与 skinning、焊接重复顶点、规范四权重总和、补存未加权末端骨、替换为 PBR 材质、提取 baseColor/normal/metalRoughness 图至 1024px WebP、修正 FBX UV 与 glTF 图像方向。未采用原发光效果。
- 完整文件 SHA-256、材质组区域、变换、骨数、贴图尺寸与转换结果见 `public/assets/character/metadata/intake.json`。

模型的 CC BY 4.0 署名与变更说明随 `public/assets/character/metadata/ATTRIBUTION.txt` 一起进入构建产物。

## 师长动作

- 动作由 [Adobe Mixamo](https://www.mixamo.com/) 创作，经同一参考仓库的 `public/animations/` 取得。
- [Adobe 官方 Mixamo FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html) 允许将角色和动作免版税用于个人、商业及非营利项目，包括游戏。本项目将其作为游戏功能使用，不作为独立动作资源产品出售。
- 使用原始文件：`Idle.fbx`、`Walk.fbx`、`Run.fbx`、`fight animations/Slash.fbx`、`fight animations/Crouchslash.fbx`、`fight animations/floating.fbx`、`fight animations/Landing.fbx`、`Jump.fbx`。
- 动作分别命名为 `idle`、`walk`、`run`、`slash`、`crouchSlash`、`float`、`land`、`hop`。按同名 Mixamo 骨绑定；单位比率根据非 Hips 骨的 bind 长度中位数测量；只将 Hips 的水平 X/Z 固定至 bind 位置，保留 Y 及所有其他关节轨道。使用 Three.js 的无损冗余关键帧优化。

## 参考代码

动作单位测量与水平根位移处理参考了中转仓库的 `CharacterController._retarget` / `_measureClipUnits`，按本项目离线流程重新实现。原项目代码为 MIT：

```text
MIT License

Copyright (c) 2026 mohamedachrefelouafi

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## long-wind 形体与渲染参考

参考 [jbang2004/long-wind](https://github.com/jbang2004/long-wind) 的提交 `4e7b6c35abb191a13fdc5414bbac5ff9fe385d70`，确认其使用 Three.js。研究 `humanoid.js` 的颅骨、眉弓、颧骨、鼻梁与下颌解剖分区，`outfitsHead.js` 的发际线与束发，以及 `charmat.js`、`environment.js` 的皮肤微表面和暖阳/冷色补光。

本作重新实现连续环形头部曲面，另行设计较窄下颌、眼窝、杏眼、鼻翼、唇线、发际线与束发；参数与几何属于本作原创。未复制参考项目的人物 GLB、贴图或动作文件。现有许可允许的基础蒙皮与动作继续使用。参考代码为 MIT，第三方模型有独立条款；此处仅作代码思路与外观研究。

## 重建与验证

先将参考仓库检出至以上固定提交，安装本项目 npm 依赖及 Python Pillow，然后执行：

```sh
node scripts/prepare-character-assets.mjs ../reference-samurai-template
```

输出仅为 `body.glb`、`motions.json`、18 张 WebP 与 `metadata/intake.json`；不把源 21.8MB FBX、24.5MB GLB 或参考引擎放进运行时。脚本验证全部骨骼在 GLB 往返后仍存在、bind 包围盒一致、每个动作轨道绑定有效、每段动作五个时间点的坐标有限且单位合理，并检查模型 ≤8MiB、动作 ≤2MiB、贴图总计 ≤5MiB。PBR 外链贴图加载与最终服装需继续用真实浏览器审查。
