# MAC: HMAC-SHA-256 and CMAC-AES-128 — Lab 07, Section 1

C17 and OpenSSL 3 (`EVP_MAC` API). Each operation runs separately and every
file name comes from the user. The algorithm argument is `hmac` or `cmac`:

```sh
make native
build/mac keygen hmac hmac.key                      # prints the key in Base64
build/mac tag hmac hmac.key document.pdf doc.tag     # prints the tag in Base64
build/mac verify hmac hmac.key document.pdf doc.tag  # Result = valid | invalid
build/mac keygen cmac cmac.key
build/mac tag cmac cmac.key photo.jpg photo.tag
build/mac verify cmac cmac.key photo.jpg photo.tag
make test
```

## Algorithms

| Name | Standard | OpenSSL | Key | Tag |
| --- | --- | --- | --- | --- |
| `hmac` | HMAC-SHA-256, FIPS 198-1 | `EVP_MAC_fetch(NULL, "HMAC", NULL)`, `OSSL_MAC_PARAM_DIGEST = "SHA256"` | 256 bits | 256 bits |
| `cmac` | CMAC-AES-128, NIST SP 800-38B | `EVP_MAC_fetch(NULL, "CMAC", NULL)`, `OSSL_MAC_PARAM_CIPHER = "AES-128-CBC"` | 128 bits | 128 bits |

- Keys: `RAND_bytes` from the OpenSSL DRBG, 32 bytes for HMAC and 16 bytes for
  CMAC, written as one Base64 line.
- Tags: `EVP_MAC_init(context, key, key_length, params)` selects the hash or
  the block cipher, `EVP_MAC_update` processes the file in 64 KiB chunks (any
  size, including empty files) and `EVP_MAC_final` returns the full tag (no
  truncation).
- Verification recomputes the tag with the same key and file, checks that the
  stored tag has the algorithm's length and compares both with
  `CRYPTO_memcmp` (constant time).

## Output

```text
keygen:  Algorithm = HMAC-SHA-256 | KeyBits = 256 | Key = <base64>
tag:     Algorithm | File | Bytes | TagBits | Tag = <base64>
verify:  Algorithm | File | Bytes | Expected | Computed | Result = valid|invalid
```

## Limits and files

- Key and tag files are strict Base64 (canonical padding) of at most 4 KiB;
  line breaks and spaces are ignored. A key must decode to exactly the key
  length of the chosen algorithm, so an HMAC key is rejected by `cmac` and the
  other way around; a tag must decode to exactly the tag length.
- Existing files are never overwritten (`fopen` mode `"wbx"`); partial outputs
  are removed on failure. Keys in memory are cleared with `OPENSSL_cleanse`.
- Exit status: 0 success (`verify`: valid tag), 2 invalid tag, 1 any error.
  Results go to stdout, errors to stderr.

## WebAssembly

`make wasm` builds `web/public/wasm/mac/mac.mjs` with the pinned OpenSSL WASM
library. It exports `_mac_cli(argc, argv)` (same commands as the native CLI;
`argv[0]` is the program name), `_mac_seed(bytes, length)` (at least 48 bytes,
added with `RAND_seed`), `_malloc` and `_free`, plus the runtime methods
`ccall`, `FS`, `HEAPU8`, `HEAPU32`, `stringToUTF8` and `lengthBytesUTF8`. The
worker `web/public/workers/mac.js` runs one command per module instance.

## Tests

- `tests/test_mac.py`: key lengths and output lines; CMAC-AES-128 vectors of
  NIST SP 800-38B, Appendix D.1 (0, 16, 40 and 64 bytes); RFC 4231 cases 1, 2,
  4 and 6 for the HMAC references (their keys are not 256 bits, so the tool
  rejects them); random keys and files (empty, 64 KiB + 1, 3 MiB) compared
  with Python `hmac`, Python `cryptography` CMAC and `openssl mac`; tampered
  file bytes, tampered tags and wrong keys give `invalid` (exit 2); keys of the
  other algorithm, wrong tag lengths, non-canonical Base64, no overwrite and
  argument counts give exit 1.
- `scripts/test-mac.mjs`: native/WASM parity (WASM keygen/tag with native
  verify, native keygen/tag with WASM verify, identical tags for the same key
  and file).
- `make sanitize`: the Python suite over a clang ASan/UBSan build.

References: [FIPS 198-1](https://doi.org/10.6028/NIST.FIPS.198-1),
[NIST SP 800-38B](https://doi.org/10.6028/NIST.SP.800-38B),
[RFC 4231](https://www.rfc-editor.org/rfc/rfc4231).
