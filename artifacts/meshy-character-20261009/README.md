# 女修玩家角色接入验收（2026-10-09）

从 `/home/ryan/下载/Meshy_AI_Jade_Blossom_Hanfu_All_Animations.glb` 接入了玩家角色。只替换玩家；师长继续使用现有角色。脚底蒙皮对齐现有角色根节点，游戏原来的玩家体型和墙体碰撞继续生效。待机、行走、跑步、挥剑、御剑、闪避与落地映射到 GLB 自带动作；待机和御剑动作的末尾平滑接回开头，锁定动作的水平根位移，避免动画把角色带出碰撞体。攻击取 `Triple_Combo_Attack` 的首个挥剑节拍并对应原有的伤害窗口。

原 GLB 为 30,944,672 字节；运行资源通过把 3 张内嵌 PNG 贴图转为 WebP 降到 13,742,248 字节（13.1 MiB）。脚本检查确认 1,269 个非图像二进制区块逐字节保留，节点、模型、蒙皮、28 根骨骼与 9 个动画均保留。源文件 SHA-256 记录在 `public/assets/character/jade-blossom-source.json`。压缩后的资源是 `public/assets/character/jade-blossom.glb`。

**验证**

- `npm run build` 通过。
- `npx playwright test tests/character.spec.ts tests/motion.spec.ts tests/town.spec.ts tests/creature-interaction.spec.ts`：14 项通过。覆盖资源加载、暂停与恢复、攻击命中、御剑支撑、完整待机/御剑循环、敌人接触、实机键盘移动和店铺后墙碰撞。
- `npx playwright test tests/baselines.spec.ts -g 'stable imported character'`：正面、背面、近景截图基线通过。
- `node scripts/inspect-threejs-canvas.mjs --manifest artifacts/meshy-character-20261009/evidence.json --url 'http://127.0.0.1:5188/?test=1' --seed 42 --headed` 及 `check_evidence.py`：四种角色/御剑状态和动作录像均通过非空画布及浏览器错误检查。
- RTX 4050 实际输入动作录像平均约 57 FPS；动作录像与关键帧合成在本目录。店铺测试确认角色能沿通道行走且停在后墙前。

此前 Meshy 下载可能含未使用的额外动作；接入只调用上述游戏状态需要的动作。使用 `python3 scripts/prepare-meshy-character.py <源GLB路径>` 可重建压缩资源。
