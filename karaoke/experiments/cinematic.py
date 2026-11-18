"""Offline CPU/CUDA feasibility test; not imported by the production service.

Requires the existing karaoke environment, plus separately installed BandIt
inference dependencies and an unmodified checkout of the official repository.
Use --help for arguments; model installation and licenses are documented in
karaoke/README.md. Runtime measurements do not establish separation quality.
"""
import argparse
import json
from pathlib import Path
import platform
import sys
import time


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bandit import load_model, SAMPLE_RATE


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--bandit-repo", type=Path, required=True)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--device", choices=("cpu", "cuda"), default="cpu")
    args = parser.parse_args()
    started = time.monotonic()

    import torch
    import torchaudio
    import soundfile

    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    if args.device == "cuda":
        if not torch.cuda.is_available():
            parser.error("CUDA is unavailable; install CUDA PyTorch and check the NVIDIA driver.")
        torch.cuda.reset_peak_memory_stats()
    sys.path.insert(0, str(args.bandit_repo.resolve()))
    from src.system.inference_handler import StandardTensorChunkedInferenceHandler

    audio, rate = torchaudio.load(str(args.input), backend="soundfile")
    if not 0 < audio.shape[-1] / rate <= 30:
        parser.error("This experiment accepts only 0-30 seconds of audio.")
    if audio.shape[0] not in (1, 2):
        parser.error("Use mono or stereo audio.")
    if rate != SAMPLE_RATE:
        audio = torchaudio.functional.resample(audio, rate, SAMPLE_RATE)
    model = load_model(args.bandit_repo, args.checkpoint, args.device)
    audio = audio.to(args.device)
    # Same upstream overlap-add handler; smaller batch and 50% overlap for CPU.
    handler = StandardTensorChunkedInferenceHandler(
        fs=SAMPLE_RATE, chunk_size_seconds=8, hop_size_seconds=4, inference_batch_size=1).to(args.device)
    if args.device == "cuda":
        torch.cuda.synchronize()
    prepared = time.monotonic()
    with torch.inference_mode():
        estimates = handler(audio[None], model)["estimates"]
    if args.device == "cuda":
        torch.cuda.synchronize()
    inferred = time.monotonic()
    output = {stem: estimates[stem]["audio"][0] for stem in model.stems}
    output["background"] = output["music"] + output["sfx"]
    args.output.mkdir(parents=True, exist_ok=True)
    levels = {}
    for stem, samples in output.items():
        if samples.shape != audio.shape or not torch.isfinite(samples).all():
            raise RuntimeError(f"Invalid {stem} output shape or non-finite samples.")
        # Float WAV avoids clipping when music and sound effects are summed.
        soundfile.write(args.output / f"{stem}.wav", samples.T.cpu().numpy(), SAMPLE_RATE, subtype="FLOAT")
        levels[stem] = {"peak": float(samples.abs().max()), "rms": float(samples.square().mean().sqrt())}
    report = {
        "engine": "BandIt v2 multi-language", "device": args.device, "threads": 2,
        "input": str(args.input.resolve()), "durationSeconds": audio.shape[-1] / SAMPLE_RATE,
        "channels": audio.shape[0], "sampleRate": SAMPLE_RATE,
        "chunkSeconds": 8, "hopSeconds": 4, "batchSize": 1,
        "prepareSeconds": prepared - started, "inferenceSeconds": inferred - prepared,
        "totalSeconds": time.monotonic() - started,
        "python": platform.python_version(), "torch": torch.__version__, "levels": levels,
    }
    if args.device == "cuda":
        report.update(deviceName=torch.cuda.get_device_name(0),
                      peakAllocatedMiB=torch.cuda.max_memory_allocated() / 1024**2,
                      peakReservedMiB=torch.cuda.max_memory_reserved() / 1024**2)
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
