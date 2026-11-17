import json
import subprocess
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import Mock, patch

from accelerator import select_device
from server import Jobs, Cancelled, probe_device


class AcceleratorTests(unittest.TestCase):
    def setUp(self):
        platform = patch("accelerator.sys.platform", "linux")
        platform.start()
        self.addCleanup(platform.stop)

    def test_apple_silicon_auto_probes_mps_without_cuda(self):
        with patch("accelerator.sys.platform", "darwin"), patch("accelerator.platform.machine", return_value="arm64"):
            torch = Mock()
            self.assertEqual(select_device("auto", torch)["device"], "mps")
            torch.ones.assert_called_once_with(1, device="mps")
            torch.mps.synchronize.assert_called_once()
            torch.cuda.is_available.assert_not_called()
            for unavailable in (True, False):
                torch = Mock()
                torch.backends.mps.is_available.return_value = not unavailable
                if not unavailable:
                    torch.mps.synchronize.side_effect = RuntimeError("MPS initialization failed")
                self.assertEqual(select_device("auto", torch)["device"], "cpu")
                with self.assertRaisesRegex(RuntimeError, "无法启用 GPU"):
                    select_device("mps", torch)
            with self.assertRaisesRegex(RuntimeError, "macOS 不支持 CUDA"):
                select_device("cuda", Mock())

    def test_intel_mac_and_rosetta_keep_cpu_and_non_mac_rejects_mps(self):
        with patch("accelerator.sys.platform", "darwin"), patch("accelerator.platform.machine", return_value="x86_64"):
            torch = Mock()
            self.assertEqual(select_device("auto", torch)["device"], "cpu")
            self.assertEqual(torch.mock_calls, [])
            with self.assertRaisesRegex(RuntimeError, "Intel / Rosetta"):
                select_device("mps", torch)
        with self.assertRaisesRegex(RuntimeError, "需要 Apple 芯片 Mac"):
            select_device("mps", Mock())

    def test_cpu_does_not_touch_cuda(self):
        torch = Mock()
        self.assertEqual(select_device("cpu", torch)["device"], "cpu")
        self.assertEqual(torch.mock_calls, [])

    def test_auto_probes_real_kernel_and_reports_gpu(self):
        torch = Mock()
        torch.cuda.get_device_name.return_value = "test GPU"
        self.assertEqual(select_device("auto", torch), {"device": "cuda", "deviceName": "test GPU"})
        torch.ones.assert_called_once_with(1, device="cuda")
        torch.cuda.synchronize.assert_called_once()

    def test_missing_cuda_and_unsupported_kernel_fall_back_only_in_auto(self):
        for failure in ("missing", "kernel"):
            torch = Mock()
            torch.cuda.is_available.return_value = failure != "missing"
            if failure == "kernel":
                torch.ones.side_effect = RuntimeError("no kernel image is available")
            self.assertEqual(select_device("auto", torch)["device"], "cpu")
            with self.assertRaisesRegex(RuntimeError, "无法启用 GPU"):
                select_device("cuda", torch)

    def test_probe_runs_in_separate_process_and_forced_cuda_failure_is_visible(self):
        with patch("server.subprocess.check_output", return_value=json.dumps({"device": "cuda", "deviceName": "GPU"})) as run:
            self.assertEqual(probe_device("auto")["device"], "cuda")
            self.assertIn("accelerator.py", run.call_args.args[0][1])
        with patch("server.subprocess.check_output", side_effect=OSError("unavailable")):
            self.assertEqual(probe_device("auto")["device"], "cpu")
            with self.assertRaisesRegex(RuntimeError, "--device cpu"):
                probe_device("cuda")
        error = subprocess.CalledProcessError(1, [], output=json.dumps({"error": "MPS unavailable"}))
        with patch("server.subprocess.check_output", side_effect=error):
            with self.assertRaisesRegex(RuntimeError, "MPS unavailable.*--device cpu"):
                probe_device("mps")
            self.assertEqual(probe_device("auto")["device"], "cpu")

    def test_cpu_retry_progress_does_not_reuse_failed_gpu_percentage(self):
        with tempfile.TemporaryDirectory() as directory:
            job = dict(id="test", videoId="test", start=0, end=20, state="separating", error=None,
                       started=time.monotonic(), finished=None, directory=Path(directory), device="cpu")
            log = Path(directory) / "worker.log"
            progress = "90%|bar| 18.0/20.0 [00:01<00:02, 1s/seconds]"
            for backend in ("CUDA", "GPU"):
                log.write_text(progress + f"\nEcho: {backend} failed; retrying on CPU.\n")
                self.assertIsNone(Jobs.public(job)["progress"])
                with log.open("a") as output:
                    output.write("10%|bar| 2.0/20.0 [00:01<00:18, 1s/seconds]")
                self.assertEqual(Jobs.public(job)["progress"], 10)

    def test_gpu_retry_respects_errors_cancellation_and_forced_mode(self):
        for device, error, fallback, cancelled, expected in (
            ("cuda", "CUDA out of memory", True, False, "cpu"),
            ("cuda", "CUDA error: device unavailable", True, False, "cpu"),
            ("cuda", "HTTP Error 403", True, False, "error"),
            ("cuda", "CUDA out of memory", False, False, "error"),
            ("cuda", "CUDA out of memory", True, True, "cancelled"),
            ("mps", "RuntimeError: MPS backend out of memory", True, False, "cpu"),
            ("mps", "NotImplementedError: aten::op is not currently implemented for the MPS device", True, False, "cpu"),
            ("mps", "HTTP Error 403", True, False, "error"),
            ("mps", "RuntimeError: MPS backend out of memory", False, False, "error"),
            ("mps", "RuntimeError: MPS backend out of memory", True, True, "cancelled"),
        ):
            with self.subTest(error=error, fallback=fallback, cancelled=cancelled), tempfile.TemporaryDirectory() as directory:
                jobs = Jobs(directory, accelerator={"device": device, "deviceName": "GPU"}, allow_cpu_fallback=fallback)
                job = {"directory": Path(directory), "cancel": threading.Event()}
                calls = []
                def command(job, args, timeout, failure):
                    calls.append(args[args.index("-d") + 1])
                    if len(calls) == 1:
                        (Path(directory) / "worker.log").write_text(error)
                        if cancelled:
                            job["cancel"].set()
                        raise RuntimeError("separation failed")
                with patch.object(jobs, "command", side_effect=command):
                    if expected == "error":
                        with self.assertRaises(RuntimeError):
                            jobs.separate_audio(job)
                    elif expected == "cancelled":
                        with self.assertRaises(Cancelled):
                            jobs.separate_audio(job)
                    else:
                        jobs.separate_audio(job)
                        self.assertEqual(job["device"], "cpu")
                        self.assertIn("CPU", job["deviceNote"])
                self.assertEqual(calls, [device, "cpu"] if expected == "cpu" else [device])

    def test_cpu_failure_after_gpu_fallback_is_not_retried(self):
        with tempfile.TemporaryDirectory() as directory:
            jobs = Jobs(directory, accelerator={"device": "cuda"})
            job = {"directory": Path(directory), "cancel": threading.Event()}
            def fail(*args):
                (Path(directory) / "worker.log").write_text("CUDA out of memory")
                raise RuntimeError("failed")
            with patch.object(jobs, "command", side_effect=fail) as run:
                with self.assertRaises(RuntimeError):
                    jobs.separate_audio(job)
                self.assertEqual(run.call_count, 2)


if __name__ == "__main__":
    unittest.main()
