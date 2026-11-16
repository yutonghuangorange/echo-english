# 代码结构与维护约定

插件使用普通 JavaScript 和 Chrome MV3，无构建步骤、无运行时 npm 依赖。`manifest.json` 决定内容脚本加载顺序；浏览器通过 `Echo…` 全局对象连接模块，Node 测试使用同一份文件的 CommonJS 导出。

## 模块职责

| 文件 | 职责 |
| --- | --- |
| `extension/content.js` | 连接页面、媒体和存储；管理当前视频、练习流程和界面事件 |
| `extension/assembly.js` | 独立拼接弹窗；拆分重叠区间，管理手动版本选择、试听、取消、Blob URL 生命周期与选择持久化回调 |
| `extension/selection.js` | 纯练习领域规则：三种范围校验、字幕身份与录音版本编号、标签、旧范围设置的兼容读取；不读写 DOM、不控制媒体 |
| `extension/recording.js` | 单次录音会话：申请麦克风、准备增益和监听、创建编码器、收集音频、缓冲暂停与恢复、实时音量，以及取消和资源释放；通过回调提交结果 |
| `extension/microphone.js` | 固定输入增益、编码格式与码率配置、PCM 能力检测、实际采集参数和录音详情格式化 |
| `extension/panel-view.js` | Shadow DOM 的静态 HTML/CSS；不读取存储、不控制媒体 |
| `extension/transport.js` | 底部进度滑块、时间显示、跳转事件及其动画帧清理；通过回调读取媒体时钟 |
| `extension/playback.js` | 当前媒体操作的终点检测、超时、可取消等待；替换任务时清理旧调度 |
| `extension/practice.js` | 循环、自动跟读、录音连播顺序、字幕跟随等流程和纯函数 |
| `extension/karaoke.js` | 伴奏覆盖范围、服务状态格式化、耳机监听、演唱回放伴奏同步与 Web Audio 音量 |
| `extension/audio-export.js` | 分段取舍、时间轴对齐、人声与伴奏混合、WAV 导出 |
| `extension/storage.js` | IndexedDB 迁移、练习会话、录音版本与伴奏缓存；跨视频音频体积统计、分类型清理 |
| `extension/library.js` | 独立练习库弹窗：最近视频、搜索、缓存用量、清理确认及关闭生命周期 |
| `extension/caption-tracks.js` | 字幕轨道元数据、页面同源请求、JSON3 时间轴解析和当前轨道查询客户端 |
| `extension/caption-current.js` | MAIN 环境只读桥接，仅返回当前视频选中字幕的语言和轨道标识；不改变播放器 |
| `extension/subtitles.js`、`transcript.js` | 字幕文件解析、YouTube 文字记录读取 |
| `extension/languages.js`、`dictionary.js` | 语言显示策略、英语词典数据整理 |
| `extension/live-meter.js` | 麦克风实时 RMS／峰值、音量变化图、过载提示和分析节点清理 |
| `extension/audio-analysis.js` | 本机波形与低音量停顿分析 |
| `extension/panel-size.js` | 面板尺寸、标题拖动、位置与本机尺寸偏好 |
| `extension/background.js`、`karaoke-relay.js` | 词典与本机伴奏服务请求、跨上下文通信 |
| `karaoke/server.py` | 本机音频下载、去原唱、任务取消与缓存恢复 |

界面审查结论和验证范围见 [UI_AUDIT.md](UI_AUDIT.md)。`content.js` 的 `currentPage` 决定主操作区是否展示；配音和唱歌共用一套练习主按钮，位于滚动区之外，录制和播放时由进度与停止操作接替。语言设置归字幕页，下载详情归所选录音。

`content.js` 仍负责协调跨模块的用户操作。新增独立能力时优先扩展对应模块；只有需要当前视频、选中台词或界面状态的连接代码才放在入口中。

## 媒体流程约定

