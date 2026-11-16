#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ ! -x "$project_dir/.venv/bin/python" ]]; then
  echo '尚未安装伴奏环境，请运行：bash start-karaoke.sh' >&2
  exit 1
fi
# Optional portable Node runtime; an installed Node/Deno also works.
if [[ -x "$project_dir/.cache/node/bin/node" ]]; then
  export PATH="$project_dir/.cache/node/bin:$PATH"
fi
exec "$project_dir/.venv/bin/python" "$project_dir/karaoke/server.py" "$@"
