"""Run real short-audio separation without YouTube or microphone access.

Run with .venv/bin/python karaoke/smoke_test.py. Downloads the standard Demucs
weights on first use; uses the production separation path and discards audio.
"""
import array
import json
import math
from pathlib import Path
import platform
import subprocess
import sys
import tempfile
import threading
import time
import wave

from server import Jobs


def main():
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
        finally:
            jobs.close()
    print(json.dumps({"platform": platform.platform(), "architecture": platform.machine(),
                      "torch": torch.__version__, "torchaudio": torchaudio.__version__,
                      "device": job["device"], "elapsedSeconds": round(time.monotonic() - started, 2)},
                     indent=2))


if __name__ == "__main__":
    main()
