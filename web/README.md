# Crypto web

Astro frontend for the cryptography practices in Rust and C17.
See [repository setup](../README.md).

From the repository root, run `bash scripts/setup-emsdk.sh` and
`source .tools/emsdk/emsdk_env.sh`. Then, from this directory:

```bash
npm ci
npm run dev
npm run build
npm run preview
```

`dev` and `build` compile the Elliptic Curve C source from `c/elliptic-curve/`
to WebAssembly first. Run `npm run build:wasm` after editing C during development,
then reload the page. `npm run test:c` tests the native/WASM integration.

All six practices are listed at `/practices` (English) and `/es/practices`
(Spanish). Elliptic Curve uses `/practices/elliptic-curve` and
`/es/practices/elliptic-curve`; the previous `/stic` URLs redirect on Cloudflare
Pages using `public/_redirects`.

Elliptic Curve has independent controls for residues, rational points, curve
generation, point addition and doubling. Big integer parameters stay as decimal
strings; a Web Worker runs the C arithmetic without blocking the interface.
Local coursework in `STIC/` is not part of the frontend or its build.
