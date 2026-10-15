# 全域细分候选失败

- 执行：`GEOLOGY_VALIDATION_STAGE=summit-structure-validation-r2 npx playwright test tests/geology.spec.ts --output artifacts/laas-quality-20261012/summit-structure-geology-playwright-r2`
- 进程：215338；测试 worker SIGABRT；命令 exit 1。
- Node v22.23.2 最后一轮 GC 在约 69.85 秒，日志报告约 1839.5 MB live heap / 2073.8 MB capacity。
- 原始终端错误：`FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory`。
- 未生成整山 refinement/corridor 成功报告；未通过实际面片、道路 SAT、镜头或地基门禁，未构建该候选。
- 此失败不能用增加 Node heap 或降低细节阈值当作浏览器运行通过。后续候选限定主山局部细分，冻结与外部旧网格共享的边，并分别报告边界误差。
