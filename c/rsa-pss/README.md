# RSA-PSS — Lab 05

C17 and OpenSSL 3. Independent operations:

```sh
make native
build/rsa-pss keygen 3072 private.pem public.pem
build/rsa-pss sign private.pem message.bin signature.b64
build/rsa-pss verify public.pem message.bin signature.b64
make test
```

Supported modulus sizes: 2048, 3072, 4096 bits; two primes; generated exponent
65537. SHA-256, MGF1-SHA-256, salt length 32 bytes for signing and verification.
Keys: unencrypted PKCS#8 PEM and SPKI PEM (Base64-encoded DER). Signatures: raw
signature bytes encoded in Base64. Use `umask 077` before native key generation
when private files must be restricted to the current user. Existing files are
never overwritten. CLI status: 0 success/valid, 2 invalid, 1 input/runtime error.

Private-key checks cover the FIPS 186-5 Appendix A.1.1 size/bounds profile and
OpenSSL pairwise consistency. This application does not claim FIPS module
certification. The browser build reuses the repository's pinned OpenSSL WASM
setup, with Emscripten getentropy and an additional 48-byte Web Crypto seed.
The same C functions run in a dedicated browser worker with an in-memory
filesystem. No message or key upload is performed.

`make test` checks the native CLI against OpenSSL and WASM in both directions,
including all sizes, empty/binary/altered messages, incorrect profiles,
malformed signatures and preservation of existing files. The Spanish and
English pages are `/es/practices/rsa-pss` and `/practices/rsa-pss`.

References: [RFC 8017](https://www.rfc-editor.org/rfc/rfc8017),
[FIPS 186-5](https://doi.org/10.6028/NIST.FIPS.186-5).
