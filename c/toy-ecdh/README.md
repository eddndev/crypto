# Toy ECDH

Portable ISO C17 scalar multiplication and a classroom ECDH exchange. The C
implementation uses only the standard library: fixed arrays of 32-bit words,
64-bit partial products and handwritten Montgomery arithmetic. No cryptographic
or arbitrary-precision library is used.

The field arithmetic and point formulas reuse the Elliptic Curve practice.
This module keeps a self-contained copy, formatted to the C17 style guide and
adapted to zero-for-success status returns. `src/toy_ecdh.c` contains the new
RTL and LTR algorithms; `src/cli.c` handles input and output separately.

## Build and test

From the repository root:

```sh
make c
make wasm
make test-c
```

For this module alone, `make native` builds `build/toy-ecdh`. `make test` runs
the independent Python oracle and the native/WebAssembly parity tests. Python
is only a test dependency. Emscripten and Node are required for WebAssembly.
`EMCC` and `WASM_DIR` can be overridden for other installations.

## Notation

- `p`, `a`, `b`: field prime and curve coefficients.
- `G`: common base point.
- `r`: Alice's secret; `s`: Bob's secret.
- `A = rG`, `B = sG`: public points.
- `K_A = rB`, `K_B = sA`: shared points, expected to equal `K = (rs)G`.
- `kP`: generic scalar multiplication; `Q`: accumulator.

Finite points use `(x1,y1,1)`, and infinity is exactly `(0,1,0)`. These are
normalized projective representatives; point operations use affine formulas
with modular inverses. Arbitrary non-unit projective z values are not accepted.

## Commands

All numbers are nonnegative decimal strings of at most 2048 bits.

```sh
# Every iteration, including the final RTL doubling.
./build/toy-ecdh multiply rtl 17 2 2 13 5 1 1 trace
./build/toy-ecdh multiply ltr 17 2 2 13 5 1 1 trace

# Local deterministic example: p a b x1 y1 z1 r s.
./build/toy-ecdh demo 127 1 7 1 3 1 13 29

# On Alice's computer: generates r and A; send only A.
./build/toy-ecdh keygen alice rtl 127 1 7 1 3 1
# On Bob's computer: generates s and B; send only B.
./build/toy-ecdh keygen bob ltr 127 1 7 1 3 1

# Fixed example after receiving the other public point.
./build/toy-ecdh public alice rtl 127 1 7 13 1 3 1
./build/toy-ecdh public bob ltr 127 1 7 29 1 3 1
./build/toy-ecdh shared alice rtl 127 1 7 13 124 55 1
./build/toy-ecdh shared bob ltr 127 1 7 29 64 77 1
```

The example produces `A=(64,77,1)`, `B=(124,55,1)` and
`K_A=K_B=(120,61,1)`. It is a local simulation, not evidence of a real partner
session. `keygen` accepts an optional final seed for reproducibility within the
same C runtime. Different C libraries need not implement the same `rand()`.

## Validation and scope

The CLI checks a nonsingular curve, canonical coordinates, point membership,
and probable primality (trial division plus 32 Miller–Rabin rounds). Generic
scalar multiplication accepts zero and infinity. ECDH requires at least 7-bit
`p`, `0 < r,s < p`, and finite input/output points; regenerate a secret if it
produces infinity. The scalar range is a toy convention, not a subgroup-order
claim. The 7-bit example has 109 points and its nonzero G generates that group.

Five small examples include ten complete traces. Tests additionally exercise
word boundaries, a 2048-bit scalar, infinity, malformed input, and full exchanges
over 128/256/512/1024-bit fields with equally wide secrets. Large fixtures certify
neither group order nor suitability for real cryptography.

`rand()` is not a cryptographic generator. This exercise has no authentication,
KDF, subgroup-order validation or constant-time guarantee. The output is a point,
not an encryption-ready key. The browser worker runs the same C code locally;
its integers cross the JavaScript boundary as strings.
