# 主山局部细分候选失败

- 执行：`GEOLOGY_VALIDATION_STAGE=summit-structure-validation-r3 npx playwright test tests/geology.spec.ts --output artifacts/laas-quality-20261012/summit-structure-geology-playwright-r3`
- 测试进程 217595，SIGABRT，命令 exit 1。
- 最后 GC 约 50.4 秒：1924.5 MB live heap / 2090.5 MB capacity；终端错误为 `FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory`。
- 该版本已限定主山范围，并锁定外部共享边；但仍未解决实际内存开销。没有成功 refinement/corridor 报告，后续道路、镜头、地基检查未完成。
- 不增加 heap 或放宽细节门禁；继续定位细分器的全边记录和未使用曲率探针缓存。当前主山模块未完成、未本地提交、未实机视觉验收。
