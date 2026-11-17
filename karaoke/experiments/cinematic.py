"""Offline CPU feasibility test; not imported by the production karaoke service.

Requires the existing karaoke environment, plus separately installed BandIt
inference dependencies and an unmodified checkout of the official repository.
See CINEMATIC_EVALUATION.md for commands, provenance, and measured limitations.
"""
import argparse
import hashlib
import json
from pathlib import Path
import platform
import sys
import time


CHECKPOINT_MD5 = "fea2868787551b0cff36cfcf7c3622a3"
SAMPLE_RATE = 48000


def load_checkpoint(torch, path):
    # The official Lightning checkpoint may contain pickled training metadata.
    # Only permit the exact published multi-language checkpoint before loading.
    digest = hashlib.md5()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    if digest.hexdigest() != CHECKPOINT_MD5:
        raise ValueError("Checkpoint does not match the official BandIt multi-language weights.")
    return torch.load(path, map_location="cpu", weights_only=False)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--bandit-repo", type=Path, required=True)
    parser.add_argument("--checkpoint", type=Path, required=True)
    args = parser.parse_args()
    started = time.monotonic()

    import torch
    import torchaudio
    import soundfile
    import yaml

    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    sys.path.insert(0, str(args.bandit_repo.resolve()))
    from src.models.bandit.bandit import Bandit
    from src.system.inference_handler import StandardTensorChunkedInferenceHandler

    audio, rate = torchaudio.load(str(args.input), backend="soundfile")
    if not 0 < audio.shape[-1] / rate <= 30:
        parser.error("This experiment accepts only 0-30 seconds of audio.")
    if audio.shape[0] not in (1, 2):
        parser.error("Use mono or stereo audio.")
    if rate != SAMPLE_RATE:
        audio = torchaudio.functional.resample(audio, rate, SAMPLE_RATE)
    config = yaml.safe_load((args.bandit_repo / "configs/models/bandit-mus64.yaml").read_text())
    model = Bandit(fs=SAMPLE_RATE, stems=["speech", "music", "sfx"], **config["kwargs"])
    checkpoint = load_checkpoint(torch, args.checkpoint)
    state = {key.removeprefix("model."): value for key, value in checkpoint["state_dict"].items()
             if key.startswith("model.")}
    model.load_state_dict(state, strict=True)
    del state, checkpoint
    model.eval()
    # Same upstream overlap-add handler; smaller batch and 50% overlap for CPU.
    handler = StandardTensorChunkedInferenceHandler(
        fs=SAMPLE_RATE, chunk_size_seconds=8, hop_size_seconds=4, inference_batch_size=1)
    prepared = time.monotonic()
    with torch.inference_mode():
        estimates = handler(audio[None], model)["estimates"]
    inferred = time.monotonic()
    output = {stem: estimates[stem]["audio"][0] for stem in model.stems}
    output["background"] = output["music"] + output["sfx"]
    args.output.mkdir(parents=True, exist_ok=True)
    levels = {}
    for stem, samples in output.items():
        if samples.shape != audio.shape or not torch.isfinite(samples).all():
            raise RuntimeError(f"Invalid {stem} output shape or non-finite samples.")
        # Float WAV avoids clipping when music and sound effects are summed.
        soundfile.write(args.output / f"{stem}.wav", samples.T.numpy(), SAMPLE_RATE, subtype="FLOAT")
        levels[stem] = {"peak": float(samples.abs().max()), "rms": float(samples.square().mean().sqrt())}
    report = {
        "engine": "BandIt v2 multi-language", "device": "cpu", "threads": 2,
        "input": str(args.input.resolve()), "durationSeconds": audio.shape[-1] / SAMPLE_RATE,
        "channels": audio.shape[0], "sampleRate": SAMPLE_RATE,
        "chunkSeconds": 8, "hopSeconds": 4, "batchSize": 1,
        "prepareSeconds": prepared - started, "inferenceSeconds": inferred - prepared,
        "totalSeconds": time.monotonic() - started,
        "python": platform.python_version(), "torch": torch.__version__, "levels": levels,
    }
    try:
        import resource
        # Linux reports KiB; macOS reports bytes. Windows has no resource module.
        peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        report["peakRssMiB"] = peak / (1024 * 1024 if sys.platform == "darwin" else 1024)
    except ImportError:
        pass
    (args.output / "metrics.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2), flush=True)


if __name__ == "__main__":
    main()
