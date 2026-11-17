# macOS / Windows 适配与交接

扩展没有构建步骤，三个系统都在 Chrome 的 `chrome://extensions` 加载 `extension/`。普通配音、录音、回听与导出使用浏览器 API，不依赖 Python。只有生成伴奏需要同一台电脑上的本机服务。

## 当前验证范围

| 平台 | 安装入口 | 分离依赖 | 验证状态 |
| --- | --- | --- | --- |
| Linux x86_64 | `bash start-karaoke.sh` | torch / torchaudio 2.5.1，默认 CPU，可选 CUDA 12.1 | 本机自动化、CPU / RTX 3060 Laptop 短片段分离已验证 |
| macOS Apple 芯片 | `bash start-karaoke.sh` | torch / torchaudio 2.6.0，CPU / 可选 MPS | macOS 15 原生 CI：安装、测试、CPU / MPS 分离通过；Chrome 录音待人工验证 |
| macOS Intel | `bash start-karaoke.sh` | torch / torchaudio 2.2.2，CPU | macOS 15 原生 CI 通过，固定 2.2.2；Chrome 录音待人工验证 |
| Windows x64 | `start-karaoke.ps1` | torch / torchaudio 2.5.1，默认 CPU，可选 CUDA 12.1 | 已补安装入口和进程清理；CPU / GPU 均等待实机验证 |

Windows ARM64 原生 Python 不在本次目标内。Apple 芯片使用原生 arm64 Python，避免混用 Rosetta、Intel Homebrew 和 arm64 虚拟环境。所有系统使用 Python 3.10–3.12；不要复制其他机器的 `.venv` 或项目专用 Node，重新运行本机安装脚本即可。

Intel Mac 的固定版本依据：[PyTorch 官方宣布从 2.3 起停止 macOS x86 构建](https://dev-discuss.pytorch.org/t/pytorch-macos-x86-builds-deprecation-starting-january-2024/1690)。版本由 `requirements.txt` 的环境标记自动选择。显式安装 SoundFile，作为 TorchAudio 无法加载 FFmpeg 共享库时的 WAV 读写后备；参见 [TorchAudio 后端文档](https://docs.pytorch.org/audio/2.5.0/torchaudio.html) 和 [SoundFile 安装说明](https://python-soundfile.readthedocs.io/en/latest/#installation)。

## macOS 持续验证

[macOS compatibility 工作流](https://github.com/zexiangliu/echo-english/actions/workflows/macos.yml) 在 `macos-15`（arm64）和 `macos-15-intel` 上分别运行 Python 3.12。每次推送 / PR 会实际安装对应依赖，使用系统 `/bin/bash` 验证安装脚本、执行 npm / Python 测试，并通过正式 Demucs CPU worker 分离两秒合成音频、检查输出与 MP3 编码，再从根目录入口启动服务、核验健康状态并停止。双架构原生验证已通过（[含根目录启动检查的验证记录](https://github.com/zexiangliu/echo-english/actions/runs/44035319570)）：两者均通过 185 个前端测试（1 个 Windows 专用检查跳过）、20 个 Python 测试，以及 CPU 短音频分离、MP3 编码和根目录入口启动 / 停止。后续运行结果以工作流页面为准；自动化不包含真实麦克风、蓝牙耳机或实际 YouTube 字幕验收。

Apple 芯片原生 arm64 环境的 `auto` 会在独立子进程探测 MPS，实际运行 GPU 小运算后才选择 Apple GPU；不可用时使用 CPU。Intel / Rosetta 环境保留 CPU。可指定 `--device mps` 严格要求 GPU，或 `--device cpu` 禁用加速；自动模式遇到 GPU 算子不支持或内存不足，仅重试一次 CPU。Mac 不使用 CUDA，也不需要额外安装 NVIDIA 依赖。手动短音频验收可运行 `.venv/bin/python karaoke/smoke_test.py`；首次会下载约 80 MB 模型，不使用私人媒体或 YouTube。

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

### MPS 验证范围

[实际通过记录](https://github.com/zexiangliu/echo-english/actions/runs/44042222930)：Apple 芯片 arm64 runner、macOS 15.8.2、Python 3.12.10、PyTorch / TorchAudio 2.6.0，`mpsAvailable: true`。同一段 20 秒双声道合成音频，正式 worker 的 CPU 总耗时 79.00 秒、显式 MPS 35.21 秒，约 2.24×。MPS 没有发生整项 CPU 重试，输出时长、声道、有限采样和 MP3 编码均通过检查。耗时包含设备探测、模型加载和音频写出，不含模型下载；这是共享 CI runner 的单次结果，不能保证其他机型或真实歌曲的比例。

同一轮两种 Mac 均通过 186 个前端测试（1 个 Windows 检查跳过）、22 个 Python 测试，以及根目录服务启动 / 停止验证。Intel Mac 继续使用 2.2.2 / CPU。真实歌曲、电影内容的音质和长片段仍需人工验收；BandIt 的 MPS 尚未接入。

CI 会打印 `mpsAvailable`，仅在设备可用时，用同一段 20 秒合成音频分别严格运行 CPU 和 MPS，检查输出时长、声道、有限采样和 MP3 编码并报告耗时。若 runner 没有可用 MPS，会明确跳过 GPU 推理；CPU / Mock 测试通过不能视为 MPS 性能或音质验证。暂不承诺加速比例，也未验证长片段或 BandIt 的 MPS 支持。

当地 agent 可运行（首次需下载约 80 MB 模型）：

```bash
.venv/bin/python karaoke/smoke_test.py --device cpu --seconds 20
.venv/bin/python karaoke/smoke_test.py --device mps --seconds 20
```

第二条显式要求 MPS，不会退回 CPU。耗时包含模型载入和音频写出；合成信号用于运行正确性检查，音质仍需真实内容人工试听。

Apple 芯片固定使用 PyTorch / TorchAudio 2.6.0，以修复 [2.5.1 的 MPS 卷积限制](https://github.com/pytorch/pytorch/issues/152278)；旧版错误建议的 `PYTORCH_ENABLE_MPS_FALLBACK=1` 无法解决该问题，因此项目不依赖这一开关。统一分离入口继续调用原版 Demucs；为兼容新版 weights-only 模型加载，只允许官方 `htdemucs` 权重所需的模型类、Fraction 与 NumPy 元数据类型，不关闭新版加载保护。Intel Mac 2.2.2 保留原有加载方式。

## BandIt 可选模型

0.22.0 通过扩展「管理模型」安装。使用独立 pip target 目录和跨平台 Python 文件操作，不更改基础 PyTorch；所有安装子进程沿用现有 POSIX / Windows 进程树清理。Mac 暂用 CPU，不将 Demucs 的 MPS 验证结果套用到 BandIt。Mac 双架构 CI 新增真实 BandIt 安装和两秒 CPU 分离；Windows 仍需按相同命令当地验收，重点检查依赖 wheels、安装取消与删除权重后已缓存音频可用。
