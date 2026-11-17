"""Run real short-audio separation without YouTube or microphone access.

Run with .venv/bin/python karaoke/smoke_test.py. Downloads the standard Demucs
weights on first use; uses the production separation path and discards audio.
"""
import argparse
import array
import json
import math
from pathlib import Path
import platform
import signal
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
import wave

from server import Jobs, stop_process, probe_device
from models import ModelManager, DEFAULT_MODEL, BANDIT_MODEL


def check_launcher():
    root = Path(__file__).resolve().parent.parent
    with tempfile.TemporaryDirectory(prefix="echo launch 中文 ") as temporary:
        log = Path(temporary) / "startup.log"
        with log.open("wb") as output:
            process = subprocess.Popen(
                ["/bin/bash", str(root / "start-karaoke.sh"), "--cache", str(Path(temporary) / "cache")],
                stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
            try:
                deadline = time.monotonic() + 300
                while time.monotonic() < deadline and process.poll() is None:
                    # Do not mistake an already running service for this process.
                    if "Echo 伴奏服务已启动" in log.read_text(errors="replace"):
                        request = urllib.request.Request("http://127.0.0.1:8765/health",
                                                         headers={"X-Echo-Client": "echo-english"})
                        try:
                            with urllib.request.urlopen(request, timeout=2) as response:
                                health = json.load(response)
                            assert health["service"] == "echo-karaoke"
                            if sys.platform == "darwin":
                                assert health["device"] in ("cpu", "mps") and "NVIDIA" not in health.get("deviceNote", "")
                            return health
                        except urllib.error.URLError:
                            pass
                    time.sleep(0.2)
                raise RuntimeError("Launcher did not start successfully")
            except Exception:
                print(log.read_text(errors="replace"), file=sys.stderr)
                raise
            finally:
                if process.poll() is None:
                    process.send_signal(signal.SIGINT)
                    try:
                        process.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        stop_process(process)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--launcher", action="store_true", help="Also test the POSIX root launcher; port 8765 must be free")
    parser.add_argument("--device", choices=("cpu", "cuda", "mps", "auto"), default="cpu")
    parser.add_argument("--model", choices=(DEFAULT_MODEL, BANDIT_MODEL), default=DEFAULT_MODEL)
    parser.add_argument("--quality", choices=("standard", "lossless"), default="standard")
    parser.add_argument("--seconds", type=float, default=2)
    args = parser.parse_args()
    if not 0 < args.seconds <= 30:
        parser.error("Use 0-30 seconds of synthetic audio")
    import numpy as np
    import soundfile
    import torch
    import torchaudio

    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="echo smoke 中文 ") as temporary:
        directory = Path(temporary)
        # Synthetic stereo PCM; no copyrighted or private input.
        rate = 48000 if args.model == BANDIT_MODEL else 44100
        frames = round(rate * args.seconds)
        samples = array.array("h", (int(8000 * math.sin(2 * math.pi * frequency * n / rate))
                                   for n in range(frames) for frequency in (220, 330)))
        if sys.byteorder != "little":
            samples.byteswap()
        with wave.open(str(directory / "clip.wav"), "wb") as audio:
            audio.setparams((2, 2, rate, 0, "NONE", "not compressed"))
            audio.writeframes(samples.tobytes())
        accelerator = probe_device(args.device)
        models = ModelManager(Path(__file__).resolve().parent.parent) if args.model == BANDIT_MODEL else None
        jobs = Jobs(directory, accelerator=accelerator, allow_cpu_fallback=args.device == "auto", models=models)
        job = {"directory": directory, "cancel": threading.Event(), "model": args.model, "quality": args.quality}
        job["audio"] = jobs.audio_path(directory, job)
        try:
            if models:
                models.ensure(args.model, job, jobs.command)
            jobs.separate_audio(job)
            output = jobs.separation_output(job)
            data, output_rate = soundfile.read(output)
            assert data.shape == (frames, 2) and output_rate == rate
            assert np.isfinite(data).all()
            jobs.encode_audio(job)
            info = json.loads(subprocess.check_output(
                ["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json",
                 str(job["audio"])], text=True, timeout=30))
            if args.quality == "lossless":
                assert info["streams"][0]["codec_name"] == "flac"
                assert int(info["streams"][0]["bits_per_raw_sample"]) == 24
                decoded, _ = soundfile.read(job["audio"], dtype="float32")
                np.testing.assert_allclose(decoded, data, atol=2**-23)
            assert info["streams"][0]["channels"] == 2
            assert abs(float(info["format"]["duration"]) - args.seconds) < 0.1
        except Exception:
            log = directory / "worker.log"
            if log.is_file():
                print(log.read_text(errors="replace"), file=sys.stderr)
            raise
        finally:
            jobs.close()
    if args.launcher:
        check_launcher()
    print(json.dumps({"platform": platform.platform(), "architecture": platform.machine(),
                      "torch": torch.__version__, "torchaudio": torchaudio.__version__,
                      "requestedDevice": args.device, "device": job["device"],
                      "quality": args.quality, "model": args.model, "durationSeconds": frames / rate,
                      "elapsedSeconds": round(time.monotonic() - started, 2)},
                     indent=2))


if __name__ == "__main__":
    main()
