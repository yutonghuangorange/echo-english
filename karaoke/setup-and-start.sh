#!/usr/bin/env bash
# Run from any directory: bash /path/to/echo/karaoke/setup-and-start.sh
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
trap 'echo "安装或启动失败。请查看上方错误；修复后重新运行本脚本即可继续。" >&2' ERR
system="$(uname -s)"
case "$system/$(uname -m)" in
  Linux/x86_64) node_platform=linux-x64 ;;
  Darwin/arm64) node_platform=darwin-arm64 ;;
  Darwin/x86_64) node_platform=darwin-x64 ;;
  *) echo '此脚本支持 Linux x86_64、macOS Intel / Apple 芯片；Windows 请使用 start-karaoke.ps1。' >&2; exit 1 ;;
esac
if [[ "${1:-}" == '--help' ]]; then
  echo '用法：bash start-karaoke.sh [--device auto|cpu|cuda] [--cache PATH]'
  echo '首次安装依赖并启动；以后复用环境直接启动。系统依赖安装可能要求 sudo 密码。'
  exit 0
fi
echo 'Echo 伴奏服务：首次安装需要联网和约 1–2 GB 磁盘空间，模型在首次生成时下载。'
echo 'Linux 已验证；macOS 安装路径尚待实机验证。Ctrl+C 可停止，稍后重新运行可继续。'
if [[ "$system" == Darwin ]]; then
  export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
  if command -v brew >/dev/null 2>&1; then
    export PATH="$(brew --prefix)/opt/python@3.12/libexec/bin:$(brew --prefix)/opt/python@3.12/bin:$PATH"
  fi
fi

find_python() {
  local candidate
  for candidate in python3.12 python3.11 python3.10 python3; do
    if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c 'import sys; assert (3,10) <= sys.version_info[:2] <= (3,12)' 2>/dev/null; then
      python_bin="$(command -v "$candidate")";return 0
    fi
  done
  return 1
}
packages=()
if ! find_python; then
  if [[ "$system" == Darwin ]]; then packages+=(python@3.12);else packages+=(python3 python3-venv);fi
