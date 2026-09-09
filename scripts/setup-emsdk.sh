#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
sdk_dir="$repo_dir/.tools/emsdk"
sdk_version="4.0.15"

if [[ ! -d "$sdk_dir/.git" ]]; then
  git clone --depth 1 https://github.com/emscripten-core/emsdk.git "$sdk_dir"
fi
"$sdk_dir/emsdk" install "$sdk_version"
"$sdk_dir/emsdk" activate "$sdk_version"
printf '\nActivate in your terminal: source "%s/emsdk_env.sh"\n' "$sdk_dir"
