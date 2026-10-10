# Meshy 地形任务执行器

`scripts/meshy-terrain.py` 使用 Python 标准库，供 AI 执行获批地形的首轮 Image to 3D 提交、状态读取和 GLB 下载。用户只负责概念图审批与一次必要的服务接入，不需要运行这些命令或手动搬运资产。

## 一次性接入

在 [Meshy API Keys](https://www.meshy.ai/developers/keys) 获取 API key，仅将密钥原文保存在本机 `/home/ryan/.config/yunhai-wendao/meshy-api-key`，不要添加引号或 `MESHY_API_KEY=` 前缀，也不要发到聊天或放进仓库。文件应归当前用户所有、权限为600。执行器也支持已有的 `MESHY_API_KEY` 环境变量；密钥只用于 `https://api.meshy.ai` 请求头，不写入任务记录。

本轮已准备600权限文件，用户随后回复“保存了”；本机读取和真实 API 认证以实际执行结果为准。首次受理前检查服务响应，额度不足不充值、不升级、不换服务。

## AI 操作命令

```bash
python3 scripts/meshy-terrain.py prepare
python3 scripts/meshy-terrain.py submit
python3 scripts/meshy-terrain.py status
python3 scripts/meshy-terrain.py download
```

默认资产为 `sect-mountain-v1/mountain-body`，其他资产通过 `--batch` 与 `--asset` 指定。每次读取 `plan.json`，核对资产与批次的实际批准状态、PNG SHA-256 和审图批准哈希；新提交还核对批准地图原图哈希与批次所属地图版本。仅地图批准无法提交地形图。

- `prepare` 完全离线，在概念图目录生成 `meshy-request.json` 与 `meshy-job.json`；参数清单不保存 base64 图片载荷或密钥。
- `submit` 先验证凭据，再持久化提交检查点，之后仅发起一次 POST；服务返回真实 ID 后立刻保存。已经记录 ID 时直接复用，缺失本地检查点但 plan 已记录 ID 时也不重复提交。
- `status` 只查询一次已有 ID，瞬时 GET 错误最多3次尝试，遵守短限流等待；AI 在工具调用之间按退避继续查询并提供进度。仅持久化状态、进度与服务实际返回的额度消耗，不保存签名下载 URL。
- `download` 重新读取已成功任务，下载 GLB 与服务返回的 pre-remesh GLB；不携带 API key，不重生成任务。下载使用临时文件，检查 GLB v2 头与容器长度，再保存哈希。该检查只证明容器基本完整，几何、材质、路宽、碰撞与性能仍需后续验收。

进程锁防止两个操作者同时提交；检查点原子替换并同步磁盘。准备命令不能清空已有提交状态，也不能以新参数覆盖旧任务。已受理任务的查询与下载依据冻结检查点，不受下一块资产的全局生成参数变化影响。锁和临时下载文件由 Git 忽略，参数/任务证据与实际模型应按独立模块归档。

## 恢复与状态同步

POST 返回错误、超时、响应无 ID 或进程中断时，提交状态可能为 `submission_uncertain` 或 `submitting`；任何下一次 submit 都停止，不会自动补交。AI 使用 Meshy 任务历史或工作区核对是否已受理，保存真实任务 ID 和核对证据后继续已有任务；无法确认时保持暂停该服务阶段。执行器有意不提供自动第二次生成或自动重置检查点。

真实 ID 保存后，AI 同步活跃计划中对应 `asset.model_generation`（含冻结参数）、宗门 `tasks`、`provider_access` 与 `stage`；下载后同步 `review.json` 与制作进度。本工具模块交付时 prepared、无 ID；后续已经由真实 API 受理，最新状态以计划与检查点为准。执行器不自行改游戏布局或宣称任务已经完成。

验证命令：`python3 -m unittest scripts/test_meshy_terrain.py -v`。测试全部离线，使用临时目录与模拟响应，不能代替真实 API 接通和实际 GLB 验收。

接口依据：[Image to 3D](https://docs.meshy.ai/en/api/image-to-3d)、[Authentication](https://docs.meshy.ai/en/api/authentication)，2026-10-10核对。项目整体阶段和后续验收见 [AI 地形制作工作流](ai-terrain-workflow.md)。
