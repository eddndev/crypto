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
8. Toy ECDSA
9. ECDSA & ECDH with OpenSSL

Elliptic Curve computes quadratic residues and roots, enumerates rational points,
exports points to a text file, generates curves up to 2048 bits, and adds or
doubles points. Its C17 implementation uses only the standard library, with
big integers implemented manually using arrays.

## Project structure

```text
crypto/
├── Cargo.toml                 Rust workspace
├── crates/                    Rust implementations of the first five practices
├── c/handcrafted/             Shared unsigned 2048-bit arithmetic and contracts
├── c/elliptic-curve/           C17 point arithmetic and tests
├── c/toy-ecdh/                 C17 scalar multiplication and ECDH
├── c/toy_ecdsa/                C17 signing, verification and small discrete logs
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
The standard-curve practice also requires OpenSSL 3 development headers,
`pkg-config`, Perl (including Time::Piece), curl and tar. Its browser build
compiles the pinned OpenSSL 3.5.8 release and verifies its SHA-256 digest.
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

Toy ECDSA is available at `/practices/toy-ecdsa` and `/es/practices/toy-ecdsa`.
It generates keys, signs integers, verifies signatures, simulates Alice/Bob,
and recovers small private scalars with baby-step giant-step. See
[`c/toy_ecdsa/README.md`](c/toy_ecdsa/README.md) for parameters and commands.

Standard ECDSA/ECDH is available at `/practices/standard-ec` and
`/es/practices/standard-ec`. It uses OpenSSL in C17 for file signatures,
P-224/P-256/P-384/P-521, PEM keys, ECDH and HKDF-SHA-256.
See [`c/standard-ec/README.md`](c/standard-ec/README.md).

Pushes to `main` run the C/WebAssembly tests and Astro build in GitHub Actions.
The deploy workflow publishes `web/dist/` to the Cloudflare Pages project
`crypto-web`.
All deployments must go through this GitHub Actions workflow after committing
and pushing the changes. Do not deploy directly from a local terminal or a
hosting API.

## Handcrafted arithmetic

The three educational curve practices share `c/handcrafted/`. BigInt status
functions consistently return zero on success. Checked operations reject
underflow, overflow, zero divisors and noncanonical field operands; parsing
clears its output on failure. The decimal buffer covers the full storage size,
including the carry word. New APIs provide unsigned division, endian conversion,
modular reduction/inversion and caller-provided entropy without external libraries.

`make -C c/handcrafted test` checks 12,772 Python-oracle vectors in native C and
WebAssembly plus invalid-input contracts. `make -C c/handcrafted sanitize` runs
the native checks with Clang AddressSanitizer/UndefinedBehaviorSanitizer.
See [`c/handcrafted/README.md`](c/handcrafted/README.md) for API contracts and
security limits. The toy compatibility functions still use `rand()` and variable
time; the OpenSSL practice is independent.

## Stack

| Layer | Technology |
|-------|------------|
| Algorithms | Rust / C17 |
| WASM bindings | wasm-bindgen / Emscripten |
| Frontend | Astro, React, GSAP, Lenis |
| Hosting | Cloudflare Pages |

## License

MIT
