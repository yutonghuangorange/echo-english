"""Allowlisted, cancellable local model installation. No browser-supplied paths/code."""
import hashlib
from pathlib import Path
import platform
import shutil
import sys
import threading
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import zipfile

DEFAULT_MODEL = "demucs-htdemucs"
BANDIT_MODEL = "bandit-v2-multi"
MODEL_IDS = (DEFAULT_MODEL, BANDIT_MODEL)
BANDIT_COMMIT = "d5563d9031e95fdaa3e5a73d5020b9a0df61adb6"
BANDIT_SHA = "abcfccf65446752a057f4a302c941479a54b7560ebf8d7bca039d2ea98e64cfc"
SOURCE_SHA = "5673b6b7d7482e6cd9606834f081cbc7f59e37d9aeae9e97475069f7a330cdcd"
DEMUCS_SHA = "8726e21a993978c7ba086d3872e7608d7d5bfca646ca4aca459ffda844faa8b4"
INSTALL_STATES = ("installing", "model-downloading", "verifying")


def model_id(value):
    if value not in MODEL_IDS:
        raise ValueError("不支持的分离模型。")
    return value


class InstallCancelled(Exception):
    pass


def check_cancel(job):
    if job["cancel"].is_set():
        raise InstallCancelled()


def digest(path):
    result = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()


