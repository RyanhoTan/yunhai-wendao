# 腐朽倒木几何 CPU 校验 r1

仅验证 CPU 几何数据；不代表画质、玩家视角、坡地贴附或碰撞性能通过。

- 独占源码：`src/world/ForestDeadwoodGeometry.ts`。
- 冻结 SHA256：`f4cc0cc0d5c305fdc1fa2a529704a94af2de7746707911cbfd87e61078866962`。
- 依赖：`src/world/WoodlandPrimitives.ts`、当前仓库的 Three.js 和 TypeScript。
- 192 个样本：form 0/1/2 各64，seed=(1289+i×7919)>>>0，i=0…63。
- `validate-original.mjs` 是最终执行过的原始 Node 校验代码，移除 shell heredoc 包装后保持测试正文。
- `previous-executed-result.json` 保存已执行终态的原始统计。该次调用未脚本化记录开始/结束 SHA，字段保留 null，避免伪造。
- `initial-failures.json` 记录首轮13个裂口代理失败、5个高度失败及中间两次残留问题。
- `run-validation.mjs` 使用原始脚本复跑，记录源码/Writer依赖的开始与结束 SHA，更新 `metrics.json` 和 `source-hashes.json`。

在仓库根目录复跑：

```sh
node artifacts/laas-quality-20261012/deadwood-geometry-validation-r1/run-validation.mjs
```

复跑只能由主线程通知避开其 GPU 性能采样时段后执行。开始/结束 SHA 必须相同且主源码匹配冻结 SHA。原脚本仍使用原阈值：法线误差≤1e-5，三角 cross 长度平方≥1e-16，实体 BOX 包络允许其2mm padding与浮点误差（检查≤3mm）；未为修复失败放宽任何阈值。

终态接地规则为 role 0–2 的全部 Y0 顶点均加入 contactIndices（包括脱落树皮底环和底中心），role 3苔与4菌只贴附木面；碎片不进入 solidBounds。空隙用 form0三处、form1六处、form2五处预定义点检查，不能证明整个连续体积均正确。仍需要真实近景、材质、通行和镜头验证。

