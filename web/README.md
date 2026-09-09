# Crypto web

Astro frontend for Introductory Cryptography (Rust) and Selected Topics in
Cryptography (C17). See [repository setup](../README.md).

From the repository root, run `bash scripts/setup-emsdk.sh` and
`source .tools/emsdk/emsdk_env.sh`. Then, from this directory:

```bash
npm ci
npm run dev
npm run build
npm run preview
```

`dev` and `build` compile the Elliptic Curve C source to WebAssembly first.
Run `npm run build:wasm` after editing C during development, then reload the
page. `npm run test:c` tests the native/WASM integration.

The new course is at `/stic` (English) and `/es/stic` (Spanish).

Elliptic Curve has independent controls for residues, rational points, curve
generation, point addition and doubling. Big integer parameters stay as decimal
strings; a Web Worker runs the C arithmetic without blocking the interface.
The C dependency restriction does not apply to web frameworks.
