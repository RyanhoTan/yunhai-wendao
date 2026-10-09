# 古代女修仙者建模参考图

生成日期：2026-10-09。使用内置 image_gen；完整提示词见 prompt-turnaround.txt 与 prompt-front.txt。

- front.png：1024 × 1536，独立正面全身，作为单主体图生 3D 的主要输入。
- turnaround.png：1536 × 1024，同一设计的正面、侧面、背面，作为补充结构参考。后续按视角分别提取参考，不把三个人像组成的整张画面当作单主体轮廓。
- validation.json：PNG 完整性、分辨率、源文件复制一致性与人工审图记录。

人物为成年女性古代修仙者，采用象牙白与浅青色交领长衣、束腰、玉簪和布靴；背景简单，姿势静态，材质不透明。人工检查头饰、双手、衣摆和鞋靴完整可见，主要布料层次可辨。

这是生成的造型参考，三视图的细小纹样与附件仍应在建模时复核。未执行 img2threejs 的准入脚本或 3D 重建、骨骼和动画验收。当前仅归档参考素材。

参考标准：[img2threejs 图像验收规范](https://github.com/img2threejs/img2threejs/blob/main/grimoire/intake/validation_rubric.md)。
