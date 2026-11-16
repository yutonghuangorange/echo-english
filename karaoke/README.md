# 本机去原唱伴奏（试验功能）

练习页展开「唱歌 · 去原唱伴奏」，点击「生成本段伴奏」。扩展把当前视频编号与生成范围（默认整首）交给本机服务；服务用 yt-dlp 提取所选音频，再用 Demucs `htdemucs` 分离原唱与伴奏。伴奏压缩为 192 kbps MP3 后传回浏览器，5 分钟约 7.2 MB，避免长歌曲的 WAV 超出扩展消息大小限制。无需上传伴奏文件，也不使用付费分离 API。

## 安装一次

以下命令在仓库根目录运行，适用于 Linux x86_64、Python 3.10–3.12。需要 FFmpeg（含 ffprobe）和 Node.js 22 或 Deno；这些工具须在启动服务的终端 PATH 中。

```bash
python3 -m venv .venv
.venv/bin/python -m pip install --index-url https://download.pytorch.org/whl/cpu torch==2.5.1 torchaudio==2.5.1
.venv/bin/python -m pip install -r karaoke/requirements.txt
```

若 Ubuntu 提示缺少 ensurepip，可安装系统的 python3-venv，或者使用系统 pip 管理一个无 pip 的虚拟环境：

```bash
python3 -m venv --without-pip .venv
python3 -m pip --python .venv/bin/python install --index-url https://download.pytorch.org/whl/cpu torch==2.5.1 torchaudio==2.5.1
python3 -m pip --python .venv/bin/python install -r karaoke/requirements.txt
```

Mac 可使用对应平台的 PyTorch 安装方式；此版本仅在 Linux CPU 环境验证，未测试 Mac/Windows。不要直接安装 CUDA 版依赖来运行这套默认 CPU 配置。