- `generation` 区分用户操作，`videoId` 区分 YouTube 页面。异步返回后先检查所属操作和视频，再更新界面。操作在第一次 await 前建立 generation；`guarded()` 在同步调用后捕获实际归属，不再猜测递增次数。
- `selection.js` 的 `resolve()` 是范围、录音编号和标签的唯一计算入口；配音和唱歌都支持整体 / 段落 / 片段。入口的 `selectedRange()` 只负责读取表单、校验视频上下文并调用领域模块，读取时不再修改表单。自动练习的循环次数、停顿和下一句选项按视频保存，整首及段落禁用逐句推进。
- 每次只运行一个练习媒体操作。停止时通过 `cancelPlayback()` 隐藏进度、取消终点检测和超时、解除等待、暂停音频和伴奏监听；媒体事件监听器由创建它的流程移除。
- `playback.seek()` 统一管理定位事件和超时，停止或替换操作时立即解除监听并结束等待。`playback.watchEnd()` 与 `playback.timeout()` 各自只保留一个任务。跳转后重新设定超时；回放跳回视频终点之前时重新启动终点检测。
- 进度显示使用单独的动画帧，不与终点检测共用帧编号。`transport.hide()` 会解除跳转事件并使旧回调失效。
- 片段前置播放可关闭、选择前 N 秒或上一句，按视频存 session；听原声 / 循环 / 自动练习应用前置范围，对比和录音回放保持原范围。录音前置播放使用原声，到起点暂停并精确定位，再启动录音和片段播放；前置阶段停止不保存空录音，所有资源归当前 generation。
- 原声和伴奏试听跟随视频时钟；录音回放跟随录音文件时钟。缓冲恢复时让视频追随录音，避免跳过录音开头。
- 段落录唱通过起句 / 止句选择至少两句连续字幕，边界取首句起点和所选句的最大终点，范围与选句索引按视频保存。所有片段媒体流程复用此范围；段落自动练习不逐句推进。单句浏览不改变段落边界。整首合成默认复用时间轴 plan；拼接弹窗按全部可用 1× 版本的边界拆分非重叠时段，用户可选版本或排除人声。显式 selectionPlan 校验范围、来源覆盖和非重叠条件，render 不再将手选旧版本重新归并成最新。行试听按 origin 裁出时段，整首试听及下载保持同一选择和回听音量快照；未选位置保留空白。
- 唱歌模式只显示主录唱入口，歌词点选及上下句选择通过 `select(..., true)` 切换当前片段；循环和自动练习独立折叠。是否监听伴奏由伴奏设置决定，关闭时主按钮可清唱，所有唱歌模式录音都标记为 `kind: song`。
- 回声消除和自动增益按配音 / 唱歌分别保存用户选择，默认配音开启、唱歌关闭；唱歌始终关闭降噪。自动增益关闭时可应用 0–24 dB 固定输入增益，开启时旁路手动增益，保留其数值。所有录音入口使用同一策略，与是否监听伴奏无关。
- 前置播放开始即进入录音布局并显示实时音量，正式录音复用同一分析实例；没有前置播放时在录音启动后旁路创建分析，不等待 AudioContext，也不将麦克风连接到扬声器；MediaRecorder 和音量分析接收同一录音输入：0 dB 时为原始麦克风流，正增益时为放大后的 MediaStreamDestination 流。增益图在录音启动前准备好，停止后与原始麦克风一起释放，保存录音增益元数据。缓冲跟随录音暂停，停止、错误、导航和自然结束时释放分析节点、AudioContext 和动画帧。
- 所有模式均只录麦克风，伴奏仅监听。完成输入准备及精确定位后，统一先启动录音器再启动视频和伴奏，避免视频启动时间吃掉录音开头；`vocalOffset` 保存预录偏移，用于回放和混合对齐。修改这里需覆盖开头、缓冲、停止和导航场景。
- `recording.js` 中的每个会话只管理自己的麦克风、增益图、编码器、音量分析和伴奏监听；停止后才返回的资源立即释放。单次停止只提交一次结果，资源清理幂等，过期错误不再影响后续会话。视频时钟、播放进度和字幕由入口协调，存储不放进录音模块。
- 开始申请权限前生成不可变的范围和录音身份快照。主录音与自动练习使用同一编号规则，字幕边界微调仍作为该句的新版本。`saveRecording()` 始终保存到开始录制时的视频；只有当前会话仍拥有界面时才发布结果。切页时解除旧会话的界面归属，因此 A → B → A 后的旧停止回调也不能覆盖新录音。历史查询同时检查请求序号。
- 独立人声演唱回放通过 `EchoKaraoke.followRecording()` 将伴奏绑定到录音时钟，扣除 `vocalOffset` 后定位，不修改人声播放位置。同步器负责伴奏漂移校正、缓冲、开关和清理；旧版混合录音不进入此流程。
- 回听音量使用独立的 `replayVocalVolume`、`replayBackingVolume`，与录唱监听的 `backingVolume` 分开，按视频写入 session。`createAudioOutput()` 用 Web Audio 增益控制人声，停止和结束时幂等释放；不支持时回退到 HTML 音量并显示 100% 上限。
- 下载混合与分段合成使用回听的独立人声、伴奏增益，在本机浏览器执行。旧版混合录音不能当作独立人声再次叠加伴奏。