fi
if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then packages+=(ffmpeg);fi
if [[ ${#packages[@]} -gt 0 ]]; then
  if [[ "$system" == Darwin ]] && command -v brew >/dev/null 2>&1; then
    brew install "${packages[@]}"
    export PATH="$(brew --prefix)/opt/python@3.12/libexec/bin:$(brew --prefix)/opt/python@3.12/bin:$PATH"
  elif [[ "$system" == Linux ]] && command -v apt-get >/dev/null 2>&1; then
    echo "安装缺少的系统组件：${packages[*]}（可能要求管理员密码）"
    if [[ "$EUID" -eq 0 ]]; then apt-get update;apt-get install -y "${packages[@]}";
    else sudo apt-get update;sudo apt-get install -y "${packages[@]}";fi
  else
    echo '请先安装 Python 3.10–3.12 和 FFmpeg（macOS 可先安装 Homebrew），再运行本脚本。' >&2;exit 1
  fi
fi
if ! find_python; then echo '未找到 Python 3.10–3.12；请安装兼容版本后重试。' >&2;exit 1;fi

if [[ ! -x "$project_dir/.venv/bin/python" ]]; then
  if [[ -e "$project_dir/.venv/pyvenv.cfg" ]]; then
    echo '现有 .venv 不适用于本机。请重命名该目录后重试；不要跨系统复制 Python 环境。' >&2;exit 1
  fi
  echo '创建项目独立 Python 环境…'
  if ! "$python_bin" -m venv "$project_dir/.venv"; then
    # Ubuntu may have Python but no ensurepip; system pip can bootstrap the venv.
    if "$python_bin" -m pip --help >/dev/null 2>&1; then
      "$python_bin" -m venv --without-pip "$project_dir/.venv"
      "$python_bin" -m pip --python "$project_dir/.venv/bin/python" install pip
    elif [[ "$system" == Linux ]] && command -v apt-get >/dev/null 2>&1; then
      venv_package="$("$python_bin" -c 'import sys; print("python%d.%d-venv" % sys.version_info[:2])')"
      if [[ "$EUID" -eq 0 ]]; then apt-get update;apt-get install -y "$venv_package";
      else sudo apt-get update;sudo apt-get install -y "$venv_package";fi
      "$python_bin" -m venv "$project_dir/.venv"
    else
      echo '请为所选 Python 安装 venv / pip 后重试；详见 karaoke/README.md。' >&2;exit 1
    fi
  fi
fi
venv_python="$project_dir/.venv/bin/python"
"$venv_python" -c 'import sys; assert (3,10) <= sys.version_info[:2] <= (3,12), "现有 .venv 需要 Python 3.10–3.12"'
if [[ -x "$project_dir/.cache/node/bin/node" ]]; then export PATH="$project_dir/.cache/node/bin:$PATH";fi
if ! { command -v node >/dev/null 2>&1 && node -e 'process.exit(Number(process.versions.node.split(".")[0])>=22?0:1)' 2>/dev/null; } && ! command -v deno >/dev/null 2>&1; then
  echo '下载项目专用 Node.js 22（不修改系统 Node）…'
  "$venv_python" - "$project_dir" "$node_platform" <<'PY'
import hashlib, pathlib, shutil, sys, tarfile, tempfile, urllib.request
root, platform = pathlib.Path(sys.argv[1]), sys.argv[2]
base = 'https://nodejs.org/dist/latest-v22.x/'
checksums = urllib.request.urlopen(base + 'SHASUMS256.txt', timeout=60).read().decode()
digest, filename = next(line.split() for line in checksums.splitlines() if line.endswith('-' + platform + '.tar.gz'))
cache = root / '.cache'
cache.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory(dir=cache) as temporary:
    archive = pathlib.Path(temporary) / filename
    with urllib.request.urlopen(base + filename, timeout=120) as response, archive.open('wb') as output:
        shutil.copyfileobj(response, output)
    if hashlib.sha256(archive.read_bytes()).hexdigest() != digest:
        raise RuntimeError('Node.js 下载校验失败，请重试')
    with tarfile.open(archive) as bundle:
        bundle.extractall(temporary, filter='data')
    destination = cache / 'node'
    if destination.exists():
        shutil.rmtree(destination)
    shutil.move(str(pathlib.Path(temporary) / filename.removesuffix('.tar.gz')), destination)
PY
  export PATH="$project_dir/.cache/node/bin:$PATH"
fi
# The marker includes exact requirements; interrupted installs never count as ready.
marker="$project_dir/.venv/.echo-requirements"
if ! cmp -s "$project_dir/karaoke/requirements.txt" "$marker" || ! "$venv_python" -c 'import torch, torchaudio, soundfile, demucs, yt_dlp' >/dev/null 2>&1; then
  echo '安装伴奏依赖，下载较大，请稍候…'
  if ! "$venv_python" -m pip --version >/dev/null 2>&1; then
    echo '修复未完成安装的 pip 环境…'
    if ! "$venv_python" -m ensurepip --upgrade; then
      "$python_bin" -m pip --python "$venv_python" install pip
    fi
  fi
  "$venv_python" -m pip install --upgrade pip
  # Preserve a compatible CUDA installation when other requirements change.
  torch_variant="$("$venv_python" -c 'import torch,torchaudio; print("cuda" if torch.__version__.split("+")[0] == torchaudio.__version__.split("+")[0] == "2.5.1" and torch.version.cuda else "cpu")' 2>/dev/null || true)"
  if [[ "$system" == Linux && "$torch_variant" != cuda ]]; then
    "$venv_python" -m pip install --index-url https://download.pytorch.org/whl/cpu torch==2.5.1 torchaudio==2.5.1
  fi
  "$venv_python" -m pip install -r "$project_dir/karaoke/requirements.txt"
  "$venv_python" -m pip check
  cp "$project_dir/karaoke/requirements.txt" "$marker"
fi
echo '准备完成。正在启动伴奏服务，请保持此终端开启；Ctrl+C 停止。'
exec bash "$project_dir/karaoke/start.sh" "$@"
