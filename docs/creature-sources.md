# 新增妖兽模型与交互

2026-10-08新增苍狼妖兽与赤脊兽，均实际参与身体阻挡、近战/法术扣血和首章阵眼战斗。

| 游戏妖兽 | 原始模型与作者 | 来源及许可 | 规模 | 动作 |
| --- | --- | --- | --- | --- |
| 苍狼妖兽 | Wolf / Quaternius | [Poly Pizza](https://poly.pizza/m/P1gU3Qkr9r)、[Ultimate Animated Animals](https://quaternius.com/packs/ultimateanimatedanimals.html)，CC0 1.0 | 986712字节、1962三角、51骨骼 | 12种动作，选Idle/Walk/Attack |
| 赤脊兽 | T-Rex / Quaternius | [Poly Pizza](https://poly.pizza/m/UYtneO5FpF)，CC0 1.0 | 336568字节、1820三角、29骨骼 | 6种动作，选Idle/Walk/Attack |

原GLB字节保留，SHA-256、边界与完整动作清单见[导入数据](../public/assets/creatures/metadata/intake.json)，来源随构建携带。模型是风格化折面美术，未声称达到参考中的写实PBR精度。运行时将+Z转为-Z，以躯干为原点、脚底对齐地面；狼高1.5m、赤脊兽高3.2m。保留骨骼原动作，改为哑光表面；赤脊兽绿皮色区改为赤褐色。骨骼实例独立，同一实例的子网格共用同骨骼，同种实例共用几何与材质。

身体使用旋转水平胶囊与高度区间；狼前段1.2m/后段0.55m/半径0.4m，赤脊兽前段1.6m/后段0.65m/半径0.85m，角色另有0.55m半径。尾巴、牙齿、爪尖与腿间空隙不作逐部位碰撞。共用60Hz更新与15cm移动分段，剑击0.16s判定一次、0.48s后可再攻击。狼与赤脊兽分别以原Attack的55%/50%为接触点，对齐0.85s敌人预警结束，命中后0.3s恢复。未新增推动/撞飞；原灵压等招式继续保留。

苍狼替换ID3/6/8/13（西部林道与阵眼），赤脊兽替换ID9/11（东部与北部阵眼）。原敌人ID、任务坐标、数量、属性与存档格式保留，旧存档已击败者不会重生。

用户的[中国龙](https://sketchfab.com/3d-models/animated-realistic-lowpoly-chinese-dragon-d942a0d167594169b3f037f562458d38)、[动画灰狼](https://sketchfab.com/3d-models/animated-gray-wolf-3d-animal-model-a83e9115090542a68f6d9cc37992e003)、[Boss妖龙](https://sketchfab.com/3d-models/boss-dragon-animated-42a3d4f31bd443998b747cbd11aeaad2)作体态/动作参考。公共API当日均标记`isDownloadable=false`，未导入原文件。用户允许其他类型，故选上述可分发资产，无购买或生成API任务。