## 字幕轨道

`captionClient` 在 YouTube 页的内容脚本中发起同源请求，只接受当前 `/watch?v=…` 视频的 `list/read`，固定访问 YouTube player 及其返回的同视频 timedtext URL；不接受调用者传入 URL，不携带账号凭据，不读取 Cookie。扩展后台不参与字幕请求，避免扩展 Origin 被 YouTube 拒绝。请求归属规则见 [Chrome 同源请求文档](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)。元数据缓存 5 分钟，上限 24 个视频，轨道读取保留简繁体标识；`fmt` 使用替换而不是追加，避免已有 `srv3` 覆盖 `json3`。

签名字幕地址返回 403 时刷新元数据并按原轨道重试一次，不对 429 自动重试。错误提示包含请求阶段与 HTTP 状态。

MAIN 只读桥接使用单次请求标识与当前视频校验，仅传回字幕身份；无网络或扩展特权。读取结果仍按 `generation` 和视频归属校验。字幕选择与已加载来源分开保存；失败、停止时不覆盖旧歌词；切换来源不删除录音。接口是 YouTube 非公开实现，需要持续维护；Android 客户端配置参考 youtube-transcript-api 上游。

## 验证

```bash
npm ci
npm test
python3 -m unittest discover -s karaoke -p test_server.py
```

`tests/session-ui.test.cjs` 用实际界面事件、模拟媒体和 IndexedDB 验证跨模块流程。`tests/playback.test.cjs` 和 `tests/transport.test.cjs` 使用可控时钟验证停止、替换调度、拖动进度及旧异步回调；同时检查浏览器按 manifest 顺序加载模块。

自动测试不访问真实麦克风或 YouTube。改动媒体启动、缓冲和音频同步后，仍需在已加载扩展的 Chrome 中实测。更新脚本列表后要重新加载扩展并刷新视频页；单独刷新页面不能替换旧的扩展注册信息。


## 练习库与面板位置

练习库使用原生 dialog，录音／播放忙碌时禁用入口；Escape 先取消清理确认，再关闭弹窗。导航、扩展开关或关闭面板会退出弹窗，避免页面残留模态锁定。清理成功后重新查询当前视频的录音和伴奏，清除过期撤销引用。

`storage.library()` 在同一个只读事务中游标汇总 sessions、recordings、backings，只返回标题、时间、数量、Blob.size 等元数据，不返回音频。`clearMedia()` 仅允许 recordings/backings，支持按视频删除；会话与字幕不删除。无需数据库版本升级。标题与活动模式随 session 保存。

`panel-size.js` 统一管理位置和尺寸；位置存在 `echo-panel-position-v1`，尺寸沿用原 key。移动标题和缩放手柄分别捕获指针；ResizeObserver 和窗口 resize 约束可见位置，保留用户偏好。位置归位与尺寸重置独立。

拼接弹窗使用独立 revision 取消生成，停止 / 关闭 / 页面切换使 active 失效；异步返回后不再播放或下载。预览 URL 在选择改变、重新生成及关闭时撤销；打开时暂停原视频。selection 按视频随 session 保存，缺失录音重新采用可用的默认版本，排除选择继续保留。全局 mode=assembly 阻止主面板启动其他媒体操作。


## 兼容边界与界面状态

新会话保存 `scopes: {speech, sing}`。`selection.restoreScopes()` 集中读取旧的 `speechScope` / `karaokeScope`，旧配音默认为片段，旧唱歌选择继续保留；界面统一使用 `practiceScope`，业务代码不再以唱歌字段处理配音。IndexedDB 仍为 v4，录音、字幕编号格式与旧 Blob 保持可读；`storage.cueKey` 是领域编号函数的兼容导出。历史数据迁移与用户界面分离。

`renderPracticeActions()` 独占主按钮文案，`controls()` 管理显示与禁用，`renderActivity()` 更新活动页标题；伴奏设置不再反向改写主按钮。折叠偏好通过独立 toggle 监听器保存，不包装或覆盖字幕加载、波形分析自己的处理函数。

本轮回归重点：正常录唱与自动练唱的版本一致性、三种范围与旧会话恢复、暂停缓冲、前置取消、权限／增益／监听的迟到结果、编码器初始化失败、跨页面迟到的录音停止、Opus 与原生 PCM 录制，以及监听加载失败后的资源清理。浏览器检查使用隔离页面和合成音源，不替代真实设备和 YouTube 网络环境的实机验证。
