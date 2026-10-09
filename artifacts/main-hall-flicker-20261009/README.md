# 主殿背墙下方闪烁修复 · 2026-10-09

用户从正门看进殿内时，背墙下方黑色条带出现闪烁。根因是灰泥墙和木踢脚线内侧面均处于 `z=-5.8`，不同材质的共面三角形争用同一深度，产生 z-fighting。

修复将后墙木踢脚线深度从0.32m改为0.40m；内侧面变为`z=-5.76`，凸出墙面4cm，外侧面也有真实层次。材质、镜头参数和碰撞没有改动。

验证：

- 新增实际模型射线回归：内/外两侧各9个采样点，分别检查合批前后模型；木面必须比灰泥面靠前至少3cm。修复前测试失败（间距0），修复后通过。
- `npm run build` 通过。`npx playwright test tests/main-hall.spec.ts tests/camera.spec.ts --reporter=line` 全部6项通过，32.8秒，包括真实键盘进出主殿、墙体阻挡、保存恢复与镜头检查。
- 透视渲染采用游戏的0.1/5000裁剪范围与90m台基高度，正面近看并微移相机。`before-perspective-*.png` 可见重合面产生的水平条纹；`after-perspective-*.png` 为稳定的完整木踢脚线。`seam-comparison.png` 提供局部对照；`before-geometry.json` / `after-geometry.json` 记录实际合批面坐标。
- 游戏生产预览用真实W键前进与右键拖动镜头检查正门内部：`game-front-after.png`、`game-orbit-after.png`、`game-input.json`，页面错误0。

只修正本次背墙闪烁；项目现有女性角色与Vite配置工作未纳入提交。
