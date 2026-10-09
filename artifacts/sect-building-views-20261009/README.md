# 宗门建筑三向外观参考

日期：2026-10-09。使用内置 image_gen，以用户提供的宗门山顶总览图为依据生成六张独立参考图。每张只展示一种建筑，视角从左到右依次为正面、右侧、背面。

| 建筑 | 图片 |
| --- | --- |
| 主殿 | [01-main-hall.png](01-main-hall.png) |
| 藏经阁 | [02-scripture-library.png](02-scripture-library.png) |
| 炼丹堂 | [03-alchemy-hall.png](03-alchemy-hall.png) |
| 弟子居所 | [04-disciple-residence.png](04-disciple-residence.png) |
| 观景亭 | [05-viewing-pavilion.png](05-viewing-pavilion.png) |
| 山门 | [06-mountain-gate.png](06-mountain-gate.png) |

原始总览图保存在 [reference-scene.png](reference-scene.png)。每张图片的完整生成提示词见 [prompts.json](prompts.json)。

这些图片用于外观设计与 Blender 建模参考。背面和遮挡处属于按统一风格补充的设计，各图没有标定尺寸，不代表从同一三维模型导出的精确投影。模型制作时需统一柱网、屋顶轮廓和尺寸。弟子居所只展示一栋典型住宅，方便后续重复组合院落。

本模块只新增参考图片与生成记录，没有修改游戏代码或导入运行时资产。

验证与 review：已逐张检查建筑类型、三向视角、标题、完整入镜及正背门窗区别；六张 PNG 的分块 CRC、文件完整性、尺寸、唯一性和提示词对应检查通过。具体尺寸与 SHA-256 见 [review.json](review.json)。图片为参考图，未进行玩法或性能测试。
