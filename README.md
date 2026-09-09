# Crypto

Interactive cryptography practices built with Rust and C, compiled to WebAssembly, running entirely in the browser.

The introductory practices implement cryptographic algorithms in Rust. The new Selected Topics in Cryptography section uses C17 and Emscripten. Upload files, transform data, and see results in real time — no servers involved.

```
cargo build                                    # build all crates
wasm-pack build crates/stego --target web      # compile to WASM
cd web && npm run dev                          # start dev server
```

---

## Selected Topics in Cryptography (Cripto 2)

New section: [`STIC/`](STIC/README.md). First practice:
[Elliptic Curve](STIC/01-elliptic-curve/README.md), with native C17 and
WebAssembly builds. Compute quadratic residues and roots, enumerate rational points,
export points to a text file, generate curves up to 2048 bits, and add or double
points. The C implementation uses only its standard library; big integers are
implemented manually with arrays.
The original Rust practices remain in `crates/`.

```bash
bash scripts/setup-emsdk.sh
source .tools/emsdk/emsdk_env.sh
make c
make test-c
cd web
npm ci
npm run dev
```

`npm run dev` and `npm run build` generate the new C module automatically;
Emscripten must be active in the terminal. Rebuild after editing C sources
with `npm run build:wasm`. CI and deployment generate and test this module
before building the site. Generated C binaries and SDK files are ignored.

Routes: `/stic`, `/stic/elliptic-curve`, `/es/stic`, and
`/es/stic/elliptic-curve`.

## Introductory practices

### Steganography

Hide secret messages inside images using least-significant-bit (LSB) encoding. Upload a PNG, embed a message into the pixel data, and extract it back — changes invisible to the naked eye.

```rust
// crates/stego/src/lib.rs
#[wasm_bindgen]
pub fn greet() -> String {
    "Hello from stego!".into()
}
```

More practices coming as the project grows.

---

## How It Works

```
Rust crate (crates/stego/)
    │
    ├─► wasm-pack build --target web
    │       │
    │       └─► pkg/
    │            ├── stego_bg.wasm    WebAssembly binary
    │            ├── stego.js         JS bindings
    │            └── stego.d.ts       TypeScript types
    │
    └─► Astro frontend (web/)
            │
            └─► Imports WASM module
                Runs in the browser
                No server required
```

Rust handles the heavy computation. `wasm-bindgen` generates the JS glue. The Astro frontend imports the WASM module and provides the UI — everything executes client-side.

---

## Project Structure

```
crypto/
├── Cargo.toml              Workspace root
├── crates/
│   └── stego/              Steganography — LSB image encoding
│       ├── Cargo.toml      cdylib + rlib, wasm-bindgen
│       └── src/lib.rs
└── web/                    Astro landing + practice UIs
    ├── src/
    │   ├── components/     Header, Hero, Footer, PracticeCard
    │   ├── layouts/        Base layout
    │   └── pages/          Routes
    └── public/             Static assets
```

---

## Development

### Prerequisites

- [Emscripten](https://emscripten.org/docs/getting_started/downloads.html) 4.0.15, GNU Make, and a C17 compiler (for STIC)
- [Rust](https://rustup.rs/) (stable, for the introductory crates)
- [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/)
- [Node.js](https://nodejs.org/) (v18+)

### Build & Run

```bash
# Build the Rust crate
cargo build

# Compile to WASM
wasm-pack build crates/stego --target web

# Install frontend dependencies
cd web && npm install

# Start dev server
npm run dev
```

### Test

```bash
cargo test --workspace
```

---

## Stack

| Layer | Technology |
|-------|-----------|
| Algorithms | Rust / C17 |
| WASM bindings | wasm-bindgen / Emscripten |
| Frontend | Astro, GSAP, Lenis |
| Hosting | Cloudflare Pages |

---

## License

MIT
