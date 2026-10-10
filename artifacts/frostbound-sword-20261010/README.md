# Frostbound Arcblade 接入验收 · 2026-10-10

角色的手持剑与御剑已替换为用户提供的 `Meshy_AI_Frostbound_Arcblade_1010020722_texture.glb`。文件与本地来源逐字节一致，SHA-256、三角形与内嵌贴图尺寸见 `intake.json`。本轮仅处理武器，不包含已有女性角色预览和 Vite 配置工作。

手持版保留原造型和 PBR 贴图，转正剑尖并适配右手。御剑版仅在运行时加宽剑身，护手和握柄不变；索引、UV、材质和贴图共享。两个模板验证完成后一起发布，启动失败提供重新加载。

## 验证结果

- `npm run build`：类型检查及生产构建通过。
- `tests.json`：6 项通过，覆盖延迟加载、加载失败重试、两角色真实键鼠攻击/御剑/落地，以及已有飞行死亡收剑、待机/御剑循环检查。
- `compatibility-tests.json`：2 项通过，覆盖反复切换角色后的存档与渲染资源稳定，以及真实行走、剑斩接触、施法、闪避、升高/加速和收剑恢复。
- `model/model.json`：116,344 个三角形，三张 2048×2048 PBR 贴图；角色克隆共享几何和材质，御剑版共享索引/UV，单独存储位置/法线。握柄、剑尖、宽站姿射线及错误检查通过。
- `evidence.json` 声明的四个桌面画面全部通过硬件画布检查，错误数为零，当前画面预算通过；最高 93 calls、524,764 三角形、83 几何、19 纹理。使用 RTX 4050 Laptop GPU，1280×720。
- 实际行走 1.81 秒短样本约 59.61 FPS、平均 16.775 ms；仅代表这台电脑的该段活动，不作为全地图或其他设备的性能保证。
- 独立代码审查无阻塞性问题。Jade 完整御剑循环及回绕 188 帧、15,513 个足底顶点，Shadow 原始静止站姿 14 帧、2,912 个顶点，全部命中实际剑面。最低脚点最大间隙约 1.024 cm / 0.981 cm；曲面与鞋底局部约 2 cm，未宣称完全贴合。详见 `review.md`、`review-flight-cycle.json`。

已复核独立模型正面、背面、斜侧、握柄近景与御剑版，以及两角色游戏画面、按键录像抽帧和剑斩接触帧。录像见 `game/*-input.webm`、`game/motion/hero-motion.webm`，截图见同目录。

采用现有场景/输入测试及本轮模型检查作为视觉验证；没有改写历史基线。此为武器接入，不进行首章通关或手机端发布验证。模型保持原 10.09 MB 和高面数，三张纹理带来约 64 MiB 未压缩 GPU 纹理开销；共享资源与关闭武器额外阴影提交控制了重复开销。

## 复现

```sh
npm run build
npm run preview -- --port 4194
npx playwright test tests/frostbound-sword.spec.ts
node scripts/capture-frostbound-game.mjs
```

独立模型及足底探针使用开发服务器：

```sh
npm run dev -- --port 5188
node scripts/capture-frostbound-sword.mjs
node artifacts/frostbound-sword-20261010/review-foot-contact.mjs
node artifacts/frostbound-sword-20261010/review-flight-cycle.mjs
```

模型来源和运行时适配说明见 [weapon-sources.md](../../docs/weapon-sources.md)。
