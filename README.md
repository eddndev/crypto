# Crypto

Interactive cryptography practices built with Rust and C17, compiled to
WebAssembly, and run entirely in the browser.

All practices share one catalog at `/practices` (English) and `/es/practices`
(Spanish):

1. Steganography
2. Affine Cipher
3. Matrix Calculator
4. RSA Hybrid Encryption
5. AES Modes of Operation
6. Elliptic Curve
7. Toy ECDH

Elliptic Curve computes quadratic residues and roots, enumerates rational points,
exports points to a text file, generates curves up to 2048 bits, and adds or
doubles points. Its C17 implementation uses only the standard library, with
big integers implemented manually using arrays.

## Project structure

```text
crypto/
├── Cargo.toml                 Rust workspace
├── crates/                    Rust implementations of the first five practices
├── c/elliptic-curve/           C17 point arithmetic and tests
├── c/toy-ecdh/                 C17 scalar multiplication and ECDH
├── scripts/                   Emscripten setup and native/WASM parity tests
├── web/                       Astro frontend and practice interfaces
│   ├── src/components/        Shared UI and practice workspaces
│   ├── src/pages/practices/   English catalog and practices
│   ├── src/pages/es/practices/ Spanish catalog and practices
│   └── public/                Static assets and legacy URL redirects
└── .github/workflows/         CI and Cloudflare Pages deployment
```

`STIC/` contains local coursework, reports, screenshots and other delivery
materials. It is ignored by Git and is not required to build or deploy the site.
Report capture and result-generation utilities in `scripts/` are also local and
ignored. The public C implementations live in [`c/`](c/).

## Development

Requires GNU Make, a C17 compiler, Python 3, Node.js 22 and Emscripten 4.0.15.
Rust stable is needed to build or test the Rust crates; wasm-pack is needed to
regenerate their WebAssembly packages.

```bash
bash scripts/setup-emsdk.sh
source .tools/emsdk/emsdk_env.sh
export PATH="$(dirname "$EMSDK_NODE"):$PATH"
npm --prefix web ci
make dev
```

`make dev` and `make build` compile the C modules to WebAssembly automatically.
During development, run `make wasm` after editing C sources, then reload the page.
Generated C binaries, WebAssembly output and SDK files are ignored.

```bash
make c       # native C executables
make test-c  # native arithmetic tests and C/WebAssembly parity
make test    # C/WebAssembly tests and Rust workspace tests
make build   # production site in web/dist/
```

The C build and tests use only `c/`, `scripts/` and `web/`; they do
not read reports or screenshots. Local reports can still be compiled separately
with `make -C STIC/01-elliptic-curve report` or
`make -C STIC/02-toy-ecdh report` when those directories are present.

## Routes and deployment

Elliptic Curve is available at `/practices/elliptic-curve` and
`/es/practices/elliptic-curve`. Previous `/stic` catalog and practice URLs redirect
to the corresponding shared routes through `web/public/_redirects`.

Toy ECDH is available at `/practices/toy-ecdh` and `/es/practices/toy-ecdh`.
It compares RTL/LTR iteration traces and computes `A=rG`, `B=sG`, `K_A=rB`
and `K_B=sA`. See [`c/toy-ecdh/README.md`](c/toy-ecdh/README.md) for CLI usage
and the limits of this classroom implementation.

Pushes to `main` run the C/WebAssembly tests and Astro build in GitHub Actions.
The deploy workflow publishes `web/dist/` to the Cloudflare Pages project
`crypto-web`.

## Stack

| Layer | Technology |
|-------|------------|
| Algorithms | Rust / C17 |
| WASM bindings | wasm-bindgen / Emscripten |
| Frontend | Astro, React, GSAP, Lenis |
| Hosting | Cloudflare Pages |

## License

MIT
