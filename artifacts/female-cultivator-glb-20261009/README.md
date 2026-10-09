# 女修仙者 GLB 获取配置

用户已选择保留当前形象，先获得 GLB，再按 img2threejs 官方实测路线重建。此单元仅准备输入与生成参数；当前缺少 `TRIPO_API_KEY`，尚未生成模型。

## 已准备的输入

- 主参考：`../female-cultivator-reference-20261009/front.png`，1024×1536，正面全身，保持象牙白/浅青衣裙、黑发与玉饰。
- 三视图作为后续审图的辅助参考。它们与独立正面图不是完全一致的独立观测；不把一张拼图当作四方向模型输入。
- 生成服务：Tripo H3 `v3.1-20260211`，图片生成，详细几何、详细纹理、PBR，最多 300000 三角面。该数量是首次高质量参考模型的上限选择，并非实测值或游戏运行预算。
- 使用 `original_image` 纹理对齐和 `align_image` 朝向；开启输入自动修复。保留 UV；不使用 quad（会强制 FBX）或 generate_parts（与纹理/PBR 冲突）。
- 最初只获取静态模型，检查成功后再决定是否需要绑定/动画。没有预先提交后续付费任务。

具体参数和独立的 job checkpoint 路径在 `generation-plan.json`。它是配置文件，**不是已受理任务记录**。不要把它作为 helper 的 checkpoint；helper 会在实际受理时创建 `generation-job.json`。

## 凭据与执行

在 [Tripo API 密钥页面](https://platform.tripo3d.ai/api-keys) 创建密钥，在本机进程环境或 shell 启动配置中设置 `TRIPO_API_KEY` 后告诉 Codex“已配置”。密钥不放入聊天、仓库文件或生成配置。也可以提供已有角色 GLB 的本机绝对路径，跳过外部生成。

配置好凭据后，由 Codex 执行：

```bash
python3 /home/ryan/.codex/skills/threejs-3d-generator/scripts/threejs_3d_asset.py image \
  --image /home/ryan/workspace/yunhai-wendao/artifacts/female-cultivator-reference-20261009/front.png \
  --model-version v3.1-20260211 \
  --enable-image-autofix --orientation align_image --texture-alignment original_image \
  --geometry-quality detailed --texture-quality detailed --face-limit 300000 \
  --checkpoint /home/ryan/workspace/yunhai-wendao/artifacts/female-cultivator-glb-20261009/generation-job.json \
  --wait --download \
  --out-dir /home/ryan/workspace/yunhai-wendao/artifacts/female-cultivator-glb-20261009/source
```

`texture=true`、`pbr=true`、`export_uv=true` 是官方 H3 默认值，helper 在未指定禁用选项时保留这些默认值。生成/下载中断后，使用已有 checkpoint 的 `resume` 命令；不要重发新生成任务：

```bash
python3 /home/ryan/.codex/skills/threejs-3d-generator/scripts/threejs_3d_asset.py resume \
  /home/ryan/workspace/yunhai-wendao/artifacts/female-cultivator-glb-20261009/generation-job.json
```

外部 API 运行尚未验证；本单元只离线核对 helper 参数解析、参考文件与指纹，没有发送 API 请求。服务版本、剩余额度和生成质量应在实际调用时核查，不能从配置预先认定成功。

## 获得模型后的验收顺序

1. 验证 GLB 的 `glTF` magic bytes 与文件可解码；使用 img2threejs 的 `probe_glb.py` 记录 meshes、skins、animations 和模型结构。
2. 在浏览器展示原 GLB 作为**生成结果审图**，检查正面、两侧、背面和脸部近景；核对手指、袖口、穿插、发髻及刺绣。审图时使用原资源，与最终纯代码交付分开记录。
3. 只在原模型达到要求后，按官方 `glb-force-measured.md` 读取真实参数并输出 TypeScript；核查几何、颜色、材质和边界的一致性。
4. 官方强制实测路线不复制原贴图与 normal maps；颜色按顶点采样。细于顶点间距的刺绣可能损失，必须用原 GLB 与代码重建结果做可见对比，不能声称完全 1:1。

原始下载文件保存在 gitignored 的 `source/`，作为测量输入；任务元数据与报告可以另行归档。当前工作区保留的失败程序化草模没有作为合格模型提交。

## 规范

- [Tripo H3 图片生成模型参数](https://docs.tripo3d.ai/model-generation/image-to-model-v3-0-v3-1.html)
- [Tripo 凭据配置](https://developers.tripo3d.ai/en/docs/authentication)
- [img2threejs 强制实测标准提示词](https://github.com/img2threejs/img2threejs/blob/main/docs/standard-prompts/glb-force-measured.md)
- [失败草模审查](../female-cultivator-quality-audit-20261009/README.md)
