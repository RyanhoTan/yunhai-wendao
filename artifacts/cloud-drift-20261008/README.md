# 云层持续流动 · 验收记录

2026-10-08，运行模块提交 `57c12a4`。

云层现在随独立天气秒钟持续飘动。原速度过低，看起来固定；风速从 `(.0013,.0003)` 调为 `(.012,.0035)`，约为原来的9.4倍。天空和海面倒影使用同一函数，云密度与受光边缘共同移动，手动固定昼夜时刻仍能观察到流动。

按P选择阴天，再关闭面板观察。Escape普通暂停会停止云运动，恢复游戏后继续。

## 验证

```sh
npm run build
npx playwright test tests/cloud-motion.spec.ts tests/weather-state.spec.ts --reporter=list
npx playwright test tests/baselines.spec.ts tests/weather.spec.ts -g 'stable world|actual local wall clock' --reporter=list
node scripts/inspect-threejs-canvas.mjs --headed --url 'http://127.0.0.1:4194/?test=1' --state weather-noon --seed 42 --out artifacts/cloud-drift-20261008 --run-id cloud-drift-20261008
```

构建通过。2项云动态、3项天气状态检查首轮23.4秒通过；精简重复截图和报告字段后，2项云动态检查22.8秒再次通过。既有52张基线与暂停时现实昼夜检查28.3秒通过，保持1.2%阈值与无遮罩，基线无需更新。共7项相关用例，无失败。

固定镜头、时刻和云量，仅推进6秒天气时间；像素统计区域为 `(360,120,500,140)`，排除HUD、人物、地形和海浪。RGB总差大于6计作变化像素。

| 场景 | RGB平均差 | 变化像素比例 |
| --- | ---: | ---: |
| 12点、80%云量 | 1.076 | 17.53% |
| 3点、80%云量 | 2.747 | 28.13% |
| 15点、零云量 | 0 | 0 |

截图冻结的天空差异为0。9秒真实游玩中，每3秒都观察到连续移动，天气秒钟从0.10推进到9.36，时刻保持12点；每段约6.2%的天空像素变化。鼠标选择云量、Home归零、Escape暂停/恢复与KeyD行走均通过，页面/控制台错误0，几何和纹理数量稳定。

1280×720海岸检查使用NVIDIA RTX4050硬件渲染，63calls、334418三角形、66几何、30纹理，零错误且预算通过；不作FPS结论。主任务已自查共享海天shader、时间传递、零云量、暂停和固定截图，并查看原始昼夜配对与连续帧；没有新增模型、贴图、依赖或渲染pass。

## 原始证据

- [白天0秒](weather-noon-0s.png)、[白天6秒](weather-noon-6s.png)、[夜晚0秒](weather-night-0s.png)、[夜晚6秒](weather-night-6s.png)，数据见[固定时刻报告](fixed-hour-report.json)。
- [连续0秒](live-0s.png)、[3秒](live-3s.png)、[6秒](live-6s.png)、[9秒](live-9s.png)，数据见[连续游玩报告](live-report.json)，保留[完整实机录像](live-cloud-drift.webm)。
- [硬件画面](desktop-weather-noon.png)及[画布检查报告](desktop-weather-noon.json)。

本次只验收云的流动及相关天气/图像回归；首章通关证据仍属于历史验收。
