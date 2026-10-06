# 云海问道 · 人物与渲染验收（2026-10-06）

主角与师长已经改为正常人体比例的国风剑客，保留已有可探索山谷、海岸、战斗、御剑、成长与存档。原 Samurai 头盔/蒙面被原创头部替换，服装改为玉色护甲与交领衣片；骨骼动作完成站立、行走、奔跑、剑斩、闪避、悬浮与落地的游戏衔接。

试玩：[本地预览](http://127.0.0.1:4194/)。WASD移动、右键拖镜头、左键/R剑斩、Q御雷、E交互、F御剑、Space/C升降、Shift闪避或飞行加速、Esc暂停。完整说明见[README](../README.md)。

## 人物与参考实现

- 用户指定 SamuraiThirdPersonTemplateThreeJS；人体基础和动作来源、固定提交、署名与转换说明见[角色来源](../docs/character-sources.md)。30骨骼、66625源三角形，body GLB4.04MB、动作1.13MB、18张1024 WebP合计4.36MB；[intake](../public/assets/character/metadata/intake.json)记录SHA256与40个实际蒙皮姿态。仅冻结Hips水平根位移，其他轨道保留。
- long-wind确认使用Three.js；参考解剖分区、发际线、皮肤材质与暖阳/冷色补光。另行创作连续头型、较窄下颌、眼窝/眼睑、鼻翼、唇形与束发；参数、几何和Canvas微表面属于本作实现。基础动作沿用已接入的动作，不复制long-wind模型文件。
- 参考剑斩保留源姿态，时间映射至游戏0.12–0.24秒命中窗；闪避动态推进crouchSlash。float为源文件静态悬浮姿态，属于设计姿势；御剑位移由真实键鼠推进。实际靴底蒙皮顶点对齐飞剑表面，间隙<1cm。
- 人物六个蒙皮primitive在同一角色内共用骨骼纹理，角色之间姿态独立。角色共享不可变重染材质和顶点缓冲；地图遮挡与100m外师长停止绘制。Mixer与Skeleton骨骼纹理随游戏结束释放。
- 暖色主光、冷色天光、克制反向补光与PMREM；2048阴影范围由84m收紧至60m，法线偏移6cm降为2.5cm。没有引入全局ShaderChunk修改或额外后处理链。

## 构建与回归

验证运行时代码提交f175a22，视觉基线提交d040643；[当前汇总](qa/character-summary-20261006.json)携带源文件SHA256与逐图指标。生产构建通过：JS785.53kB/gzip214.53kB、CSS20.15kB/gzip5.54kB、source map3.55MB，base为相对路径。

完整21项回归全部通过，0失败、0跳过、0不稳定，耗时257.86秒。使用单worker独立Chromium硬件窗口与生产preview；真实键鼠从新游戏完成采药、复命、突破、御剑、三阵眼、灵匣、石灵与筑基，并刷新后恢复境界、完成状态和札记。[完整Playwright报告](qa/character-full-tests.json)、[通关指标](qa/bot-metrics.json)、[真实通关截图](qa/real-input-completion.png)。

人物模块检查覆盖加载完成后才进入游戏、暂停冻结真实骨骼、加载失败后重试、飞行中真实伤害死亡收剑、骨骼纹理去重释放。九张视觉基线包含正面、背面与五官近景，1.2%像素阈值未放宽，未使用遮罩。

## 实机画面与动作

[manifest](evidence.json) runId为character-longwind-20261006-r6，九场景全部RTX4050硬件渲染，console/page错误均0，声明绘制预算全部通过。下表数据来自各场景JSON，原图已人工检查；静态捕获不代替真实输入验收。桌面目标calls≤300、三角形≤750000、几何≤300、纹理≤60。

| 场景 | 熵 | 边缘 | 对比 | Calls | 三角形 | 几何/纹理 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| [character-front](character-longwind-20261006-r6/desktop-character-front.png) | 5.12 | 0.167 | 139.5 | 29 | 239484 | 30/25 |
| [character-back](character-longwind-20261006-r6/desktop-character-back.png) | 4.99 | 0.179 | 148.5 | 248 | 734606 | 112/31 |
| [character-portrait](character-longwind-20261006-r6/desktop-character-portrait.png) | 5.6 | 0.223 | 178.5 | 28 | 239220 | 30/25 |
| [active-play](character-longwind-20261006-r6/desktop-active-play.png) | 5.55 | 0.268 | 100.9 | 127 | 580186 | 95/30 |
| [flight](character-longwind-20261006-r6/desktop-flight.png) | 5.77 | 0.276 | 120.8 | 121 | 552048 | 91/30 |
| [boss](character-longwind-20261006-r6/desktop-boss.png) | 4.9 | 0.297 | 93.5 | 68 | 315236 | 78/30 |
| [forest](character-longwind-20261006-r6/desktop-forest.png) | 5.26 | 0.233 | 119.4 | 200 | 685304 | 106/30 |
| [coast](character-longwind-20261006-r6/desktop-coast.png) | 5.01 | 0.144 | 127.2 | 29 | 239484 | 30/25 |
| [map](character-longwind-20261006-r6/desktop-map.png) | 2.84 | 0.093 | 36 | 193 | 623110 | 77/10 |

[人物未暂停视频](qa/hero-motion.webm)、[12帧联系图](qa/character-motion-sheet.png)、[动作指标](qa/motion-metrics.json)覆盖移动开始/停止、剑斩接触、法术、闪避、御剑起降和恢复。最终1.8秒真实行走样本：位移12.04m、腿部跨度0.874rad、平均帧间隔6.421ms（155.74FPS）。该数值仅代表本机这一场景，不代表整张地图或其他设备。命中窗内两次采样剑尖Z均<0，敌人气血实际下降；飞行足底间隙<1cm，死亡后飞剑隐藏。动作记录错误空。静态近景展示实际游戏模型；人物脸部仍为风格化原创几何，未宣称扫描级照片写实。

视频10.68秒，12帧联系图已复核；[覆盖核验](qa/character-evidence-check-20261006.txt)确认9份场景报告与9份要求文件，共18项。实际游戏性能来自硬件窗口；联系图脚本只解码已录制视频，不提供性能数据。

## Review与已知边界

[人物review](qa/character-review.md)保存死亡显隐、飞剑足底间隙、骨骼纹理释放与闪避静止问题及修复。新增独立头部审查检查几何朝向、材质分组、骨空间挂接和正背面/近景，发现的发际线阶梯和眼白边缘分别通过解析发际线与完整眼睑连接带处理。主任务复核修复后图片，没有递归无缺陷认证声明。

最初压力回归18通过/3超时，当时主机可用内存约185MiB，报告保留在[压力排查记录](qa/character-memory-pressure-tests.json)。用户暂停其他3D预览后恢复约5.7GiB可用，本作另做资源共享。两帧步态测试相位偶合已改为900ms完整周期检查，不因偶合放宽功能阈值。

本轮为人物与照明的局部升级，按graphics量表只复核受影响项：主角2.1→2.3（正常人体、原创面部与衣片）；材质2.4→2.5（原PBR表面、皮肤微表面、材质角色与实测资源）；照明2.3→2.4（暖冷层次、近景阴影、活动画面对比93.5–148.5）。保留已有世界/敌人/UI，不重新宣称整款游戏达到新的写实3A等级。游戏仍为有限地图单机首章，桌面键鼠验收，没有联机或移动端触控验收。

使用director、graphics-builder的模型/技术美术/评分规范、3D-generator集成规范、QA-release及commit。生成凭据全MISSING，无付费API作业或待下载资产。按小模块本地提交，UTF-8逐批核验，不push；进度与提交号见[制作记录](game-progress.md)。
