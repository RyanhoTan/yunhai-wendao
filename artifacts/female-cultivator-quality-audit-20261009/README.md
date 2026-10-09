# 女修仙者模型质量与标准提示词审查

审查日期：2026-10-09。结论：当前草模不合格；未完整执行官方标准提示词，不属于完成的 img2threejs 重建结果。

## 根本原因

1. **漏掉路线适用性检查。** 官方 [build.md](https://github.com/img2threejs/img2threejs/blob/main/docs/standard-prompts/build.md) 第 0 步要求先测量人物轮廓，明确指出人物模板没有服装组件。宽袖、外扩长裙等服装占据明显轮廓时，要求停止这条路线并说明损失，转向 GLB 路线。当前参考图包含宽大下垂衣袖、长裙和多层外搭；前次工作没有完成这项检查就开始建模。
2. **几何实现过于粗糙。** 实际运行的模型在生成骨架上替换了自定义的环截面、薄壳和挤出网格。面部、手掌、袖口及裙层没有充分匹配参考；裙层存在穿插，手掌与袖口脱节。规格中的多个 attachment 采用相同的微小占位参数，没有真实测量接触关系。这些问题不能靠增加刺绣贴图或调整灯光解决。
3. **展示早于画面验收。** strict-quality 只证实规格通过其数据检查。当前 blockout 画面诊断实际失败，没有任何雕刻阶段获得通过；照片投影文件只是配置描述，当前草模尚未执行实际颜色贴图烘焙。打开预览不能代表完成。

上述问题属于本次执行缺陷。参考图基本满足全身、单主体、简单背景及多视图的输入条件；这不等于它适用于现有的程序化人体模板。

## 标准执行情况

| 官方要求 | 本次实际情况 | 判断 |
| --- | --- | --- |
| `build.md` 第 0 步：轮廓分带测量与服装适用性 | 未在建模前完成；现有启发式分割还把底部背景/阴影计入主体 | 缺失；不得当作已通过 |
| 填写对象类别、复杂度、解剖与细节清单 | 有 assessment、anatomy 与细节清单 | 已填写，不代表准确 |
| strict-quality 后才能生成 | 实际报告 `ok=true`，0 errors、0 warnings，33 components、9 materials | 数据检查通过 |
| 组件几何、连接与参考一致 | 人工审图和源码发现几何简化、穿插、占位连接参数 | 不合格 |
| 渲染、参考对比、当前阶段通过后才能推进 | tier1 `passed=false`，silhouette IoU=0.5396，阈值 0.85；缺少 map-stripped-render 证据 | 未通过；未完成模型 |
| 投影保真需实际烘焙 | 配置已有；实际材质阶段尚未解锁和执行 | 未完成 |
| `polish.md` 每轮只修一个缺陷并做同项前后测量 | 草模缺陷尚未进入可验收的逐项修正 | 尚未完成 |

IoU 是当前启发式分割/取景条件下的诊断值，不是“人物相似度百分比”。报告同时提示 8.3% 的渲染前景位于最大连通区域之外；灯光与分割噪声会影响该值。这些限制不改变可见几何错误和阶段验收失败的结论。当前报告还缺少 map-stripped-render 证据，不能凭单项数值宣布通过。

## 保留的证据

- `failed-front.png`：当时实际浏览器渲染的草模，属于失败证据。
- `tier1-failed.json`：原始失败诊断，字节不改写。
- `strict-validation.json`：原始规格数据检查报告，字节不改写。
- `render-manifest.json`：原始采集记录，包含两次依赖加载错误；不把这轮采集称为零错误验收。文件中的哈希是采集开始时的源码快照，`audit.json` 的哈希是审查时快照，两者不能混作同一时点。
- `audit.json`：输入、失败证据与官方标准文件的 SHA-256、状态及限制。
- `stopped-state.json`：停止后的本地状态快照。原任务的 `state.json` 同样设为 stopped，原因是服装路线不适用；没有伪造已通过的阶段，也没有改低门槛。
- `standard-build-prompt.txt`：完整官方 build 提示词，替换了当前参考、人物名、demo id、静态人物 profile 和 1.72m 尺度输入。它是纠正后的执行输入，**尚未重新执行**，第 0 步仍要求停止并请求路线选择。

审查只完成提示词、源码、已有实机截图和记录核对，没有进行新的建模、GLB 生成、绑定或动画验收。未完成的模型代码保留在工作区；本审查提交不混入它们。

## 下一步的具体路线

用户已明确选择“保留形象，先取得 GLB”。先从图生 3D 服务或已有资源取得高质量 GLB，检查脸、袖口、手指、裙层和正侧背轮廓，再按官方 [glb-force-measured.md](https://github.com/img2threejs/img2threejs/blob/main/docs/standard-prompts/glb-force-measured.md) 测量并输出代码。GLB 是测量输入，该路线输出 TypeScript，运行时不加载原 GLB；纹理图片不原样复制，颜色按顶点采样，细于顶点间距的刺绣仍可能损失。不能把这一路线描述成纹理和视觉完全 1:1。

坚持当前单图程序化人体路线：需要先重新设计服装以适配模板，再从第 0 步重做；贴身服装参考会改变当前形象，也不能保证达到所见演示质量。

本机 Tripo 凭据检查结果为 MISSING（进程环境及 shell 配置检查均如此）。没有发送 API 请求、创建生成任务或消耗服务额度。图生 3D 服务不是 img2threejs 自带能力；路线选择已经获得用户授权，当前缺少本机服务凭据或已有 GLB。密钥不得写入聊天、代码或此报告。

## 参考规范

- [img2threejs SKILL.md](https://github.com/img2threejs/img2threejs/blob/main/SKILL.md)：本次安装版本为 v2.0.0；要求遵守 hard stop。
- [build.md](https://github.com/img2threejs/img2threejs/blob/main/docs/standard-prompts/build.md)：本次核对了安装版本和 GitHub main 的标准提示词内容。
- [polish.md](https://github.com/img2threejs/img2threejs/blob/main/docs/standard-prompts/polish.md)：每轮只修一个缺陷，测量前后，未改善则撤回。
- [glb-force-measured.md](https://github.com/img2threejs/img2threejs/blob/main/docs/standard-prompts/glb-force-measured.md)：已有 GLB 的实测参数重建与细节保留边界。
- [Tripo 官方图片生成模型文档](https://developers.tripo3d.ai/en/docs/generation-image-to-model)：外部图生 3D 路线支持图片输入与有纹理/PBR 的模型输出；本次仅查询文档与凭据可用性，没有执行生成。
