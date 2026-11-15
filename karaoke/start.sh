#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ ! -x "$project_dir/.venv/bin/python" ]]; then
  echo '请先按 karaoke/README.md 安装本机伴奏依赖。' >&2
  exit 1
fi
# Optional portable Node runtime; an installed Node/Deno also works.
if [[ -x "$project_dir/.cache/node/bin/node" ]]; then
  export PATH="$project_dir/.cache/node/bin:$PATH"
fi
exec "$project_dir/.venv/bin/python" "$project_dir/karaoke/server.py" "$@"
