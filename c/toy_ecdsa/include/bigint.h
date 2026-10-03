#ifndef BIGINT_H
#define BIGINT_H
#include <stdint.h>

#define BIG_BITS 2048
#define BIG_WORDS (BIG_BITS / 32 + 1)
#define BIG_DECIMAL 620
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
#endif
