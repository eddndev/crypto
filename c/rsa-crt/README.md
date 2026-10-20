# Schoolbook RSA with CRT — Lab 06, Section 1

C17 on the shared Handcrafted BigInt core (`../handcrafted`). Three independent
operations, all numbers in decimal:

```sh
make native
build/rsa-crt keygen 16                              # |p| = |q| = 16 bits
build/rsa-crt encrypt <m> <e> <n>                    # prints c = m^e mod n
build/rsa-crt decrypt <c> <p> <q> <n> <d> <dp> <dq>  # prints cp, cq, mp, mq, q_inv, h, m
make test                                            # native, WASM and both test suites
```

`keygen` prints the public key `(e, n)` and the private key `(p, q, n, d, dp, dq)`.
Results go to stdout and errors to stderr; the exit status is 0 on success and 1
on any error (wrong argument count, non-decimal input, `m` or `c` outside
`(0, n)`, `e` outside `(1, n)`, or an inconsistent private key: `n != p*q`,
`p = q`, `dp != d mod (p-1)` or `dq != d mod (q-1)`).

## Library policy

- OpenSSL 3 is used **only** to generate the primes `p` and `q`
  (`BN_generate_prime_ex`, in `src/primes.c`, the only file that includes
  OpenSSL), because the assignment asks for an existing prime generator instead
  of our own, and the C standard library does not provide one.
- Everything else is implemented by hand on `Big`: random `e`, gcd and extended
  Euclid (`src/euclid.c`), `d`, `dp`, `dq` (`src/keys.c`), Algorithm 1
  (`src/square_multiply.c`), encryption and CRT decryption (`src/rsa.c`).
- `e` is odd, `1 < e < phi(n)`, `gcd(e, phi(n)) = 1`, never 3 or 65537. It is
  sampled by rejection with `random_below_with` and bytes from `/dev/urandom`
  (standard `fopen`/`fread`; Emscripten maps it to `crypto.getRandomValues`).
  Attempts are bounded; if no `e` is found, `p` and `q` are generated again.
- `d = e^-1 mod phi(n)` uses a module-local extended Euclid with sign tracking,
  since `phi(n)` is even and `Field` only accepts odd moduli. The shared core is
  not modified.

## Sizes

`bits` is `|p| = |q|`, from 4 to 1024, so `n` fits in the 2048 bits of `Big`.
Every prime is checked to have exactly `bits` bits and `p != q`.

Without `add`/`rem`, OpenSSL sets the two top bits of the candidate: with 4 bits
it can only return 13 (`1101`), so `p != q` would be impossible. The program
calls `BN_generate_prime_ex(p, bits, 0, add = 2, rem = 1, NULL)`, which sets only
the top bit; with 4 bits it returns 11, 13 or 17, and 17 (5 bits) is rejected and
generated again. This was verified empirically with OpenSSL 3.5.8: 4 bits gives
11 and 13, 5 bits gives 17, 19, 23, 29 and 31. As a result `n` may have
`2*bits - 1` or `2*bits` bits.

## Algorithm 1 correction

The pseudocode sets `r <- x` and then loops from `i = t-1`. That squares the
leading bit `b_(t-1) = 1` a second time and returns `x^(H + 2^(t-1)) mod n`.
The implementation keeps the structure (square every step, multiply when
`b_i = 1`) but loops from `i = t-2` down to 0, and returns 1 for `H = 0`.
Products modulo `n` use the Montgomery `Field` multiplication, so `r^2` never
overflows for 2048-bit moduli; therefore `n` must be odd and greater than 3.

## Decryption with the CRT

With `q_inv = q^-1 mod p` (Garner's form):

```
cp = c mod p           cq = c mod q
mp = cp^dp mod p       mq = cq^dq mod q        (Algorithm 1)
h  = q_inv * (mp - mq) mod p
m  = mq + h*q
```

## Tests

- `tests/test_rsa_crt.py` compares with Python integers: 109 keys from 4 to
  1024 bits (Miller-Rabin in the test only, exact sizes, `p != q`, `n = p*q`,
  `e*d = 1 mod phi`, `e` not 3 or 65537, `dp`, `dq`; 4-bit keys use both 11 and
  13), encryption against `pow(m, e, n)`, Algorithm 1 on arbitrary odd moduli
  up to 2048 bits, every CRT value, round trips and 42 invalid inputs.
- `scripts/test-rsa-crt.mjs` checks native/WASM parity: keys generated in WASM
  are decrypted natively and vice versa, with identical ciphertexts, CRT traces
  and error messages.

WASM output: `web/public/wasm/rsa-crt/rsa-crt.mjs`, exporting `_rsa_crt_cli`
(same argv as the CLI, `argv[0]` is the program name), `_rsa_crt_seed`
(at least 48 bytes for OpenSSL's generator), `_malloc` and `_free`.

The arithmetic is variable-time and the keys are educational (schoolbook RSA
has no padding); do not use them to protect real data.
