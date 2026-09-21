# Elliptic Curve

C17 implementation for the Elliptic Curve practice. Uses only the C standard
library. Big integer arithmetic is implemented with arrays; no GMP, OpenSSL or
compiler-specific integer types are required.

From the repository root:

```bash
make c
make wasm
make test-c
```

`src/` and `include/` contain the native and WebAssembly implementation.
`tests/` compares results against independent Python arithmetic and exhaustive
point enumeration. `tests/fixtures/prime-2048.txt` holds the fixed 2048-bit input
used for the large-coordinate regression check. No report assets are required.
`../../scripts/test-elliptic-curve.mjs` compares native and WebAssembly results.

Use `x1`, `y1`, `x2`, `y2`, `x3`, `y3` for point coordinates. Keep the C source
and WebAssembly build in sync by running `make test-c` after source changes.
Generated output is stored in `build/` and `../../web/public/wasm/elliptic-curve/`.
