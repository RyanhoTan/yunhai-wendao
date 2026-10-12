# LAAS 实际画面对照与来源校验（2026-10-12）

## 来源边界

- 实际在线部署：[LAAS](https://dc5fzrbo8ssfx.cloudfront.net/laas/)。这是没有公开版本标识的部署。不能仅凭仓库名称把运行截图归为 `fd75fdb718996908aad3d22b59dfa297dc94298d`。本次在线 bundle URL、SHA-256、适配器、完整 console 与每个镜头位姿记录于 `../reference-live/manifest.json`。
- 仓库作者运行图：[Braffolk/fable5-world-demo](https://github.com/Braffolk/fable5-world-demo)，固定提交 `fd75fdb718996908aad3d22b59dfa297dc94298d`。`author-runtime-sources.json` 使用本地图像的 Git blob SHA-1 与该提交递归树核对，9 张图全部匹配作者 `shots/`，并补充 SHA-256。它们是作者程序运行输出，**不是本机运行证据，也不是仓库 reference/ 中的外部目标素材**。
- 《云海问道》历史基线采用 `artifacts/landscape-laas-20261010/after-r12/` 的真实运行图。它们说明当前改造起点与显著差距，不能代替 2026-10-12 本轮逐模块固定镜头截图。主代理已补充 `../before-hardware-r2/` 的新基线；本表仍保留对历史 after-r12 的范围说明，后续差异判定须改用新基线。

## 纠正时间和景别标签

| 原本地名 | 正确本地名/事实 | 核验结果 |
| --- | --- | --- |
| `author-runtime-golden-mountain-vista.png` | `author-runtime-mountain-vista-T11.png` | 图内 HUD 明确 `seed=1 scene=world T=11`，相机 `-200.0,296.7,1350.0`；不作为黄金时段证据。源 `shots/phase-5/floor-vista-6.8Mtris.png`。 |
| `author-runtime-golden-vista.png` | `author-runtime-gorge-water-view.png` | 实际是河谷水边与近岩坡，源 `shots/phase-6/gate-c2.png`。未显示时刻 HUD；既不能称山地远景也不能据文件名推断黄金时段。 |
| `author-runtime-golden-vista-phase2.png` | `author-runtime-mountain-vista-phase2-time-unverified.png` | 源名确为 `shots/phase-2/golden-vista.png`，图中没有时间证据。只能说明破碎山峰与云层空间结构。 |
| `author-runtime-hero-forest.png` | 保留 | 图内 HUD `T=11`，相机 `-500.0,234.6,600.0`，近中景枝叶和林下层次；不能当作本轮正午12点定时图。 |
| `author-runtime-grass-floor.png` | 保留 | 图内 HUD `T=11`，相机 `-1430.0,351.9,-250.0`。草、枯草、石子、倒枝、花灌木与林缘形成多层。 |
| `author-runtime-cliff-dressed.png` / `author-runtime-deadfall.png` | 保留为物件示范 | 图中有展台牌与平坦陈列地面，是 gallery 资产陈列，不可证明自由探索环境中的自然嵌合。 |

在线部署的 HUD 第一行打印的是**启动 params.timeOfDay**。仓库 `src/debug/HUD.ts:81` 明确如此；`hooks.setTimeOfDay` 只异步更新 SunSky、云影、GI 与 PostStack，不更新 params。因此 HUD T12 不能独自反驳已经执行的 T17.3 setter；也不足以独自证明其完成。另一个细节是带 `shot=N` 的启动会使用 bookmark 的 `tod`（`TerrainScene.ts` 的 `bootTod = bootBm?.tod ?? params.timeOfDay`）。可靠定时图采用 **不含 shot 的纯 cam+T URL** 启动，保留同一画面的 HUD、完整 URL 与位姿；动态setter试验单独留存，不作为精确定时最终对照。

## 本机 NVIDIA 执行结果

先前 `live-probe.json` 和 `runtime-failure.json` 的 no-adapter 失败属于旧驱动状态，已不代表当前可运行性。

本次 `nvidia-smi` 显示 RTX 4050 6 GB，驱动 `595.99.02`。有头 Chromium `148.0.7778.96`，WebGPU adapter 为 `vendor=nvidia, architecture=lovelace`；显式 `VK_DRIVER_FILES=/usr/share/vulkan/icd.d/nvidia_icd.json`，Vulkan/ANGLE 与 unsafe-webgpu。`reference-live/probe-rtx4050.json` 保留启动参数与完整 WebGPU limits。1600×900 的 seed1/high 首帧发生 `Instance dropped in popErrorScope`，已保存失败，不把它记为成功。1280×720 的 seed42/high 成功运行与生成五类视角，浏览器已关闭；精确定时纯 cam+T17.3 启动已尝试：HUD 确认启动 T17.3，但 `vkAllocateMemory failed with VK_ERROR_OUT_OF_DEVICE_MEMORY`，随后 `Instance dropped in popErrorScope`，并发生截图 30 秒 timeout；无有效黄金时段截图。完整失败日志与精简摘要已存档，浏览器已关闭，无待运行任务。成功 setter 视图移入 `attempt-runtime-setter/` 并改名 `timeCommanded17.3-actualTimeUnverified`。这一验收缺口保留为后续目标工作，当前不继续 GPU 重试。

## 十项最明显差距（历史 after-r12 对作者运行图/在线实际图）

该表只依据肉眼可见画面。LAAS 本身的噪点、层卡 aliasing 或 gallery 背景并不是要复制的优点。

| 顺序 | 《云海问道》可见问题 | LAAS 实际画面可见结构 | 下一次截图最需要看到的改变 |
| --- | --- | --- | --- |
| 1 | 主山近似平顶桶体，围绕山体的岩柱是细长锥体；山肩、岩层、侵蚀沟槽与台地几乎不参与轮廓。 | 山峰轮廓密集破碎，肩部与峡谷连续，纵向沟槽与岩壁明暗连续到谷底。 | 保持地图体量与道路，真实几何打碎桶壁/锥柱的规则轮廓；远景也能读出主山肩与侵蚀方向。 |
| 2 | 森林大量笔直树干配薄而散的叶片层，中景高度接近，树与树像重复的稀疏亭伞。 | 作者 hero 林内部有主干、水平枝与重叠叶簇；在线岩谷近景冠层有厚度、孔隙与内部深色。 | 近景可追踪主枝至叶簇，冠层内部有多层深度；中景出现不同树种、年龄、倾斜和林缘空隙。 |
| 3 | 草为少量宽直三角片，大片绿平面暴露；落叶几何少且规则，根周围缺乏连续的林下群落。 | grass-floor 中草与枯草密集穿插，近景小石、倒枝、灌木、花与土壤裸区有多层位置关系。 | 玩家10米内草蕨、落叶、细枝、石子、根与倒木形成贴地覆盖，并留自然裸土/行走区域。 |
| 4 | 主山岩壁大块光滑灰面，几乎只剩材质颜色和零星线条；道路岩壁同样缺中观断口。 | 作者远山与河谷有沿地形方向的层纹、湿度/植被斑块；物件示范展示岩台、苔藓与缝隙。 | 近壁实体裂隙、岩台和断口产生真实阴影，不靠微噪声伪装体积。 |
| 5 | 树根位置像柱脚，根外扩、枯落物与根周附着生态稀少；树干基部材质发灰。 | LAAS 林下画面树干直接处于草、灌木、枯枝和起伏地形的连续遮挡中。 | 根外扩贴坡、土壤/枯叶环逐渐过渡到草蕨，接触阴影只加强接触范围。 |
| 6 | 影区偏统一深绿，受光与未受光枝叶大多同色；近景树干阴影像硬片。 | hero 林内部冷色叶簇、棕色干枝、亮绿林下与穿透光区同时存在；在线树冠有可读体积。 | 阴影保留冷天空与绿反弹，逆光叶片透光，枝叶前后关系不被统一 ambient 照平。 |
| 7 | 谷底森林像等高度撒点，大片斜坡绿色平面露出；缺谷地与山肩的生态连续性。 | LAAS vista 树群沿谷坡成连续冠层，针阔叶高度不同，裸岩与密林边界受地形影响。 | 御剑视角读出群簇、密林/疏林/更新幼树及林缘，远景冠层高度随谷坡起伏。 |
| 8 | 道路边草叶突兀起止，裸土与绿坡界线硬；路边缺碎石与恢复中的植物过渡。 | LAAS grass-floor 中裸土、草和石子之间存在渐变，河谷湿地/岩坡亦有生境边缘。 | 道路净宽维持；踏地、碎石、矮草到长草形成非规则的侧向过渡。 |
| 9 | 远山仍像简单光滑绿色脊线，云只是一层亮白形状；主山与天空空间分层有限。 | 作者 phase2 图云层穿过山峰腰部，近中远山脊均保持方向与起伏，谷景有空气层次。 | 相同黄金时段明确近暖远冷，山谷雾低于部分山峰，远山结构仍可见。 |
| 10 | 近枝/草细节粗而硬，远树细节弱；静态图片不足以证明自由移动的稳定性。 | LAAS 已有 TRAA、分级枝叶/替身的实际画面；其作者图也有显著高频噪点，不能盲目仿照。 | 真实步行/御剑移动中保持枝叶结构，过滤噪点、阴影抖动与整片 LOD 弹出；需运动证据。 |

前三项应先改变真实几何、树形和实体地表，再评估光照与大气。禁止通过更浓雾、统一曝光或增加对象计数把该表改成“已达标”。

## 性能证据边界与归档

成功会话的每视角性能值来自 `__laas.stats` 与当帧 HUD 的快照；阴影级联分帧更新使 draw/triangles 在相邻帧波动，两者未必相同。这些值证明实际硬件渲染和所捕获帧的负载，不能当作同硬件同条件的稳定性能排名。完整位姿、启动URL、setter命令、seed42、高预设、freeze1、1280×720、Vulkan NVIDIA适配器与bundle哈希均在 `reference-live/manifest.json`。

三个正午题材视图以T12启动并显式命令T12（settle48帧+2.5秒），但并未读取闭包内部的最终runtime时刻；元数据也保守标注actualTimeVerified=false。两幅远景是实际在线运行图，时间只记录命令值17.3，不称严格黄金时段验收。新严格T17.3启动失败不能用已有图替代。

固定仓库MIT许可保存在 `LICENSE-fable5-world-demo-MIT.txt`，来源与哈希在 `license-source.json`。作者图9张均通过精确Gitblob核验；本地三处误导命名已修正，未对任何作者截图调色、裁剪或生成改图。未修改《云海问道》游戏代码、地形资产或进度文档；本参考模块由主代理合并review与提交。
