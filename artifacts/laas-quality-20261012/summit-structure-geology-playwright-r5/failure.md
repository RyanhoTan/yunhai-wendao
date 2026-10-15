# 生命周期诊断候选失败

实际主山测试进程218915，约80.6秒发生Node heap OOM，SIGABRT，命令exit 1；最后GC约2036.9 MB live heap / 2088.5 MB capacity。

本次新增早期构造统计，见 `../summit-structure-validation-r5/construction-base.json`：538411输入三角、337845主山三角、200566外部三角、411条固定共享边，早期heapUsed为510645216字节。未返回construction-refined记录，故本次不是渲染/SAT装配完成后的内存失败。

正在释放canonical副本建立后已无用途的主山源poly数组。门禁、heap配置保持原样；本轮尚未完成。
