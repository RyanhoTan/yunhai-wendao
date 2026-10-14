# 腐朽倒木性能候选 r4

生产候选已冻结为 `41dfc7e11ee286c59329295116cd55878ca2bdcb1f226efad1e652a0ee774f2f`，Writer未改仍 `1b2ec438ba723e948a9ee8a58d050914c0a7c20e990f7477b6d9897c1f7425d5`。本轮所有基线来自r3冻结版Forest `7eb15a24425e2cf3a4561a138389623c726bc28fd22b48aa8407081acca07b29`。

目前只有**字节一致性通过**，速度收益待主线程实际浏览器A/B决定。Node单次基线3660.65ms、当前候选3746.23ms（慢2.34%），不宣称有效。若浏览器无收益，按主线程决定回滚至7eb。

当前候选仅三处变化：

- scarDamage里不依赖scar的edge三角函数移到循环外。
- surface外壁用同一次damage结果判断bare并着色。
- surface内壁省去完全不会用于其颜色或role的damage。

无新缓存、无面数/原型/密度/采样/随机序列/UV/材料/碰撞改变。Writer保持冻结。所有r1/r2/r3证据保持原字节。

已经撤销的候选：

- `candidate-row-cache-only.ts`、`row-only-fingerprints.json`、`row-only-evaluation.json` 保存64行精确t标量缓存的源码、原始192指纹与性能评估。
- 该候选192指纹一致，但单次3660.65→3649.73ms仅0.30%，不判有效，不保留在生产源码。
- 未对该被撤销候选声称384直接比较；384比较针对当前三处重复消除版本。

现有证据：

- `baseline-*.ts` 与 `baseline-source-hashes.json`：开始优化前冻结源码。
- `baseline-fingerprints.json`、`final-fingerprints.json`：form0/1/2各64，同seed=(1289+i×7919)>>>0，所有8个attrs/index、元数据、contacts、BOX、尺寸、bounds逐项指纹相同，CPU有限值/非退化/法线/静态风/尺寸/接地/洞口检查0失败。
- `exact-comparison.json`：另执行基线192件+当前192件，直接Buffer.compare所有数组/index，UTF8字节比较描述/metadata/contacts/BOX/dimensions/bounds，0差异；Writer默认padding0/.11快照一致。
- `metrics.json`、`perf.json`、`source-freeze.json`：终态、未证实性能收益和浏览器待验证状态；tsc --noEmit通过。
- `profile-observations.json`：读取startup-r5真实CPU profile的全节点合并与主要调用栈，inclusive不能父子相加。

复跑脚本（只在主线程无GPU性能采样并明确允许CPU的时段）：

```sh
node artifacts/laas-quality-20261012/deadwood-geometry-validation-r4/capture.mjs baseline
node artifacts/laas-quality-20261012/deadwood-geometry-validation-r4/capture.mjs final
node artifacts/laas-quality-20261012/deadwood-geometry-validation-r4/compare.mjs
npx tsc --noEmit
```

当前批量CPU已结束，源码不会在主线程新测量中继续修改。原始fingerprints/exact-comparison是复跑的权威结果；metrics/perf是本轮执行汇总。CPU证明相同不等于冷启动更快，也不代表画质验收通过。

