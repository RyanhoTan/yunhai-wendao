# 云海问道 · 原项目Moon外观接入（2026-10-07）

已按用户最新要求沿用Emotive Engine的原Moon外观：原4K月面、Full Moon基本表面公式与面向校准，去掉自制月海/环形山、额外蓝色光晕及月面染色。保留此前请求的3倍直径，接入天空、云雨遮挡和海面反射。当前运行版本d8b95f4，两个资产/真实输入/重试用例与一个50状态图像比较用例全部通过，五个RTX4050实机状态零错误且预算内；独立只读review发现的两项外观偏差已修复。

[试玩](http://127.0.0.1:4194/)，刷新现有页；P打开天气面板，手动夜间/晴空方便看月面，随后可切回现实同步。按键、探索与天气规则保持；仍为Full外观，无日期月相或新增血月功能。

## 原外观与来源

[源码与适配说明](../docs/weather-references.md)固定ae2accddc8f3e65a024c38b55e71a54b7fb10a14。[本地原图](../public/assets/moon/moon-color-4k.jpg)4096×2048、2007445字节，Git blob 2f072e87f2145604405cc1cc6c33223f05549a33，SHA256 6563dd39fd90aade85495977c35499a71fc28809f27c3223f63aebf7914282af，与原仓库字节完全一致。来源与通知随资源提供，不引入整个Emotive Engine或新运行依赖。

Full相位沿用shadowOffset=(0,0)、shadowSoftness=.05、原纹理对比/微弱地照/默认白色发光，及55.5/-85/-60.5度校准；Moon.js选中shader未采样normalMap，因此不额外加载无效法线图。天空投影共用半径.023×3；月盘遮住星光，云和雨随后遮挡。游戏统一ACES/输出色彩管线继续使用，不承诺与作者不同相机、背景和后处理的截图逐像素一致。

纹理与角色共同加载完成后才启程，避免灰球；资源失败可重载。天空/海面共用一张纹理，World退出释放一次。初次作者网页贴图404的灰球记录属于[天气整合历史](weather-final-evidence-20261007.md)，本轮从固定源码本地提供原图，实际月海已显示。

## 当前验证

- [两个资产用例](qa/emotive-moon-tests.json)：2通过54.777秒，0失败/0flaky。延迟月面请求时菜单等待；200响应字节与原图一致；真实键盘启程/天气入口/云量End与Home显示100%和0%，纹理数量稳定；故意阻断首个请求后重载恢复。见[真实输入](qa/emotive-moon-input.json)与[失败恢复](qa/emotive-moon-retry.json)。
- [50图独立比较](qa/emotive-moon-baseline-tests.json)：1用例通过22.893秒；[all更新](qa/emotive-moon-baseline-update.json)38.185秒。复用共享海天的既有世界/攻击/盾/天气50状态，保持1.2%阈值、无遮罩、固定时区和冻结时钟；当前月夜基线已人工查看。
- [当前manifest](emotive-moon-evidence-20261007.json)复用同代码[最终五状态](emotive-moon-final-20261007/evidence.json)，全部1280×720 RTX4050、softwareRendered=false、请求/实际状态一致、非空、页面/控制台错误0。午、月夜、雨夜、森林枝叶遮挡、月下透明盾全部原PNG已逐张检查。最大124calls/556790三角/119几何/30纹理，预算300/750000/300/60；月夜仅增1纹理，几何/calls保持。

当前[月夜](emotive-moon-final-20261007/desktop-weather-night.png)真实月海方向与圆形轮廓可辨，[雨夜](emotive-moon-final-20261007/desktop-weather-night-rain.png)云遮月，[森林](emotive-moon-final-20261007/desktop-weather-forest-night.png)枝叶遮挡，[透明盾](emotive-moon-final-20261007/desktop-weather-shield-night.png)保持透视。月夜熵3.47/对比65.2；林下熵2.89/对比29.2仍偏暗，照明没有改变，不把像素通过当作FPS或新AAA认证。

[独立review](emotive-moon-review.md)发现左右镜像与+=叠入夜空/蓝halo/星光两项P2；已更正切线方向、移除自创halo、先画星再用月盘遮罩替换背景。源表面公式、UV逆映射与校准无明确问题；闭环由主任务当前源码与五个画面核验，不宣称review者单独进行GPU测试。

## 失败记录与范围

[模块详细记录](emotive-moon-module-report.md)保留初次五状态2准备超时/3通过（review修正前）、[初次测试](qa/emotive-moon-tests-initial.json)0通过/2等待超时130.341秒、[中间](qa/emotive-moon-tests-intermediate.json)1通过/1诊断等待超时302.687秒。工作站内存/交换区压力下标题动画/逐帧诊断等待不稳定；素材加载检查冻结标题，键盘输入检查真实UI精确100%/0%，再零dt发布当前状态，当前两项全通过。没有放宽数值条件或用旧截图替代当前结果。

本轮为外观/新资源加载验收；旧天气17用例/15状态、完整首章和动作录像均为历史，不重新计入当前通过数。没有改变角色动画、任务、碰撞、日夜状态或海洋波浪/岸线；旧报告/manifest已单独归档。

[当前源码/产物指纹](qa/emotive-moon-runtime-fingerprint.json)75个运行文件匹配d8b95f4、29个生产文件与测试版本一致。[最终构建](qa/emotive-moon-release-build.txt)通过，JS1026.17kB/gzip279.01kB，新原图约2MB，保留900kB chunk提示。默认生产隐藏QA helpers、当前按需求保留P开发面板；相对base支持HTTP根/子目录。未部署或push。

```sh
npm run build
npx playwright test tests/moon.spec.ts tests/baselines.spec.ts --reporter=line --trace=off
npm run inspect:canvas -- --headed --manifest artifacts/evidence.json --url 'http://127.0.0.1:4194/?test=1' --seed 42
python3 /home/ryan/.codex/skills/threejs-game-director/scripts/check_evidence.py . --report artifacts/final-evidence.md --manifest artifacts/evidence.json
```

运行模块d8b95f4、基线5cde920立即逐模块本地提交；最终证据与指纹另存文档提交。[制作记录](game-progress.md)保留阶段与原始失败，历史天气见[报告](weather-final-evidence-20261007.md)及[manifest](weather-evidence-20261007.json)。

[最终证据核验](qa/emotive-moon-final-evidence-check.txt)通过；JSON/本地链接/50图数量与75个运行及29个产物SHA256一致，预览HTTP200。
