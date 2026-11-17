import http.client
import json
from pathlib import Path
import shutil
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from unittest.mock import patch

from server import Jobs, handler, validate_clip, AUDIO_CHUNK_BYTES

CLIP = {"videoId": "jNQXAC9IVRw", "start": 0, "end": 5}


class QualityTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name)

    def test_lossless_cache_restores_separately_and_legacy_keys_stay_unchanged(self):
        self.assertEqual(validate_clip({**CLIP, "quality": "standard"}), CLIP)
        with self.assertRaises(ValueError):
            validate_clip({**CLIP, "quality": "unknown"})
        jobs = Jobs(self.directory, runner=lambda job: job["audio"].write_bytes(b"audio"))
        standard = jobs.start(CLIP)
        jobs.worker.join()
        lossless = jobs.start({**CLIP, "quality": "lossless"})
        jobs.worker.join()
        self.assertNotEqual(standard["id"], lossless["id"])
        job = jobs.get(lossless["id"])
        self.assertEqual(job["audio"].suffix, ".flac")
        self.assertEqual(json.loads((job["directory"] / "metadata.json").read_text())["version"], 3)
        restored = Jobs(self.directory)
        self.assertEqual(restored.start(CLIP)["id"], standard["id"])
        self.assertEqual(restored.start({**CLIP, "quality": "lossless"})["id"], lossless["id"])

    def test_http_streams_bounded_flac_ranges_with_correct_mime(self):
        payload = b"fLaC" + b"x" * (AUDIO_CHUNK_BYTES + 19)
        jobs = Jobs(self.directory, runner=lambda job: job["audio"].write_bytes(payload))
        job = jobs.start({**CLIP, "quality": "lossless"})
        jobs.worker.join()
        server = ThreadingHTTPServer(("127.0.0.1", 0), handler(jobs))
        thread = threading.Thread(target=server.serve_forever)
        thread.start()
        def cleanup():
            server.shutdown(); server.server_close(); thread.join(); jobs.close()
        self.addCleanup(cleanup)
        def request(range_header):
            connection = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=3)
            connection.request("GET", f"/jobs/{job['id']}/audio", headers={"X-Echo-Client": "echo-english", "Range": range_header})
            response = connection.getresponse()
            result = response.status, response.getheader("Content-Type"), response.getheader("Content-Range"), response.read()
            connection.close()
            return result
        first = request(f"bytes=0-{AUDIO_CHUNK_BYTES-1}")
        last = request(f"bytes={AUDIO_CHUNK_BYTES}-{AUDIO_CHUNK_BYTES*2-1}")
        self.assertEqual(first[:3], (206, "audio/flac", f"bytes 0-{AUDIO_CHUNK_BYTES-1}/{len(payload)}"))
        self.assertEqual(first[3] + last[3], payload)
        self.assertEqual(request(f"bytes=0-{AUDIO_CHUNK_BYTES+1}")[0], 416)
        self.assertEqual(request(f"bytes={len(payload)}-{len(payload)+10}")[0], 416)

    @unittest.skipUnless(shutil.which("ffmpeg"), "FFmpeg is required")
    def test_flac_round_trip_preserves_24_bit_pcm_samples(self):
        import numpy as np
        import soundfile
        jobs = Jobs(self.directory)
        job = {"directory": self.directory, "quality": "lossless", "cancel": threading.Event()}
        job["audio"] = jobs.audio_path(self.directory, job)
        source = jobs.separation_output(job)
        source.parent.mkdir(parents=True)
        samples = np.random.default_rng(3).integers(-2**22, 2**22, (8192, 2)).astype("float32") / 2**23
        soundfile.write(source, samples, 48000, subtype="FLOAT")
        jobs.encode_audio(job)
        info = soundfile.info(job["audio"])
        decoded, rate = soundfile.read(job["audio"], dtype="float32")
        self.assertEqual(info.subtype, "PCM_24")
        self.assertEqual(rate, 48000)
        np.testing.assert_array_equal(decoded, samples)

    def test_lossless_pipeline_avoids_16_bit_intermediate_conversion(self):
        jobs = Jobs(self.directory)
        job = {**CLIP, "directory": self.directory, "quality": "lossless", "cancel": threading.Event()}
        job["audio"] = jobs.audio_path(self.directory, job)
        calls = []
        with patch("server.importlib.util.find_spec", return_value=True), patch("server.shutil.which", return_value="ffmpeg"), \
                patch.object(jobs, "command", side_effect=lambda job, args, *rest: calls.append(args)), patch.object(jobs, "separate_audio"):
            jobs.separate(job)
        self.assertIn("ExtractAudio+ffmpeg_o:-c:a pcm_f32le", calls[0])
        self.assertIn("pcm_f32le", calls[1])
        self.assertIn("flac", calls[2])
        self.assertNotIn("libmp3lame", calls[2])
