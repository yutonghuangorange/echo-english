import hashlib
import http.client
import io
import json
from pathlib import Path
import tempfile
import threading
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from http.server import ThreadingHTTPServer

from models import ModelManager, DEFAULT_MODEL, BANDIT_MODEL, InstallCancelled
from server import Jobs, validate_clip, handler


class Response(io.BytesIO):
    def __init__(self, data, status=200, **headers):
        super().__init__(data)
        self.status = status
        self.headers = {"Content-Length": str(len(data)), **headers}


class ModelsTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        (self.root / "karaoke").mkdir()
        (self.root / "karaoke/bandit-requirements.txt").write_text("test==1")
        self.models = ModelManager(self.root)
        self.job = {"directory": self.root, "cancel": threading.Event()}

    def test_cache_identity_survives_restart_and_distinguishes_models(self):
        clip = {"videoId": "jNQXAC9IVRw", "start": 0, "end": 2}
        self.assertEqual(validate_clip({**clip, "model": DEFAULT_MODEL}), clip)
        with self.assertRaises(ValueError):
            validate_clip({**clip, "model": "arbitrary-model"})
        jobs = Jobs(self.root / "audio", lambda job: job["audio"].write_bytes(b"audio"))
        old = jobs.start(clip)
        jobs.worker.join()
        new = jobs.start({**clip, "model": BANDIT_MODEL})
        jobs.worker.join()
        self.assertNotEqual(old["id"], new["id"])
        metadata = json.loads((jobs.get(new["id"])["directory"] / "metadata.json").read_text())
        self.assertEqual(metadata["version"], 2)
        restored = Jobs(self.root / "audio")
        self.assertEqual(restored.start({**clip, "model": BANDIT_MODEL})["id"], new["id"])
        self.assertEqual(restored.start(clip)["id"], old["id"])

    def test_download_resume_and_server_ignoring_range(self):
        payload = b"official-weights"
        expected = hashlib.sha256(payload).hexdigest()
        target = self.root / "weight.ckpt"
        for status in (206, 200):
            target.unlink(missing_ok=True)
            target.with_suffix(".ckpt.part").write_bytes(payload[:4])
            def fetch(request, timeout):
                self.assertEqual(request.get_header("Range"), "bytes=4-")
                return Response(payload[4:] if status == 206 else payload, status, **{"Content-Range": "bytes 4-15/16"})
            with patch("models.urlopen", side_effect=fetch):
                self.models.download(self.job, "https://official.test/weight", target, expected, 100)
            self.assertEqual(target.read_bytes(), payload)
        # An interrupted verification does not issue a failing Range-at-EOF request.
        target.replace(target.with_suffix(".ckpt.part"))
        with patch("models.urlopen", side_effect=AssertionError("must reuse complete download")):
            self.models.download(self.job, "https://official.test/weight", target, expected, 100)

    def test_bad_hash_never_becomes_ready_and_cancel_preserves_partial(self):
        target = self.models.weight(BANDIT_MODEL)
        with patch("models.urlopen", return_value=Response(b"corrupt")):
            with self.assertRaisesRegex(RuntimeError, "校验失败"):
                self.models.download(self.job, "https://official.test/weight", target, "0" * 64, 100)
        self.assertFalse(target.exists())
        partial = target.with_suffix(".ckpt.part")
        partial.write_bytes(b"partial")
        self.job["cancel"].set()
        with self.assertRaises(InstallCancelled):
            self.models.download(self.job, "https://official.test/weight", target, "0" * 64, 100)
        self.assertEqual(partial.read_bytes(), b"partial")
        self.assertFalse(self.models.ready(BANDIT_MODEL))

    def test_installer_excludes_generation_and_records_recoverable_errors(self):
        release = threading.Event()
        self.addCleanup(release.set)
        def install(model, job, command):
            release.wait(2)
            raise RuntimeError("offline")
        with patch.object(self.models, "install_files", side_effect=install):
            self.models.start(BANDIT_MODEL, lambda *args: None)
            jobs = Jobs(self.root / "audio", models=self.models)
            with self.assertRaisesRegex(RuntimeError, "模型正在安装"):
                jobs.start({"videoId": "jNQXAC9IVRw", "start": 0, "end": 2})
            with self.assertRaises(RuntimeError):
                self.models.remove(DEFAULT_MODEL)
            release.set()
            self.models.worker.join()
        self.assertFalse(self.models.catalog()["busy"])
        self.assertEqual(self.models.errors[BANDIT_MODEL], "offline")
        self.assertFalse(self.models.ready(BANDIT_MODEL))

    def test_removal_keeps_audio_and_extra_dependencies(self):
        self.models.weight(BANDIT_MODEL).parent.mkdir(parents=True)
        self.models.weight(BANDIT_MODEL).write_bytes(b"weight")
        self.models.deps.mkdir()
        (self.models.deps / "keep").write_bytes(b"dependency")
        audio = self.root / "recording.wav"
        audio.write_bytes(b"voice")
        self.models.remove(BANDIT_MODEL)
        self.assertFalse(self.models.weight(BANDIT_MODEL).exists())
        self.assertTrue(audio.exists())
        self.assertTrue((self.models.deps / "keep").exists())

    def test_model_http_routes_install_cancel_and_reject_concurrent_generation(self):
        jobs = Jobs(self.root / "audio", models=self.models)
        server = ThreadingHTTPServer(("127.0.0.1", 0), handler(jobs))
        thread = threading.Thread(target=server.serve_forever)
        thread.start()
        def cleanup():
            jobs.close(); server.shutdown(); server.server_close(); thread.join()
        self.addCleanup(cleanup)
        def request(path, body=None):
            connection = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=3)
            connection.request("GET" if body is None else "POST", path,
                               body=None if body is None else json.dumps(body),
                               headers={"X-Echo-Client": "echo-english"})
            response = connection.getresponse()
            result = response.status, json.load(response)
            connection.close()
            return result
        def install(model, job, command):
            job["cancel"].wait(2)
        with patch.object(self.models, "install_files", side_effect=install):
            self.assertTrue(request("/health")[1]["modelManagement"])
            self.assertEqual(request(f"/models/{BANDIT_MODEL}/install", {})[0], 200)
            self.assertTrue(request("/models")[1]["busy"])
            self.assertEqual(request("/jobs", {"videoId": "jNQXAC9IVRw", "start": 0, "end": 2})[0], 409)
            self.assertEqual(request(f"/models/{BANDIT_MODEL}/cancel", {})[0], 200)
            self.models.worker.join()
        self.assertFalse(request("/models")[1]["busy"])
        self.assertEqual(request("/models/untrusted/install", {})[0], 400)
        self.assertEqual(request(f"/models/{BANDIT_MODEL}/remove", {})[0], 200)

    def test_intel_compile_adapter_is_scoped_and_never_enables_compilation(self):
        from bandit_compat import eager_construction
        def unsupported(*args, **kwargs):
            raise RuntimeError("Dynamo is not supported on Python 3.12+")
        torch = SimpleNamespace(__version__="2.2.2", compile=unsupported, Tensor=object())
        names = ("src.models.bandit.bandit", "src.models.bandit.bandsplit", "src.models.bandit.maskestim")
        modules = {name: SimpleNamespace(torch=torch) for name in names}
        with patch.dict(sys.modules, modules), patch("bandit_compat.sys.version_info", (3, 12)):
            with self.assertRaisesRegex(RuntimeError, "expected failure"):
                with eager_construction(torch):
                    model = object()
                    for module in modules.values():
                        self.assertIs(module.torch.compile(model, disable=True), model)
                        self.assertIs(module.torch.Tensor, torch.Tensor)
                        with self.assertRaisesRegex(RuntimeError, "显式禁用"):
                            module.torch.compile(model)
                    self.assertIs(torch.compile, unsupported)
                    raise RuntimeError("expected failure")
            self.assertTrue(all(module.torch is torch for module in modules.values()))

    def test_windowed_audio_preserves_start_end_and_overlap_without_gain_pumping(self):
        import numpy as np
        import soundfile
        from bandit import separate
        # Identity inference isolates the window stitcher from model quality.
        for frames in (1, 721, 192000, 432001):
            samples = np.random.default_rng(1).uniform(-.5, .5, (frames, 2)).astype("float32")
            source_path, target_path = self.root / "source.wav", self.root / "target.wav"
            soundfile.write(source_path, samples, 48000, subtype="FLOAT")
            with soundfile.SoundFile(source_path) as source, soundfile.SoundFile(
                    target_path, "w", samplerate=48000, channels=2, subtype="FLOAT") as target:
                separate(source, target, lambda chunk: chunk)
            result, _ = soundfile.read(target_path, dtype="float32")
            self.assertEqual(result.shape, samples.shape)
            np.testing.assert_allclose(result, samples, atol=1e-7)


if __name__ == "__main__":
    unittest.main()