依赖参考：[Demucs](https://github.com/facebookresearch/demucs)、[yt-dlp 安装](https://github.com/yt-dlp/yt-dlp/wiki/Installation)、[YouTube JS runtime](https://github.com/yt-dlp/yt-dlp/wiki/EJS)。

## 每次使用

```bash
bash karaoke/start.sh
```

保持该终端运行；Ctrl+C 停止服务。它只监听 `127.0.0.1:8765`，不会监听局域网接口。更新扩展后在 `chrome://extensions` 重新加载，再刷新 YouTube 页面；扩展新增了这个回环地址的访问权限。

1. 练习页默认是「说对白 · 配音跟读」，不显示或启用伴奏功能，也不要求运行本机服务。要唱歌时，在顶部主动切换到「唱歌曲 · 保留伴奏」，无需先导入台词。默认范围为「整首歌曲」，最长 5 分钟。长视频可切到「当前练习片段」，设置歌曲起止时间。
2. 点「① 生成整首伴奏」。首次运行需要联网下载约 80 MB 的模型；按本机短片段测量粗略推算，3 分钟歌曲可能需约 5–8 分钟，尚未做整曲实测。生成期间会显示阶段、已用时间；去原唱阶段提供模型的真实百分比和该阶段预计剩余时间，每约 1.5 秒刷新。提取音频、加载模型和压缩等阶段显示等待动画，不提供虚构的总进度百分比。生成完会等待你操作，不会自动打开麦克风或开始录唱。
3. 若希望自动翻歌词，先读取视频台词或导入带时间轴的字幕。录唱时会跟随视频显示当前句、淡化上下句，并提前预告下一句；生成伴奏本身不会生成歌词。点「试听伴奏」，调整伴奏音量。戴耳机，点「② 开始整首录唱」，自动从视频开头录到结尾。当前字幕句子和配音片段不会被覆盖。
4. 录完在同一区域直接「回听演唱」「重新录唱」或「下载演唱」。重录保留之前的版本，每个范围最多三个版本。最近一次演唱可在页面刷新后恢复回听与下载；已保存的伴奏会自动恢复，可直接重录。
5. 如需逐句练习，选择台词并使用原有配音按钮；勾选「逐句配音也使用此伴奏」即可复用整首伴奏，无需为每句重新生成。切回「说对白 · 配音跟读」会关闭伴奏，恢复直接录制麦克风；切换视频也会默认回到配音模式。

视频原音轨在录唱时静音，只播放分离的伴奏；麦克风不实时返听。保存、回放和下载的 WebM 音频包含你的歌声与伴奏，不依赖服务继续运行。

生成范围与录唱范围分开：整首伴奏可用于它覆盖的任意片段，试听与录音会自动定位到对应时间。仅为片段生成的伴奏不能用于它以外的范围。

伴奏生成后会存入浏览器 IndexedDB，刷新页面会自动读取，不要求伴奏服务在线。页面仍默认回到配音模式，主动切到唱歌模式即可使用已恢复的伴奏。本机服务也会在完成后保存音频与恢复信息，重启服务不再清空已完成伴奏；浏览器没有缓存时，进入唱歌模式会查询本机已有结果并自动取回，不重新运行模型。普通配音模式不会发起这个查询。

浏览器和服务分别保留最近八份伴奏，超出时淘汰较旧缓存；清理网站数据会删除浏览器副本，手动删除服务缓存会删除服务副本。写入失败时会提示，不能把未保存成功的结果视为持久保存。停止、关闭面板或切换视频会请求取消正在执行的分离任务；未完成任务不作为可恢复的伴奏。

## 资源与数据

- 默认 CPU、两个线程、4 秒模型分段、单任务，无需显卡。`--shifts 0` 减少重复推理。
- 本机 i7-1165G7 / 16 GB RAM 测试：15 秒音乐片段约 35 秒，分离进程内存峰值约 1.5 GiB（包含首次模型下载与载入）。这不是对其他机器或长片段的保证；更短的片段也有模型载入开销。
- 本次 Linux CPU 环境约 953 MB，模型约 80 MB，此外会占用片段缓存空间。生成伴奏时会联网访问 YouTube 和模型下载地址；麦克风录音留在浏览器 IndexedDB，不会发给本机分离服务或第三方。
- 伴奏、恢复信息与日志放在仓库 `.cache/karaoke/`；模型在 `.cache/torch/`。失败详情查看对应任务目录的 `worker.log`。这些目录和 `.venv/` 均被 Git 忽略。
- 本机请求使用专用请求头，不开放网站 CORS，也不支持任意 URL、任意文件路径或任意命令执行。

## 限制与验证

这不是实时消人声。分离可能残留原唱、混响或损失部分乐器；只有伴奏输出也仍需完成整套模型推理。需要登录、年龄/地区限制的视频可能无法提取；不会自动读取浏览器登录 Cookie。遇到下载失败可先更新 yt-dlp（仍需保留配套 EJS 依赖）：

```bash
.venv/bin/python -m pip install -U 'yt-dlp[default]'
```

练习时不要手动拖动 YouTube 进度条。生成伴奏与混音录音由独立音轨同步，尚非逐样本对齐；卡顿时暂停伴奏和录音，恢复播放时按视频位置重同步。逐句自动跟读可复用整首伴奏；下一句超出已生成伴奏的范围时停止。

自动化验证包含参数限制、后台中转、生成/取消/错误状态、片段缓存、音频传输、混音连接、混合音轨保存。已实跑 CPU 分离，以及公开 YouTube 视频 0–5 秒的提取与分离，输出 5 秒 WAV（随后增加 MP3 压缩传输）。音乐性能样本来自 [PyTorch 教程](https://docs.pytorch.org/audio/2.5.0/tutorials/hybrid_demucs_tutorial.html) 的 A Classic Education / NightOwl（MedleyDB，CC BY-NC-SA 4.0），样本与结果不提交到仓库。另用独立的无头 Chrome 实测 Web Audio + MediaRecorder 混音，产生了可解码的 2.46 秒立体声 WebM（麦克风以合成信号代替）。真实 Chrome / YouTube / 麦克风的完整人工演唱流程仍需试听验证。

```bash
npm test
python3 -m unittest discover -s karaoke -p 'test_*.py'
```

## 点击生成没有进度

伴奏服务必须运行在使用插件的同一台电脑上，地址固定为 `127.0.0.1:8765`。GitHub 只同步代码，不同步 Python 虚拟环境、模型缓存或运行中的服务。从另一台电脑拉取项目后，需要按本文重新安装依赖并执行 `bash karaoke/start.sh`；若终端提示先安装依赖，则该电脑尚未配置 `.venv`。

生成失败原因会保留在生成按钮下方。超过 5 分钟的视频请改选「当前练习片段」。
