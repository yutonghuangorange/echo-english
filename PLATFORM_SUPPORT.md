# macOS / Windows 适配与交接

扩展没有构建步骤，三个系统都在 Chrome 的 `chrome://extensions` 加载 `extension/`。普通配音、录音、回听与导出使用浏览器 API，不依赖 Python。只有生成伴奏需要同一台电脑上的本机服务。

## 当前验证范围

| 平台 | 安装入口 | 分离依赖 | 验证状态 |
| --- | --- | --- | --- |
| Linux x86_64 | `bash start-karaoke.sh` | CPU torch / torchaudio 2.5.1 | 本机自动化、实际短片段分离已验证 |
| macOS Apple 芯片 | `bash start-karaoke.sh` | torch / torchaudio 2.5.1，CPU | 代码适配；等待实机安装与录音验证 |
| macOS Intel | `bash start-karaoke.sh` | torch / torchaudio 2.2.2，CPU | 已修正版本选择；等待实机验证 |
| Windows x64 | `start-karaoke.ps1` | CPU torch / torchaudio 2.5.1 | 已补安装入口和进程清理；等待实机验证 |

Windows ARM64 原生 Python 不在本次目标内。Apple 芯片使用原生 arm64 Python，避免混用 Rosetta、Intel Homebrew 和 arm64 虚拟环境。所有系统使用 Python 3.10–3.12；不要复制其他机器的 `.venv` 或项目专用 Node，重新运行本机安装脚本即可。

Intel Mac 的固定版本依据：[PyTorch 官方宣布从 2.3 起停止 macOS x86 构建](https://dev-discuss.pytorch.org/t/pytorch-macos-x86-builds-deprecation-starting-january-2024/1690)。版本由 `requirements.txt` 的环境标记自动选择。显式安装 SoundFile，作为 TorchAudio 无法加载 FFmpeg 共享库时的 WAV 读写后备；参见 [TorchAudio 后端文档](https://docs.pytorch.org/audio/2.5.0/torchaudio.html) 和 [SoundFile 安装说明](https://python-soundfile.readthedocs.io/en/latest/#installation)。

## 给当地 agent 的执行步骤

先在包含空格或中文的项目路径下测试；保留现有功能，不另做一套平台专用扩展。

### 1. 安装、重启和日志

macOS：已有 Homebrew 时脚本可补 Python / FFmpeg，并识别 Intel `/usr/local` 和 Apple 芯片 `/opt/homebrew`。运行：

```bash
bash start-karaoke.sh
```

Windows：先准备 **x64 Python 3.10–3.12（含 pip 和 Python launcher）**、**FFmpeg（ffmpeg / ffprobe 加入 PATH）**、**Node.js 22+ 或 Deno**，重新打开 PowerShell，再运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\start-karaoke.ps1
```

该参数仅作用于本次 PowerShell 进程，不改机器执行策略。脚本创建 `.venv\Scripts\python.exe`、安装 CPU 依赖并启动服务，后续复用环境；不会自动安装系统组件。无需激活 venv 或管理员 PowerShell。若导入 torch 报 DLL 缺失，检查 Python 架构与 PyTorch 所需的 Microsoft Visual C++ 运行库。

确认输出 `127.0.0.1:8765`，在扩展中重新检测。Ctrl+C 停止后再次运行应复用依赖。启动第二个实例应提示端口占用。首次生成会联网下载模型；失败时保留 `.cache/karaoke/<任务编号>/worker.log`，不要只记录面板提示。

### 2. 自动化检查

开发测试另需 Node.js 22+（只有 Deno 不能运行 npm 测试）。先 `npm ci`，再运行：

```bash
npm test
# macOS / Linux
.venv/bin/python -m unittest discover -s karaoke -p 'test_*.py'
```

```powershell
# Windows；npm ci / npm test 同上
.\.venv\Scripts\python.exe -m unittest discover -s karaoke -p 'test_*.py'
```

Python 测试不需要下载模型；包含真实子进程取消和退出清理。Windows 上 npm 测试额外解析 PowerShell 启动脚本并检查帮助入口；POSIX shell 安装模拟在 Windows 上跳过。模拟 Windows 分支通过不代表 Windows 实机分离通过。

### 3. 必须人工确认的功能

- **伴奏**：先生成 5–15 秒短片段，试听长度和声音；生成中点停止、处理中 Ctrl+C，确认 yt-dlp / FFmpeg / Demucs 子进程退出（Windows 用任务管理器，macOS 用活动监视器）。重新启动后能再次生成，已完成伴奏仍可恢复。
- **麦克风**：允许 Chrome 与系统麦克风权限。配音和唱歌均实录，检查开头、音量、声波、人声回听、伴奏监听；分别切换回声消除、自动增益、手动增益。蓝牙耳机切换麦克风后另试听一次。
- **录音范围**：配音与唱歌分别测试整段、当前片段、多句段落，含前置播放、自动停止、重录和版本切换。
- **音频格式**：默认 Opus 录制可回听和下载；浏览器支持时测试 PCM。若不支持应显示可用格式，不强制指定编解码器。核对录音设置中的实际格式和采样率；不要假设系统一定为 48 kHz。
- **导出**：原始人声 WebM、人声＋伴奏 WAV、分段选择合成均可下载，并用系统播放器从开头播放。导出文件名在 Windows 中可用。
- **界面与存储**：125% / 150% 系统缩放下移动、缩放面板，打开折叠设置和缓存管理弹窗；刷新恢复录音、最近练习和伴奏。YouTube 字幕获取另测目标语言，字幕失效不应归因于操作系统。

完成后记录 OS / 架构、Chrome / Python 版本、音频设备、测试命令和结果。必要的修正优先放在启动脚本、依赖声明或统一资源管理模块；避免在练习业务代码中按操作系统复制逻辑。
