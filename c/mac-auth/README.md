# ECDH + MAC authentication + AES-128 — Lab 07, Section 2

C17 and OpenSSL 3 (EVP APIs). Each step of the protocol is a separate command
and every file name comes from the user. Only public keys, `r`, `tau` and the
ciphertexts travel between the parties.

Each party runs its commands in its own directory (or on its own computer),
because no command overwrites an existing file. Only the files named in the
comments are copied to the other party.

```sh
make native
# Step 1: each party creates a key pair and sends only the public key.
alice$ build/mac-auth keygen alice-private.pem alice-public.pem
bob$   build/mac-auth keygen bob-private.pem bob-public.pem
alice$ build/mac-auth derive alice-private.pem bob-public.pem K.b64  # prints s and K
bob$   build/mac-auth derive bob-private.pem alice-public.pem K.b64  # same s and K
# Step 2: Alice creates r and sends r.b64 to Bob.
alice$ build/mac-auth challenge r.b64
# Step 3: Bob computes tau = MAC_K(r) and sends tau.b64 to Alice.
bob$   build/mac-auth respond K.b64 r.b64 tau.b64
# Step 4: Alice computes tau' and compares (exit 2 and stop when they differ).
alice$ build/mac-auth check K.b64 r.b64 tau.b64
# Step 5: both derive KE = KDF(tau); each encrypts a file and sends the .b64.
alice$ build/mac-auth session-key tau.b64 KE.b64
bob$   build/mac-auth session-key tau.b64 KE.b64
alice$ build/mac-auth encrypt KE.b64 photo.png photo.b64
bob$   build/mac-auth decrypt KE.b64 photo.b64 photo-from-alice.png
bob$   build/mac-auth encrypt KE.b64 report.pdf report.b64
alice$ build/mac-auth decrypt KE.b64 report.b64 report-from-bob.pdf
make test
```

The `alice$` and `bob$` prefixes only mark who runs each line; `build/mac-auth`
stands for the program path from that party's directory.

For the team of three, the same steps run again between Bob (challenger) and
Carol (responder), with new key pairs and a new directory for each of them.

## Profile

- ECDH: curve P-256 (`prime256v1`) through `EVP_EC_gen` and `EVP_PKEY_derive`.
  `s` is the x coordinate of the shared point (32 bytes). `keygen` prints the
  public point `04 || x || y` (65 bytes) in Base64.
- Key files: private key as unencrypted PKCS#8 PEM, public key as SPKI PEM, in
  separate files. Keys read from files must be EC on P-256 and pass the OpenSSL
  public, private and pairwise checks; other curves (P-384, secp256k1), X25519
  and RSA are rejected. SEC1 private PEM and compressed public points are also
  accepted.
- `K = HKDF-SHA-256(IKM = s, salt = empty, info = "STIC-Lab07-K", L = 32)`
  (RFC 5869, `EVP_KDF` "HKDF").
- `r`: 32 random bytes from `RAND_bytes` (256 bits).
- `tau = HMAC-SHA-256_K(r)` with `EVP_Q_mac`; `check` compares `tau` and
  `tau'` with `CRYPTO_memcmp` (constant time).
- `KE = HKDF-SHA-256(IKM = tau, salt = empty, info = "STIC-Lab07-KE", L = 16)`,
  the AES-128 key.
- File encryption: AES-128-GCM with a random 12-byte IV per file. The output
  file is the Base64 encoding of `IV || ciphertext || tag(16 bytes)`. Any format
  works, including empty and binary files. A modified IV, ciphertext or tag, or
  the wrong KE, is rejected and no output file is created.

## Outputs and exit status

| Command | stdout |
| --- | --- |
| `keygen` | `Curve`, `Public` |
| `derive` | `Curve`, `KDF`, `s`, `K` |
| `challenge` | `r`, `rBits` |
| `respond` | `MAC`, `tau` |
| `check` | `MAC`, `tau`, `tau_prime`, `Result = authenticated` or `Result = rejected` |
| `session-key` | `KDF`, `KE` |
| `encrypt` | `Cipher`, `Bytes`, `IV` |
| `decrypt` | `Cipher`, `Bytes` |

Exit status: 0 success, 1 any error, 2 when `check` finds `tau != tau'` (stderr
says that Alice stops the communication). Results go to stdout, errors to
stderr.

## Limits and files

- Input files for `encrypt` are limited to 16 MiB (read into memory); PEM files
  to 16 KiB.
- Base64 inputs must be strict (canonical padding); line breaks and spaces are
  ignored. `K`, `r` and `tau` must decode to 32 bytes and `KE` to 16 bytes.
- Existing files are never overwritten (`fopen` mode `"wbx"`); partial outputs
  are removed on failure. Use `umask 077` before generating keys when private
  files must be restricted to the current user.
- Secrets in memory (`s`, `K`, `tau`, `KE`, plaintext, PEM text) are cleared with
  `OPENSSL_cleanse`.

## WebAssembly

`make wasm` builds `web/public/wasm/mac-auth/mac-auth.mjs` with the pinned
OpenSSL WASM library. It exports `_mac_auth_cli(argc, argv)` (same commands as
the native CLI; `argv[0]` is the program name), `_mac_auth_seed(bytes, length)`
(at least 48 bytes, added with `RAND_seed`), `_malloc` and `_free`, plus the
runtime methods `ccall`, `FS`, `HEAPU8`, `HEAPU32`, `stringToUTF8` and
`lengthBytesUTF8`. Files live in the in-memory Emscripten filesystem; the page
runs it through `web/public/workers/mac-auth.js`.

## Tests

- `tests/test_mac_auth.py`: Alice/Bob and Bob/Carol flows in separate
  directories; `s` compared with `openssl pkeyutl -derive`; `K`, `tau` and `KE`
  recomputed with Python `hmac`/`hashlib` (HKDF from RFC 5869, checked with its
  test case 3); AES-GCM layout checked with Python `cryptography`; tampered
  `tau`, wrong `K` or `r` (exit 2); tampered ciphertexts, wrong KE, non-P-256
  keys, lengths, no overwrite, the 16 MiB limit, failed stdout writes
  (`/dev/full`, exit 1 and no output file) and argument counts.
- `scripts/test-mac-auth.mjs`: WASM Alice with native Bob and native Bob with
  WASM Carol (same `s`, `K`, `tau`, `KE`; files in both directions), rejection
  with exit 2, tampering and overwrites in WASM.
- `make sanitize`: the Python suite over a clang ASan/UBSan build.

References: [NIST SP 800-56A Rev. 3](https://doi.org/10.6028/NIST.SP.800-56Ar3),
[RFC 5869](https://www.rfc-editor.org/rfc/rfc5869),
[FIPS 198-1](https://doi.org/10.6028/NIST.FIPS.198-1),
[NIST SP 800-38D](https://doi.org/10.6028/NIST.SP.800-38D).
