import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import Mock, patch

from accelerator import select_device
from server import Jobs, Cancelled, probe_device


class AcceleratorTests(unittest.TestCase):
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

    def test_gpu_retry_respects_errors_cancellation_and_forced_mode(self):
        for error, fallback, cancelled, expected in (
            ("CUDA out of memory", True, False, "cpu"),
            ("CUDA error: device unavailable", True, False, "cpu"),
            ("HTTP Error 403", True, False, "error"),
            ("CUDA out of memory", False, False, "error"),
            ("CUDA out of memory", True, True, "cancelled"),
        ):
            with self.subTest(error=error, fallback=fallback, cancelled=cancelled), tempfile.TemporaryDirectory() as directory:
                jobs = Jobs(directory, accelerator={"device": "cuda", "deviceName": "GPU"}, allow_cpu_fallback=fallback)
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
                self.assertEqual(calls, ["cuda", "cpu"] if expected == "cpu" else ["cuda"])

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
