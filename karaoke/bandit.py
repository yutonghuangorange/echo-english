"""Pinned BandIt inference worker; optional dependencies never enter the server process."""
import argparse
from pathlib import Path
import sys

from models import BANDIT_SHA, digest

SAMPLE_RATE = 48000


def reflected_chunk(source, start, length):
    """Read only one window; reflect at file edges, including very short clips."""
    import numpy as np
    size = source.frames
    indices = np.arange(start, start + length)
    if size == 1:
        indices[:] = 0
    else:
        indices %= 2 * (size - 1)
        indices = np.minimum(indices, 2 * (size - 1) - indices)
    first, last = int(indices.min()), int(indices.max())
    source.seek(first)
    return source.read(last - first + 1, dtype="float32", always_2d=True)[indices - first]


def separate(source, target, infer, progress=lambda value: None):
    """8 s Hann windows / 4 s hops, overlap-add with bounded RAM and VRAM."""
    import numpy as np
    size, channels = source.frames, source.channels
    length, hop = 8 * SAMPLE_RATE, 4 * SAMPLE_RATE
    window = np.hanning(length + 1)[:-1].astype("float32")[:, None]
    buffer = np.zeros((length, channels), dtype="float32")
    weight = np.zeros((length, 1), dtype="float32")
    for start in range(-hop, size, hop):
        estimate = infer(reflected_chunk(source, start, length))
        if estimate.shape != buffer.shape or not np.isfinite(estimate).all():
            raise RuntimeError("BandIt 输出无效。")
        buffer += estimate * window
        weight += window
        count = min(hop, size - start)
        if start >= 0:
            target.write(buffer[:count] / np.maximum(weight[:count], 1e-8))
            progress(min(100, round((start + count) / size * 100)))
        buffer[:hop] = buffer[hop:]
        buffer[hop:] = 0
        weight[:hop] = weight[hop:]
        weight[hop:] = 0


def load_model(source, checkpoint_path, device):
    import torch
    import yaml
    from src.models.bandit.bandit import Bandit
    # The official Lightning checkpoint has pickled metadata: verify before loading.
    if digest(checkpoint_path) != BANDIT_SHA:
        raise RuntimeError("BandIt 权重校验失败，请重新安装模型。")
    config = yaml.safe_load((source / "configs/models/bandit-mus64.yaml").read_text())
    model = Bandit(fs=SAMPLE_RATE, stems=["speech", "music", "sfx"], **config["kwargs"])
    checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
    state = {key.removeprefix("model."): value for key, value in checkpoint["state_dict"].items() if key.startswith("model.")}
    model.load_state_dict(state, strict=True)
    del checkpoint, state
    model.eval().to(device)
    return model


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--deps", type=Path, required=True)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--checkpoint", type=Path)
    parser.add_argument("--input", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("-d", choices=("cpu", "cuda"), default="cpu")
    args = parser.parse_args()
    sys.path[:0] = [str(args.deps.resolve()), str(args.source.resolve())]
    import torch
    import soundfile
    from src.models.bandit.bandit import Bandit
    if args.check:
        return
    if not all((args.input, args.output, args.checkpoint)):
        parser.error("input, output and checkpoint are required")
    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    model = load_model(args.source, args.checkpoint, args.d)
    def infer(samples):
        # Upstream treats stereo channels as independent batch entries.
        tensor = torch.from_numpy(samples.T.copy()).unsqueeze(1).to(args.d)
        with torch.inference_mode():
            output = model({"mixture": {"audio": tensor}})["estimates"]
            return (output["music"]["audio"] + output["sfx"]["audio"])[:, 0].T.cpu().numpy()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with soundfile.SoundFile(args.input) as source:
        if source.samplerate != SAMPLE_RATE or source.channels not in (1, 2) or not 0 < source.frames <= 600 * SAMPLE_RATE:
            raise RuntimeError("BandIt 输入必须为 48 kHz、单声道或立体声，最长 10 分钟。")
        with soundfile.SoundFile(args.output, "w", samplerate=SAMPLE_RATE, channels=source.channels, subtype="FLOAT") as target:
            separate(source, target, infer, lambda value: print(f"Echo progress: {value}", flush=True))


if __name__ == "__main__":
    main()
