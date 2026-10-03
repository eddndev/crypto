#!/usr/bin/env bash
set -euo pipefail
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
version=3.5.8
sha256=a8f84a39918ec6415ce765d9b429d313ba97b8143169c172e734b9514464f5b2
source_dir="$repo_dir/.tools/openssl-$version"
install_dir="$repo_dir/.tools/openssl-wasm-$version"
archive="$repo_dir/.tools/openssl-download/openssl-$version.tar.gz"
source "$repo_dir/.tools/emsdk/emsdk_env.sh"
build_tag="openssl-$version-getrandom-v1"
if [[ -f "$install_dir/lib/libcrypto.a" && -f "$install_dir/.complete" ]] && [[ "$(cat "$install_dir/.complete")" == "$build_tag" ]]; then
    exit 0
fi
mkdir -p "$(dirname "$archive")" "$install_dir"
if [[ ! -f "$archive" ]]; then
    curl -fL --retry 3 "https://github.com/openssl/openssl/releases/download/openssl-$version/openssl-$version.tar.gz" -o "$archive"
fi
printf '%s  %s\n' "$sha256" "$archive" | sha256sum --check
if [[ ! -d "$source_dir" ]]; then
    tar -xzf "$archive" -C "$repo_dir/.tools"
fi
cd "$source_dir"
perl Configure linux-generic32 CC=emcc AR=emar RANLIB=emranlib --cross-compile-prefix= no-shared no-asm no-threads no-async \
    no-dso no-module no-engine no-tests no-apps no-sock no-ui-console \
    --with-rand-seed=getrandom --prefix="$install_dir" --libdir=lib
# A small parallel limit also works on the GitHub self-hosted runner.
emmake make -j"${OPENSSL_BUILD_JOBS:-4}" build_libs > "$install_dir/build.log" 2>&1
emmake make install_dev >> "$install_dir/build.log" 2>&1
printf '%s\n' "$build_tag" > "$install_dir/.complete"
