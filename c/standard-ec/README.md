# Standard ECDSA and ECDH — OpenSSL

C17 application for Lab 04. OpenSSL 3 provides the cryptographic operations;
this practice does not use the educational Handcrafted arithmetic.

## Build and run

Install a C compiler, Make, pkg-config and OpenSSL 3 development headers
(`libssl-dev` on Debian/Ubuntu, `openssl-devel` on Fedora). Then:

```sh
make -C c/standard-ec native
c/standard-ec/build/standard-ec parameters P-256
c/standard-ec/build/standard-ec keygen P-256 private.pem public.pem
c/standard-ec/build/standard-ec sign private.pem message.bin signature.txt
c/standard-ec/build/standard-ec verify public.pem message.bin signature.txt
c/standard-ec/build/standard-ec ecdh P-256 alice-public.pem bob-public.pem
```

Supported curves: P-224, P-256, P-384 and P-521. Signature hashes are SHA-224,
SHA-256, SHA-384 and SHA-512 respectively. Each invocation performs one operation.
Filenames may contain spaces when passed as quoted native CLI arguments.
Existing output files are never overwritten.

Private files contain unencrypted PKCS#8 PEM; public files contain SPKI PEM.
Their DER contents are encoded in Base64. Signature files contain exactly two
hexadecimal integers (`r = ...` and `s = ...`). Exit status is 0 for success or a
valid signature, 2 for an invalid signature, and 1 for input/runtime errors.

ECDH saves the two public keys and prints their SEC1 points in Base64, the full
shared points K_A/K_B, the fixed-width ECDH x-coordinates Z_A/Z_B, the public
32-byte salt, and the two 32-byte HKDF-SHA-256 outputs. HKDF input is Z, with
info `STIC-Lab04-ECDH-v1`. A 256-bit output does not increase the security
strength beyond the chosen curve. Displaying secrets is part of this lab
simulation; it does not implement peer authentication or a full network protocol.

To derive with independently stored keys:

```sh
c/standard-ec/build/standard-ec derive private.pem peer-public.pem
# Reuse the other party's 32-byte binary salt:
c/standard-ec/build/standard-ec derive private.pem peer-public.pem salt.bin
```

## Browser and verification

`make -C c/standard-ec wasm` compiles OpenSSL 3.5.8 from its official release
and checks the pinned SHA-256 digest. The build requires Perl with Time::Piece.
Emscripten's `getentropy` connects OpenSSL's seed source to browser Web Crypto
(or the Node.js CSPRNG during tests). The browser adapter also adds 48 fresh
Web Crypto bytes; it does not use a 32-bit seed or `rand()`.

The web interface accepts file selection and drag-and-drop, displays selected
filenames and sizes, and lets users download generated keys, signatures and
text results. Generated keys can be reused for signing, and a new signature can
be reused for verification without downloading and importing it first.
“ECDH with files” runs the existing `derive` command with a private PEM and a
peer public PEM; it displays K, Z and a 256-bit HKDF-SHA-256 key. Without a salt
file, it generates a random 32-byte salt. The other party must load that same binary salt file to
derive the same key. The web interface exports `salt.bin` and `key.bin`; the salt
is public, while the key is secret. The HKDF context is `STIC-Lab04-ECDH-v1`.

Files are processed inside a dedicated browser worker and a virtual filesystem.
No keys or messages are uploaded. The browser caps messages at 16 MiB; native
signing/verification streams the file in 8192-byte blocks. Filenames chosen in
the interface control downloads; internal virtual filenames remain fixed.

`make -C c/standard-ec test` checks all curves, malformed inputs, non-overwriting
outputs, empty/binary/modified messages, native OpenSSL CLI interoperability,
native/WASM signatures in both directions and an independent Python/Node HKDF.
Using the standard parameters and APIs does not certify this program or its
browser build as a FIPS-validated cryptographic module.

OpenSSL is licensed under Apache-2.0. The WASM library is generated under
`.tools/` and not committed. Official source: https://www.openssl-library.org/source/
