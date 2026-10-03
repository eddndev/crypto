#ifndef BIGINT_H
#define BIGINT_H
#include <stddef.h>
#include <stdint.h>

#define BIG_BITS 2048
#define BIG_WORDS (BIG_BITS / 32 + 1)
#define BIG_DECIMAL 628
/* Covers all 65 storage words, including a carry word or an invalid underflow. */
/* Little-endian base-2^32 limbs with one carry word. */
typedef struct {
    uint32_t word[BIG_WORDS];
} Big;
typedef struct {
    Big p;
    Big r2;
    Big one;
    unsigned n;
    uint32_t inverse;
} Field;
Big big_small(uint32_t x);
int big_compare(Big a, Big b);
unsigned big_bits(Big a);
/* Parsing and field initialization return zero on success. */
int big_parse(const char *text, Big *a);
void big_decimal(Big a, char text[BIG_DECIMAL]);
/* Unchecked subtraction requires a >= b; prefer big_sub_checked for external data. */
Big big_sub(Big a, Big b);
Big big_half(Big a);
/* Field operations require an initialized field and operands below p. */
Big field_add(const Field *f, Big a, Big b);
Big field_sub(const Field *f, Big a, Big b);
int field_init(Field *f, Big p);
Big field_mul(const Field *f, Big a, Big b);
Big field_pow(const Field *f, Big a, Big exponent);
/* Requires a prime modulus and a nonzero canonical operand. */
Big field_inverse(const Field *f, Big a);
Big big_random(unsigned bits);
Big random_below(Big limit);
int probable_prime(Big p);
/* Checked API: zero means success. Failed numeric outputs are cleared.
 * Public inputs are unsigned integers of at most BIG_BITS bits.
 * Field contexts must come from field_init; field operations require a,b < p.
 * Output parameters may alias an input variable because inputs are passed by value. */
int big_decimal_checked(Big a, char *text, size_t capacity);
int big_add_checked(Big a, Big b, Big *result);
int big_sub_checked(Big a, Big b, Big *result);
int big_mul_checked(Big a, Big b, Big *result);
int big_divmod(Big a, Big b, Big *quotient, Big *remainder);
int big_from_be(const unsigned char *bytes, size_t length, Big *result);
int big_to_be(Big a, unsigned char *bytes, size_t length);
int field_add_checked(const Field *f, Big a, Big b, Big *result);
int field_sub_checked(const Field *f, Big a, Big b, Big *result);
int field_mul_checked(const Field *f, Big a, Big b, Big *result);
int field_pow_checked(const Field *f, Big a, Big exponent, Big *result);
int field_reduce_checked(const Field *f, Big a, Big *result);
/* Supports invertible residues for any odd modulus, including composite moduli. */
int field_inverse_checked(const Field *f, Big a, Big *result);
/* Entropy callbacks return zero on success and fill exactly length bytes.
 * Security depends on the caller supplying a CSPRNG. No global RNG is installed. */
typedef int (*BigEntropy)(void *context, unsigned char *bytes, size_t length);
void big_clear(Big *a);
int big_random_with(unsigned bits, BigEntropy entropy, void *context, Big *result);
int random_below_with(Big limit, BigEntropy entropy, void *context, Big *result);
#endif
