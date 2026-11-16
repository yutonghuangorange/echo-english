import http.client
import errno
import io
import json
import subprocess
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
from contextlib import redirect_stderr
from unittest.mock import patch, Mock
from http.server import ThreadingHTTPServer

from server import Jobs, Cancelled, handler, validate_clip, separation_progress, ACTIVE_STATES, main, process_options, stop_process

CLIP = {"videoId": "jNQXAC9IVRw", "start": 0, "end": 5}


def wait_job(jobs, job_id):
    deadline = time.monotonic() + 3
    while jobs.get(job_id)["state"] in ACTIVE_STATES:
        if time.monotonic() > deadline:
            raise AssertionError("Worker did not finish")
        time.sleep(0.01)
    return jobs.public(jobs.get(job_id))


class Tests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)

    def test_occupied_port_explains_how_to_restart_the_service(self):
        output = io.StringIO()
        with patch.object(sys, "argv", ["server.py", "--cache", self.temp.name]), \
                patch("server.ThreadingHTTPServer", side_effect=OSError(errno.EADDRINUSE, "busy")), \
                redirect_stderr(output):
            self.assertEqual(main(), 1)
        self.assertIn("Ctrl+C", output.getvalue())
        self.assertIn("./start-karaoke.sh", output.getvalue())

    def test_progress_parses_model_work_and_not_weight_downloads(self):
        self.assertEqual(separation_progress("100%|weights| 80.2M/80.2M [00:01<00:00, 61.5MB/s]"), (None, None))
        self.assertEqual(separation_progress("0%|bar| 0.0/171.0 [00:00<?, ?seconds/s]"), (0, None))
        self.assertEqual(separation_progress("20%|bar| 3.0/15.0 [00:12<00:49, 4.14s/seconds]\r40%|bar| 6.0/15.0 [00:16<00:23, 2.60s/seconds]"), (40, 23))
        self.assertEqual(separation_progress("50%|bar| 150.0/300.0 [01:00<1:02:03, 1s/seconds]"), (50, 3723))

    def test_public_status_reports_real_progress_only_in_separation_stage(self):
        release = threading.Event()
        def separate(job):
            job["state"] = "separating"
            (job["directory"] / "worker.log").write_text("40%|bar| 6.0/15.0 [00:16<00:23, 2.60s/seconds]")
            release.wait(2)
            job["audio"].write_bytes(b"audio")
        jobs = Jobs(self.temp.name, separate)
        job = jobs.start(CLIP)
        self.addCleanup(release.set)
        deadline = time.monotonic() + 2
        while jobs.public(jobs.get(job["id"]))["progress"] is None:
            self.assertLess(time.monotonic(), deadline)
            time.sleep(0.01)
        progress = jobs.public(jobs.get(job["id"]))
        self.assertEqual(progress["progress"], 40)
        self.assertEqual(progress["remainingSeconds"], 23)
        self.assertGreaterEqual(progress["elapsedSeconds"], 0)
        release.set()
        ready = wait_job(jobs, job["id"])
        self.assertEqual(ready["progress"], 100)
        self.assertEqual(ready["remainingSeconds"], 0)

    def test_completed_backing_survives_restart_without_running_model_again(self):
        def separate(job):
            job["audio"].write_bytes(b"cached-music")
        first = Jobs(self.temp.name, separate)
        job = first.start(CLIP)
        wait_job(first, job["id"])
        def forbidden(job):
            self.fail("A cache hit must not invoke separation")
        restarted = Jobs(self.temp.name, forbidden)
        self.assertEqual(restarted.start(CLIP)["id"], job["id"])
        self.assertEqual(restarted.get(job["id"])["audio"].read_bytes(), b"cached-music")

    def test_invalid_or_missing_cache_metadata_is_ignored_without_deleting_files(self):
        directory = Path(self.temp.name) / ("a" * 32)
        directory.mkdir()
        (directory / "metadata.json").write_text("[]")
        (directory / "accompaniment.mp3").write_bytes(b"keep-me")
        jobs = Jobs(self.temp.name)
        self.assertEqual(jobs.jobs, {})
        self.assertTrue((directory / "accompaniment.mp3").exists())

    def test_validation_rejects_arbitrary_urls_and_unbounded_clips(self):
        self.assertEqual(validate_clip(CLIP), CLIP)
        self.assertEqual(validate_clip(dict(CLIP, end=180))["end"], 180)
        self.assertEqual(validate_clip(dict(CLIP, end=600))["end"], 600)
        for patch in ({"videoId": "https://evil.test"}, {"start": -1}, {"end": 601}, {"start": True},
                      {"end": float("nan")}, {"end": float("inf")}, {"end": "5"}, {"end": 0}):
            with self.assertRaises(ValueError):
                validate_clip(dict(CLIP, **patch))

    def test_cache_avoids_recomputing_and_keeps_eight_results(self):
        calls = []
        def separate(job):
            calls.append(job["id"])
            job["audio"].write_bytes(b"RIFFtest")
        jobs = Jobs(self.temp.name, separate)
        first = jobs.start(CLIP)
        self.assertEqual(wait_job(jobs, first["id"])["state"], "ready")
        self.assertEqual(jobs.start(CLIP)["id"], first["id"])
        self.assertEqual(len(calls), 1)
        for end in range(6, 14):
            job = jobs.start(dict(CLIP, end=end))
            wait_job(jobs, job["id"])
        self.assertEqual(len(jobs.jobs), 8)
        self.assertFalse((Path(self.temp.name) / first["id"]).exists())

    def test_single_worker_cancellation_and_failure(self):
        def separate(job):
            job["state"] = "separating"
            job["cancel"].wait(2)
            if job["cancel"].is_set():
                raise Cancelled()
        jobs = Jobs(self.temp.name, separate)
        job = jobs.start(CLIP)
        with self.assertRaises(RuntimeError):
            jobs.start(dict(CLIP, start=1))
        jobs.cancel(job["id"])
        self.assertEqual(wait_job(jobs, job["id"])["state"], "cancelled")
        jobs.runner = lambda job: (_ for _ in ()).throw(RuntimeError("model failed"))
        job = jobs.start(CLIP)
        result = wait_job(jobs, job["id"])
        self.assertEqual(result["state"], "error")
        self.assertEqual(result["error"], "model failed")

    def test_cancel_terminates_subprocess(self):
        def separate(job):
            Jobs.command(job, [sys.executable, "-c", "import time;time.sleep(30)"], 40, "failed")
        jobs = Jobs(self.temp.name, separate)
        job = jobs.start(CLIP)
        time.sleep(0.05)
        jobs.cancel(job["id"])
        self.assertEqual(wait_job(jobs, job["id"])["state"], "cancelled")

    def test_windows_process_group_and_tree_termination(self):
        process = Mock(pid=4321)
        process.poll.return_value = None
        with patch("server.sys.platform", "win32"), \
                patch("server.subprocess.CREATE_NEW_PROCESS_GROUP", 512, create=True), \
                patch("server.subprocess.run") as run:
            self.assertEqual(process_options(), {"creationflags": 512})
            stop_process(process)
        run.assert_called_once_with(["taskkill", "/PID", "4321", "/T", "/F"],
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10, check=False)
        process.wait.assert_called_once_with(timeout=5)

    def test_exited_process_needs_no_termination(self):
        process = Mock()
        process.poll.return_value = 0
        with patch("server.subprocess.run") as run:
            stop_process(process)
        run.assert_not_called()

    def test_shutdown_waits_for_worker_cleanup(self):
        started = threading.Event()
        cleaned = threading.Event()
        def separate(job):
            started.set()
            try:
                Jobs.command(job, [sys.executable, "-c", "import time;time.sleep(30)"], 40, "failed")
            finally:
                cleaned.set()
        jobs = Jobs(self.temp.name, separate)
        job = jobs.start(CLIP)
        self.assertTrue(started.wait(2))
        jobs.close()
        self.assertTrue(cleaned.is_set())
        self.assertFalse(jobs.worker.is_alive())
        self.assertEqual(jobs.get(job["id"])["state"], "cancelled")

    def test_http_lifecycle_and_rejection_of_website_requests(self):
        def separate(job):
            job["audio"].write_bytes(b"RIFFtest")
        jobs = Jobs(self.temp.name, separate)
        server = ThreadingHTTPServer(("127.0.0.1", 0), handler(jobs))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        connection = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=2)
        self.addCleanup(connection.close)
        connection.request("POST", "/jobs", json.dumps(CLIP))
        response = connection.getresponse()
        self.assertEqual(response.status, 403)
        self.assertIsNone(response.getheader("Access-Control-Allow-Origin"))
        response.read()
        headers = {"X-Echo-Client": "echo-english"}
        connection.request("GET", "/health", headers=headers)
        response = connection.getresponse()
        self.assertEqual(response.status, 200)
        self.assertEqual(json.loads(response.read())["maxSeconds"], 600)
        connection.request("POST", "/jobs", json.dumps(CLIP), headers)
        response = connection.getresponse()
        self.assertEqual(response.status, 202)
        job = json.loads(response.read())
        wait_job(jobs, job["id"])
        connection.request("GET", f"/jobs/{job['id']}/audio", headers=headers)
        response = connection.getresponse()
        self.assertEqual(response.status, 200)
        self.assertEqual(response.read(), b"RIFFtest")
        connection.request("GET", "/backings/" + CLIP["videoId"], headers=headers)
        response = connection.getresponse()
        self.assertEqual(response.status, 200)
        self.assertEqual(json.loads(response.read())["backings"][0]["id"], job["id"])
        connection.request("POST", "/jobs", '[1]', headers)
        response = connection.getresponse()
        self.assertEqual(response.status, 400)
        response.read()


if __name__ == "__main__":
    unittest.main()
