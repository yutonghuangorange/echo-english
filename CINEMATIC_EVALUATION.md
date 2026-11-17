# 电影配音背景音：独立可行性实验

本实验验证能否复用现有伴奏流程，为电影配音移除原对白、保留音乐和音效。当前已将 Demucs 接入配音模式的可选「保留背景音」。本文的 **BandIt 候选仍未接入正式服务**，普通安装不会下载 BandIt 或安装实验依赖。

## 样本与方法

- 素材：[《Sintel》公开预告片](https://commons.wikimedia.org/wiki/File:Sintel_trailer-1080p.ogv)，截取 10–30 秒，转换为 48 kHz 双声道 WAV。来源署名：© copyright Blender Foundation | www.sintel.org；[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)。实验对素材进行了截取、格式转换与音源分离。
- 基线：当前服务的 Demucs 4.0.1 / `htdemucs`，`--two-stems vocals -d cpu --segment 4 --shifts 0 -j 1`，取 `no_vocals.wav`。
- 候选：[官方 BandIt v2](https://github.com/kwatcharasupat/bandit-v2)，固定提交 `d5563d9031e95fdaa3e5a73d5020b9a0df61adb6`，使用[官方多语言权重](https://zenodo.org/records/12701995) `checkpoint-multi.ckpt`（446,680,129 字节；公开 MD5 `fea2868787551b0cff36cfcf7c3622a3`）。分别输出 `speech`、`music`、`sfx`，将后两者相加作为背景音。
- BandIt 沿用上游模型及重叠相加推理器，CPU 参数为 8 秒窗口、4 秒步长、batch size 1。上游示例为 GPU / 更密集重叠 / 更大 batch；本实验的速度与效果不能代表上游默认配置。
- 环境：Linux x86_64、Intel i7-11800H、约 32 GB 整机内存、Python 3.12、PyTorch / TorchAudio 2.5.1 CPU；两个引擎均限制两个 CPU 线程。没有使用 GPU。

这是单个片段的技术验证，没有独立干净对白、音乐和音效作为真值。耗时、内存和输出格式可以客观核验；**尚不能据此宣称哪个模型音质更好，也没有完成多电影、多语言人工试听验收**。

## 结果

同一段约 20 秒素材，以下均为分离运行的耗时，包含模型加载与音频写出，不含素材／模型下载：

| 引擎 | 耗时 | 进程内存峰值 | 背景输出 |
| --- | --- | --- | --- |
| 当前 Demucs | 30.89 秒 | 1.63 GiB | `no_vocals.wav`，44.1 kHz 双声道 |
| BandIt v2，多语言 | 239.89 秒（约 4 分钟） | 2.00 GiB | `music + sfx`，48 kHz 双声道 Float WAV |

BandIt 推理本身为 236.65 秒，其余约 3.24 秒为准备与保存。所有输出已检查为有限采样、双声道，时长与约 20 秒的输入相符；这不等同于通过音质验收。该配置下 BandIt 总耗时约为基线的 7.8 倍，不适合直接作为现有歌曲伴奏的默认替代，更不应仅按歌曲服务的耗时估计开放整段电影处理。

结果与样例见本机 `.cache/cinematic-benchmark/sintel-10-30/`。`index.html` 提供原声、Demucs 背景、BandIt 背景及提取对白的独立试听；`provenance.json` 记录来源，`bandit/metrics.json` 记录实际运行参数与统计。媒体、权重和实验依赖均不提交到 Git。

试听用 MP3 均施加同一个增益以避免削波，再编码为 192 kbps，没有分别做响度归一化；原始 WAV 保留。需人工对比对白残留、音乐与音效损失、混响以及处理伪影。当前结论是 **CPU 技术可行、成本较高，音质优劣待试听**，正式功能先采用 Demucs，BandIt 保留为独立实验。

## 复现（当前仅验证 Linux）

先配置现有伴奏 `.venv`，在项目根目录执行下列命令。额外依赖安装到单独目录，不修改正常伴奏环境；无需安装上游的 Ray、CUDA 或训练集工具。

```bash
mkdir -p .cache/cinematic-benchmark
git clone https://github.com/kwatcharasupat/bandit-v2.git .cache/bandit-v2
git -C .cache/bandit-v2 checkout d5563d9031e95fdaa3e5a73d5020b9a0df61adb6
.venv/bin/python -m pip install --target .cache/cinematic-deps --no-deps -r karaoke/experiments/requirements.txt
curl --fail --location -o .cache/cinematic-benchmark/checkpoint-multi.ckpt 'https://zenodo.org/records/12701995/files/checkpoint-multi.ckpt?download=1'
curl --fail --location -o .cache/cinematic-benchmark/sintel.ogv 'https://upload.wikimedia.org/wikipedia/commons/0/06/Sintel_trailer-1080p.ogv'
ffmpeg -nostdin -v error -y -ss 10 -i .cache/cinematic-benchmark/sintel.ogv -t 20 -ar 48000 -ac 2 .cache/cinematic-benchmark/original.wav
PYTHONPATH=.cache/cinematic-deps .venv/bin/python karaoke/experiments/cinematic.py --input .cache/cinematic-benchmark/original.wav --output .cache/cinematic-benchmark/bandit --bandit-repo .cache/bandit-v2 --checkpoint .cache/cinematic-benchmark/checkpoint-multi.ckpt
```

脚本只接受最长 30 秒的单声道或双声道输入，校验官方权重后加载，严格匹配模型参数，在 CPU 上运行。输出 Float WAV，避免音乐与音效相加时在写文件阶段削波；记录时长、峰值、RMS、耗时及可获取的进程内存峰值。这里的峰值／RMS 是音频电平，不能当作分离质量或发音评分。

基线复现：

```bash
OMP_NUM_THREADS=2 MKL_NUM_THREADS=2 TORCH_HOME="$PWD/.cache/torch" .venv/bin/python -m demucs --two-stems vocals -n htdemucs -d cpu --segment 4 --shifts 0 -j 1 -o .cache/cinematic-benchmark/demucs .cache/cinematic-benchmark/original.wav
```

官方代码为 Apache-2.0；该权重记录的许可证元数据为 CC BY-SA 4.0。正式接入时需分别保留代码、模型与测试素材的来源及许可说明；不把模型直接打包进扩展。

## 接入前需要解决的设计问题

- 现有提取、进度、取消、缓存、同步监听和导出可以复用；模型类型必须进入缓存标识，避免歌曲伴奏与电影背景互相覆盖。
- 配音模式已提供默认关闭的「保留背景音」，需要时再展开提取、试听和背景音量，不新增一套录音主流程。
- 始终单独录人声，回听和下载时才混入背景；歌曲与电影共用音轨管理，保留配音／唱歌各自的麦克风处理偏好。
- 此方案移除的是原对白整体，尚不能只去掉某个角色而保留其他角色。重叠对白、叫喊、呼吸与混响仍需单独试听。
- 新模型的 CPU 耗时和资源需求必须单独提示，不能套用歌曲伴奏的速度估计或直接放开长片段。Windows / macOS、GPU 和长片段尚未验证。
