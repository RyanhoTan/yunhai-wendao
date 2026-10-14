# 腐朽倒木几何 CPU 校验 r2

r1 的三张真实玩家近景已查看并被主线程拒绝：平滑灰圆管、整齐端口与平行槽边、矩形长条苔片。r1 所有原证据保持冻结，r2 独立记录。

本轮修改仅 `src/world/ForestDeadwoodGeometry.ts`，并写本新校验目录。改动真实断端、槽缘、剥皮、翻翘皮片及贴面不规则苔团几何；材质与实机整合由主线程负责。画质必须用新版玩家近景判断。

- `validation-plan.json`：192 样本范围、阈值、已查看原图及限制。
- `validate-original.mjs`：延续 r1 同一批192样本/同一套检查，预算上限由本轮明确授权改为5500tri，其他阈值保持。
- `draft-1-console.json`：首轮 r2 原始执行stdout，1项BOX包络失败。
- `draft-1-failure.json`：失败候选SHA、定位和修复；未放宽原3mm包络阈值。
- `run-validation.mjs`：实际复跑并直接保存 `replay-console.json`、`metrics.json` 和开始/结束 `source-hashes.json`。

从仓库根目录运行：

```sh
node artifacts/laas-quality-20261012/deadwood-geometry-validation-r2/run-validation.mjs
```

仅在主线程未进行GPU性能采样时运行。开始/结束源码和Writer依赖SHA必须一致，实际结果以metrics.json终态为准。源码冻结只能在此校验完成后确认。

接触点包含所有role0–2 Y0顶点，含脱落碎树皮底环和底中心；苔/菌只附木面，role3/4不算地面contact。脱落碎片不参与body/camera代理，附着硬树皮有单独BOX，未用丢接触点或填洞的方式绕过检查。预定义洞口采样不是连续体积证明。

CPU几何通过不代表LAAS画质达标，不包含FPS/材质/GPU、玩家真实输入、贴地矩阵或自由探索验收。

