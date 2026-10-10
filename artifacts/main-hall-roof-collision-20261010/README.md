# 主殿屋顶碰撞验收 · 2026-10-10

屋顶原本仅被注册为镜头遮挡体，角色碰撞系统只有地面圆柱与墙体，御剑可以穿过两层青瓦屋面。

修复后：两层屋顶按结构曲面构建双面薄板碰撞，阁楼与顶部宝顶使用实体代理；角色用0.55m半宽、1.8m高度的直立身体连续扫掠，碰撞后沿表面滑动。纯升降在接触处停止，不额外产生水平滑移。碰撞独立于瓦垄、彩绘等细节，不将整栋建筑填成实心盒子。

保持现有 custom 物理与1/60秒固定步长。两层曲面与可见屋面使用相同24列/10行采样，跳过冠顶退化三角形，共3,792个薄板代理，加2个阁楼/宝顶盒体；整体包围盒及局部包围盒先过滤，再做SAT连续碰撞。飞行高度采用最终受阻位置的地面高度，避免持续顶檐时借用前方台地高度而自动爬升。

## 验证

- 屋顶几何回归：四个坡面、多个曲率/翘角点，从上往下及从下往上跨越整层屋面均阻挡；侧面高速穿越、阁楼碰撞、殿内通行和高空越顶检查通过。
- 真实键盘：W+Shift加速撞侧檐，Space撞檐底，C下降接触两层屋面，F在裙顶收剑站稳，S走离屋檐下落，Space再次升起，高空W+Shift越顶。截图已逐张检查，页面错误0；位置见`real-input.json`。
- 相关回归共13项通过：首轮8项（55.4秒）覆盖主殿进出/墙体/台阶/存档、背墙深度间距、镜头、海岸岩石与市集御剑；最终5项（47.6秒）覆盖屋顶、真实走动/冲刺遇敌及瀑布低空飞行。
- `npx vite build`通过。受影响代码和其余测试的TypeScript检查通过。
- 完整`npm run build`暂时被工作区另一项未完成的`tests/qingxiao-sword.spec.ts`阻塞：该测试访问尚未加入诊断类型的`animation.weapon`，出现3处TS2339；该文件不属于本模块。类型检查临时排除此文件，其余仓库代码通过；临时配置已删除。
- 代码review检查了薄板轴投影/身体扩张、上下接触、连续时间区间、角落迭代上限、初始安全位置、飞行高度复位、殿内空腔，以及旧地面/敌人碰撞调用顺序。早期实机发现的顶檐自动抬高已修正。

```sh
npx playwright test tests/main-hall.spec.ts tests/camera.spec.ts tests/town.spec.ts tests/coast.spec.ts \
  -g 'four roof|walking height|rear skirting|real input enters|new frontage|camera stays|sword flight clears|low sword flight' --reporter=line
npx playwright test tests/main-hall-roof.spec.ts tests/creature-interaction.spec.ts tests/mountain-water.spec.ts \
  -g 'roof|real walking and dash|real low sword' --reporter=line
```

## 实机画面

- `side-blocked.png`：加速撞檐，停在x=13.451m。
- `underside-blocked.png`：持续Space，角色头部停在屋檐下。
- `lower-roof-contact.png`、`lower-roof-landed.png`：裙顶下降接触与收剑后的稳定站立。
- `upper-roof-contact.png`：冠顶下降接触。
- `clear-overflight.png`：足够高度的御剑仍可越过整栋主殿。

该模块仅本地提交，未push。逐模块提交标识记录在`artifacts/game-progress.md`。