class ModelManager:
    def __init__(self, root):
        self.root = Path(root)
        self.cache = self.root / ".cache"
        self.home = self.cache / "models"
        self.home.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.active = None
        self.worker = None
        self.errors = {}
        self.verified = {}

    def weight(self, model):
        model_id(model)
        if model == DEFAULT_MODEL:
            return self.cache / "torch/hub/checkpoints/955717e8-8726e21a.th"
        return self.home / BANDIT_MODEL / "checkpoint.ckpt"

    @property
    def source(self):
        return self.home / BANDIT_MODEL / "source"

    @property
    def deps(self):
        return self.home / "bandit-deps"

    @property
    def dependency_stamp(self):
        spec = (self.root / "karaoke/bandit-requirements.txt").read_bytes()
        return hashlib.sha256(spec + f"{sys.platform}:{sys.version_info[:2]}:{platform.machine()}".encode()).hexdigest()

    def valid(self, path, expected):
        try:
            if path.is_symlink() or not path.is_file():
                return False
            stat = path.stat()
            stamp = (stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns)
            if self.verified.get(path) != (stamp, expected):
                if digest(path) != expected:
                    return False
                self.verified[path] = (stamp, expected)
            return True
        except OSError:
            return False

    def dependencies_ready(self):
        try:
            return ((self.deps / "echo-ready").read_text() == self.dependency_stamp and
                    all((self.deps / name / "__init__.py").is_file() for name in
                        ("pytorch_lightning", "torchmetrics", "librosa", "numba", "scipy", "sklearn")))
        except OSError:
            return False

    def source_ready(self):
        try:
            return ((self.source / "echo-commit").read_text() == BANDIT_COMMIT and
                    all((self.source / name).is_file() for name in
                        ("src/models/bandit/bandit.py", "configs/models/bandit-mus64.yaml")))
        except OSError:
            return False

    def ready(self, model):
        if not self.valid(self.weight(model), DEMUCS_SHA if model == DEFAULT_MODEL else BANDIT_SHA):
            return False
        if model == DEFAULT_MODEL:
            return True
        return self.dependencies_ready() and self.source_ready()

    def catalog(self):
        with self.lock:
            models = []
            for model, name, purpose, size in (
                (DEFAULT_MODEL, "Demucs", "歌曲伴奏，也可提取电影背景音", 84000000),
                (BANDIT_MODEL, "BandIt v2 · 多语言", "电影对白 / 音乐 / 音效分离；不推荐用于歌曲", 446680129)):
                path = self.weight(model)
                job = self.active if self.active and self.active["model"] == model else None
                ready = self.ready(model)
                models.append(dict(id=model, name=name, purpose=purpose, ready=ready,
                    state=job["state"] if job else "ready" if ready else "missing",
                    error=self.errors.get(model), weightBytes=path.stat().st_size if path.is_file() else 0,
                    partialBytes=path.with_suffix(path.suffix + ".part").stat().st_size
                    if path.with_suffix(path.suffix + ".part").is_file() else 0,
                    downloadBytes=size, progress=job.get("progress") if job else None,
                    downloadedBytes=job.get("downloadedBytes", 0) if job else 0,
                    deviceNote="CUDA / CPU；Mac 暂用 CPU" if model == BANDIT_MODEL else "CUDA / Apple MPS / CPU",
                    license="CC BY-SA 4.0（权重）/ Apache 2.0（代码）" if model == BANDIT_MODEL else "MIT"))
            return {"models": models, "busy": self.active is not None,
                    "dependencyBytes": sum(p.stat().st_size for p in self.deps.rglob("*") if p.is_file()),
                    "dependencyReady": self.dependencies_ready()}

    def download(self, job, url, path, expected, max_bytes):
        if self.valid(path, expected):
            return
        path.parent.mkdir(parents=True, exist_ok=True)
        partial = path.with_suffix(path.suffix + ".part")
        offset = partial.stat().st_size if partial.exists() else 0
        if offset and self.valid(partial, expected):
            check_cancel(job)
            partial.replace(path)
            return
        if offset > max_bytes:
            partial.unlink(); offset = 0
        check_cancel(job)
        job.update(state="model-downloading", progress=None, downloadedBytes=offset)
        request = Request(url, headers={"User-Agent": "Echo-model-installer/1", **({"Range": f"bytes={offset}-"} if offset else {})})
        try:
            response = urlopen(request, timeout=10)
        except HTTPError as error:
            if error.code == 416 and offset:
                partial.unlink(missing_ok=True)
                return self.download(job, url, path, expected, max_bytes)
            raise
        with response:
            if offset and response.status != 206:
                offset = 0
            if response.status == 206 and not response.headers.get("Content-Range", "").startswith(f"bytes {offset}-"):
                raise RuntimeError("下载续传响应无效，请重试。")
            total = int(response.headers.get("Content-Length", 0)) + offset
            with partial.open("ab" if offset else "wb") as target:
                while True:
                    check_cancel(job)
                    block = response.read(256 * 1024)
                    if not block:
                        break
                    offset += len(block)
                    if offset > max_bytes:
                        raise RuntimeError("模型下载超过预期大小。")
                    target.write(block)
                    job.update(downloadedBytes=offset, progress=min(99, round(offset / total * 100)) if total else None)
        check_cancel(job)
        job.update(state="verifying", progress=None)
        if digest(partial) != expected:
            partial.unlink(missing_ok=True)
            raise RuntimeError("模型校验失败，请重试下载。")
        partial.replace(path)

    def install_files(self, model, job, command):
        if self.ready(model):
            return
        required = (100 if model == DEFAULT_MODEL else 2048) * 1024**2
        if shutil.disk_usage(self.home).free < required:
            raise RuntimeError("磁盘空间不足：Demucs 建议预留 100 MiB，BandIt 建议预留 2 GiB。")
        if model == DEFAULT_MODEL:
            self.download(job, "https://dl.fbaipublicfiles.com/demucs/hybrid_transformer/955717e8-8726e21a.th",
                          self.weight(model), DEMUCS_SHA, 100 * 1024**2)
            return
        # Reuse the previously verified experiment checkpoint without another download.
        old = self.cache / "cinematic-benchmark/checkpoint-multi.ckpt"
        if not self.weight(model).exists() and self.valid(old, BANDIT_SHA):
            self.weight(model).parent.mkdir(parents=True, exist_ok=True)
            old.replace(self.weight(model))
        self.download(job, "https://zenodo.org/records/12701995/files/checkpoint-multi.ckpt?download=1",
                      self.weight(model), BANDIT_SHA, 450 * 1024**2)
        check_cancel(job)
        if not self.source_ready():
            archive = self.home / "bandit-source.zip"
            self.download(job, f"https://codeload.github.com/kwatcharasupat/bandit-v2/zip/{BANDIT_COMMIT}",
                          archive, SOURCE_SHA, 2 * 1024**2)
            staging = self.source.with_name("source-installing")
            shutil.rmtree(staging, ignore_errors=True)
            staging.mkdir(parents=True)
            with zipfile.ZipFile(archive) as source:
                for info in source.infolist():
                    relative = Path(*Path(info.filename).parts[1:])
                    if relative.is_absolute() or ".." in relative.parts or info.file_size > 2 * 1024**2:
                        raise RuntimeError("模型源码压缩包无效。")
                    if not info.is_dir() and relative.parts:
                        target = staging / relative
                        target.parent.mkdir(parents=True, exist_ok=True)
                        target.write_bytes(source.read(info))
            (staging / "echo-commit").write_text(BANDIT_COMMIT)
            shutil.rmtree(self.source, ignore_errors=True)
            staging.replace(self.source)
        if not self.dependencies_ready():
            job.update(state="installing", progress=None)
            staging = self.deps.with_name("bandit-deps-installing")
            shutil.rmtree(staging, ignore_errors=True)
            try:
                command(job, [sys.executable, "-m", "pip", "install", "--disable-pip-version-check", "--no-input",
                              "--only-binary=:all:", "--no-deps", "--target", str(staging), "-r",
                              str(self.root / "karaoke/bandit-requirements.txt")], 1800, "BandIt 依赖安装失败，请查看安装日志后重试。")
                job["state"] = "verifying"
                command(job, [sys.executable, str(self.root / "karaoke/bandit.py"), "--check",
                              "--deps", str(staging), "--source", str(self.source)], 120, "BandIt 依赖检查失败。")
                (staging / "echo-ready").write_text(self.dependency_stamp)
                shutil.rmtree(self.deps, ignore_errors=True)
                staging.replace(self.deps)
            finally:
                shutil.rmtree(staging, ignore_errors=True)
        check_cancel(job)
        if not self.ready(model):
            raise RuntimeError("模型安装不完整，请重新安装。")

    def ensure(self, model, job, command):
        with self.lock:
            if self.active is not None:
                raise RuntimeError("已有模型任务正在运行。")
            job["model"] = model
            self.active = job
            self.errors.pop(model, None)
        try:
            self.install_files(model, job, command)
        except Exception as error:
            if not job["cancel"].is_set():
                self.errors[model] = str(error)
            raise
        finally:
            with self.lock:
                self.active = None

    def start(self, model, command):
        model_id(model)
        with self.lock:
            if self.active:
                raise RuntimeError("已有模型任务正在运行。")
            directory = self.home / "logs" / model
            directory.mkdir(parents=True, exist_ok=True)
            job = dict(model=model, state="installing", directory=directory, cancel=threading.Event())
            self.active = job
            self.errors.pop(model, None)
            def run():
                try:
                    self.install_files(model, job, command)
                except Exception as error:
                    if not job["cancel"].is_set():
                        self.errors[model] = str(error)
                finally:
                    with self.lock:
                        self.active = None
            self.worker = threading.Thread(target=run)
            self.worker.start()

    def cancel(self, model):
        model_id(model)
        with self.lock:
            if self.active and self.active["model"] == model:
                self.active["cancel"].set()

    def remove(self, model):
        with self.lock:
            if self.active:
                raise RuntimeError("请先完成或停止当前模型任务。")
            path = self.weight(model)
            path.unlink(missing_ok=True)
            path.with_suffix(path.suffix + ".part").unlink(missing_ok=True)
            self.verified.pop(path, None)
            self.errors.pop(model, None)

    def close(self):
        with self.lock:
            if self.active:
                self.active["cancel"].set()
        if self.worker:
            self.worker.join()
