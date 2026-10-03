# Handcrafted BigInt core

Shared C17 unsigned arithmetic for the educational curve practices. No external
arithmetic or cryptographic library is linked. Values have at most 2048 bits;
65 little-endian uint32_t words reserve one additional carry word internally.
This is fixed-capacity arithmetic, not arbitrary-precision signed arithmetic.

## Reuse and contracts

Include `include/bigint.h` and compile `src/bigint.c` with your program. Existing
practice headers forward to this header; their Makefiles compile the shared
source directly. Do not copy and modify a new BigInt implementation per practice.

- State functions use **0 success, nonzero error**. Predicates such as
  `probable_prime` use 1 true and 0 false.
- `big_parse` accepts nonempty decimal digits only, up to 2048 bits. On failure
  its output is zero; partial parsed values are never published.
- `big_add_checked`, `big_sub_checked`, `big_mul_checked` reject unsigned
  overflow/underflow. Their numeric output is zero on failure.
- `big_divmod` requires a nonzero divisor and two distinct nonnull output
  pointers. It returns unsigned quotient and remainder; `a = q*b + r`, `r < b`.
- `big_decimal_checked` takes an explicit buffer capacity, rejects out-of-domain
  values and leaves an empty string on failure when capacity is nonzero.
  Legacy `big_decimal` requires `BIG_DECIMAL` bytes (628). This capacity covers
  all 2080 storage bits, so even an unchecked underflow can be formatted safely.
- `big_from_be`/`big_to_be` import/export fixed-width big-endian bytes. Length
  must be 1..256; export rejects a value that does not fit. Leading zero bytes
  preserve the requested width.
- `field_init` initializes an odd modulus greater than 3. It does not prove
  primality. Failure clears the field; a valid context must not be modified.
- Checked field add/subtract/multiply require canonical operands (`0 <= a,b < p`).
  Checked power accepts a canonical base and any unsigned 2048-bit exponent.
- `field_reduce_checked` reduces an arbitrary unsigned 2048-bit value.
  `field_inverse_checked` uses binary extended GCD and works with odd prime or
  composite moduli when `gcd(a,p)=1`. It reports zero/noninvertible inputs.
- Numeric result pointers may alias Big input variables, since those values
  are passed by value. Results must not point inside a Field context.
- `big_clear` clears the storage with volatile byte writes. It does not erase
  every copy the calling application may have made.

The legacy fast field functions keep their documented input preconditions.
`field_inverse` uses Fermat exponentiation and requires a prime modulus and a
nonzero residue. `big_sub` remains an unchecked nonnegative subtraction for
internal callers. Prefer the checked APIs at boundaries and in new practices.

## Randomness and security

`big_random_with` and `random_below_with` require a caller-supplied byte source:

```c
int entropy(void *context, unsigned char *bytes, size_t length);
```

It must fill exactly `length` bytes and return zero on success. The core masks
unused high bits and uses rejection sampling rather than modulo reduction.
Retries are bounded at 256, so a faulty source cannot cause an infinite loop.
The callback determines whether this is cryptographically secure. Deterministic
callbacks in the tests validate contracts; they are not sources for real keys.

The legacy `big_random`/`random_below`/`probable_prime` retain `rand()` for the toy
practices. The core and the existing scalar algorithms have data-dependent loops
and branches. This work establishes correctness checks and safer interfaces; it
does not make the library constant-time or a replacement for OpenSSL for real
private keys. No secrets are logged by the new checked arithmetic APIs.

## Verification

```sh
make -C c/handcrafted test
make -C c/handcrafted sanitize
```

The deterministic suite compares 12,772 operations with Python integers in native
C and WebAssembly: word boundaries through 2048 bits, carry-heavy moduli, odd
composites, modular arithmetic, inverses, integer overflow, quotient/remainder
and byte round trips. Contract tests cover malformed parsing, cleared outputs,
null pointers, invalid fields, zero divisors, noninvertible residues, aliasing,
short buffers, failed entropy sources and bounded rejection sampling.

The `0-1` to decimal regression is exercised under AddressSanitizer. The sanitizer
suite needs Clang and its ASan/UBSan runtime; the regular build does not.
`make test-c` also reruns the three existing curve practices and OpenSSL tests.
These tests provide evidence within the tested domain, not a proof of all inputs.
