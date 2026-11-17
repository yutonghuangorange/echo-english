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

from server import Jobs, stop_process


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
                                assert health["device"] == "cpu" and "NVIDIA" not in health.get("deviceNote", "")
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
    args = parser.parse_args()
    import numpy as np
    import soundfile
    import torch
    import torchaudio

    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="echo smoke 中文 ") as temporary:
        directory = Path(temporary)
        # Synthetic stereo PCM, two seconds; no copyrighted or private input.
        samples = array.array("h", (int(8000 * math.sin(2 * math.pi * frequency * n / 44100))
                                   for n in range(88200) for frequency in (220, 330)))
        if sys.byteorder != "little":
            samples.byteswap()
        with wave.open(str(directory / "clip.wav"), "wb") as audio:
            audio.setparams((2, 2, 44100, 0, "NONE", "not compressed"))
            audio.writeframes(samples.tobytes())
        jobs = Jobs(directory)
        job = {"directory": directory, "cancel": threading.Event()}
        try:
            jobs.separate_audio(job)
            output = directory / "stems/htdemucs/clip/no_vocals.wav"
            data, rate = soundfile.read(output)
            assert data.shape == (88200, 2) and rate == 44100
            assert np.isfinite(data).all()
            subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(output),
                            "-codec:a", "libmp3lame", "-b:a", "192k", str(directory / "backing.mp3")],
                           check=True, timeout=30)
            info = json.loads(subprocess.check_output(
                ["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json",
                 str(directory / "backing.mp3")], text=True, timeout=30))
            assert info["streams"][0]["channels"] == 2
            assert abs(float(info["format"]["duration"]) - 2) < 0.1
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
                      "device": job["device"], "elapsedSeconds": round(time.monotonic() - started, 2)},
                     indent=2))


if __name__ == "__main__":
    main()
