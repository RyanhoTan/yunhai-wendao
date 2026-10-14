# 腐朽倒木几何性能校验 r3

本轮是保持 r2 几何数据完全不变的生成性能优化。未更换原型、减面、降密度、改采样、改单位、改碰撞或材质。r1/r2 原证据未修改；`geometry.userData.geometryRevision` 仍为 `deadwood-r2`，这是保持元数据字节一致的有意行为。

基线先复制并执行192样本：ForestDeadwoodGeometry SHA `d73ad7f38f8a6283460deff9b03d9cba5ba23e7b4ac4d6f93273688e3514dcb5`，Writer SHA `7dc934658493edd474d89a27f9f23112d38c858540499a4644a25da8d49b3cf4`。

优化包括：

1. HEX颜色只转换一次到工作线性色彩，返回克隆并按原顺序乘tone。
2. `Writer.finish(name,padding=0,finalize=true)` 保持旧调用默认行为；只有倒木raw阶段传false，省去马上丢弃的normals/bounds。
3. 没有移除顶点时跳过排序、remap和全attributes的Float32重拷贝；保留BufferAttribute描述和最终正常计算。
4. 每件section最多缓存4096个精确输入；实测截面弧长UV和有限差分法线同样按精确数字输入缓存。缓存限于单件、会随构建结束释放；可变Vector返回克隆，算式、舍入顺序和随机数消费均不改。

原有compact后的normal计算及translation的normal处理顺序保留，以保证Float32结果一致。

证据：

- `baseline-*.ts`：优化前原始源码副本。
- `baseline-fingerprints.json`、`final-fingerprints.json`：192样本各8个attribute/index的原始字节SHA与描述、元数据JSON、接触点、BOX、尺寸及几何bounds。采样为form0/1/2各64，seed=(1289+i×7919)>>>0。
- `exact-comparison.json`：再执行基线192件与终态192件，直接Buffer.compare全部原始attribute/index数组，UTF8字节比较描述、metadata、contactIndices、BOX、尺寸及bounds。0差异。并确认默认Writer的0/.11m padding快照完全一致。
- `metrics.json`：终态汇总、192件有限值/单位法线/非退化/静态风/接触/尺寸/空腔/预算CPU检查全部通过。
- `perf.json`：单次分进程Node生成耗时5956.05→3811.21ms，下降36.01%；不包含hash和校验耗时。
- `source-freeze.json`：192精确比对及tsc通过之后冻结的两份源码SHA。

复跑（避开主线程的GPU性能采样时段）：

```sh
node artifacts/laas-quality-20261012/deadwood-geometry-validation-r3/capture.mjs baseline
node artifacts/laas-quality-20261012/deadwood-geometry-validation-r3/capture.mjs final
node artifacts/laas-quality-20261012/deadwood-geometry-validation-r3/compare.mjs
npx tsc --noEmit
```

上述脚本重新生成两套fingerprints和exact-comparison；metrics/perf是本轮已执行结果的汇总，新的复跑结论以新fingerprints/exact-comparison原始结果为准。基线复制源码不受当前项目源码后续修改影响。

性能计时仅包括每件factory调用，未测整游戏coldReady、GPU帧率、真实输入或画质。主线程还需验证其BOX sampler/QA状态优化后的真实启动。CPU相同与生成变快不构成新的LAAS画质验收。

