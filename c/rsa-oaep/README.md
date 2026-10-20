# RSA-OAEP with CRT + AES-128 — Lab 06, Section 2

C17 and OpenSSL 3 (EVP APIs). Each operation runs separately and every file
name comes from the user:

```sh
make native
build/rsa-oaep keygen alice-private.pem alice-public.pem    # Alice
build/rsa-oaep inspect alice-private.pem                    # CRT components
build/rsa-oaep aes-keygen K.b64                             # Bob: prints K = <base64>
build/rsa-oaep aes-encrypt K.b64 document.pdf document.b64  # Bob
build/rsa-oaep wrap alice-public.pem K.b64 K-wrapped.b64    # Bob: prints C = <base64>
build/rsa-oaep unwrap alice-private.pem K-wrapped.b64 K.b64 # Alice: prints K = <base64>
build/rsa-oaep aes-decrypt K.b64 document.b64 document.pdf  # Alice
make test
```

## Profile

- Key generation: two-prime RSA, `e = 65537`, modulus fixed by
  `#define RSA_OAEP_MODULUS_BITS 3072` and applied by the line
  `EVP_PKEY_CTX_set_rsa_keygen_bits(context, RSA_OAEP_MODULUS_BITS)` in
  `src/keys.c`. 3072 bits gives an estimated 128-bit security strength
  (NIST SP 800-56B Rev. 2, Section 6.3, Table 2).
- Key files: private key as unencrypted PKCS#8 PEM, public key as SPKI PEM, in
  separate files (PEM is the Base64 encoding of the DER structure). The private
  key keeps the CRT format of SP 800-56B Rev. 2, Section 6.2.2:
  `(n, e, d, p, q, dP, dQ, qInv)`; `inspect` prints these values in hex.
- Keys read from files must be plain RSA (not RSA-PSS), with an even modulus of
  2048 to 8192 bits and an odd `65537 <= e < 2^256`. Private keys must have
  exactly two primes of half the modulus length, non-zero `dP`, `dQ`, `qInv`,
  and pass the OpenSSL pairwise check. PKCS#1 private PEM is also accepted.
- Key transport: RSA-OAEP with SHA-256, MGF1-SHA-256 and the empty label. The
  wrapped key must have the modulus length; the recovered K must be 16 bytes.
  With the CRT components present, OpenSSL decrypts with the CRT.
- File encryption: AES-128-GCM with a random 128-bit K (`RAND_bytes`) and a
  random 12-byte IV per file. The output file is the Base64 encoding of
  `IV || ciphertext || tag(16 bytes)`. Any format works, including empty and
  binary files. A modified IV, ciphertext or tag is rejected and no output file
  is created.

## Limits and files

- Input files for `aes-encrypt` are limited to 16 MiB (read into memory);
  PEM files to 16 KiB.
- Base64 inputs must be strict (canonical padding); line breaks and spaces are
  ignored. K files must decode to exactly 16 bytes.
- Existing files are never overwritten (`fopen` mode `"wbx"`); partial outputs
  are removed on failure. Use `umask 077` before generating keys when private
  files must be restricted to the current user.
- Secrets in memory (K, plaintext, PEM text, hex strings) are cleared with
  `OPENSSL_cleanse` or `BN_clear_free`.
- Exit status: 0 success, 1 any error. Results go to stdout, errors to stderr.

## WebAssembly

`make wasm` builds `web/public/wasm/rsa-oaep/rsa-oaep.mjs` with the pinned
OpenSSL WASM library. It exports `_rsa_oaep_cli(argc, argv)` (same commands as
the native CLI; `argv[0]` is the program name), `_rsa_oaep_seed(bytes, length)`
(at least 48 bytes, added with `RAND_seed`), `_malloc` and `_free`, plus the
runtime methods `ccall`, `FS`, `HEAPU8`, `HEAPU32`, `stringToUTF8` and
`lengthBytesUTF8`. Files live in the in-memory Emscripten filesystem.

## Tests

- `tests/test_rsa_oaep.py`: Alice/Bob flow in two directories; `openssl
  pkeyutl` OAEP interoperability in both directions; CRT values compared with
  `openssl pkey -text` (prime1, prime2, exponent1, exponent2, coefficient);
  AES-GCM layout checked with Python `cryptography` when installed; tampering,
  wrong private key, key profiles (1024 bits, RSA-PSS, `e = 3`, three primes,
  EC, no CRT values), K length, no overwrite, the 16 MiB limit and argument
  counts.
- `scripts/test-rsa-oaep.mjs`: native/WASM parity (WASM keys and wrap with
  native unwrap, native wrap with WASM unwrap, AES files in both directions).
- `make sanitize`: the Python suite over a clang ASan/UBSan build.

References: [NIST SP 800-56B Rev. 2](https://doi.org/10.6028/NIST.SP.800-56Br2),
[RFC 8017](https://www.rfc-editor.org/rfc/rfc8017),
[NIST SP 800-38D](https://doi.org/10.6028/NIST.SP.800-38D).
