#include "rsa_crt.h"

/* Bit i de H en representacion binaria (b_i). */
static int bit(Big H, unsigned i) {
    return (H.word[i / 32] >> (i % 32)) & 1u;
}

/* Algoritmo 1: Square and Multiply(x, H, n) = x^H mod n.
 * Los productos mod n usan la multiplicacion de Field (Montgomery), que no
 * desborda aunque n tenga 2048 bits; por eso n debe ser impar y mayor que 3. */
int square_and_multiply(Big x, Big H, Big n, Big *result) {
    if (!result) return 1;
    *result = big_small(0);
    Field field;
    if (field_init(&field, n) || big_compare(x, n) >= 0) return 1;

    /* H = 0: x^0 = 1. */
    unsigned t = big_bits(H);
    if (t == 0) {
        *result = big_small(1);
        return 0;
    }

    Big r = x;
    /* Correccion al pseudocodigo: r <- x ya cubre el bit b_(t-1) = 1, asi que
     * el ciclo empieza en i = t-2 (con i = t-1 se calcularia x^(H + 2^t)). */
    for (int i = (int)t - 2; i >= 0; --i) {
        /* r <- r^2 mod n */
        if (field_mul_checked(&field, r, r, &r)) return 1;
        /* si b_i = 1 entonces r <- r*x mod n */
        if (bit(H, (unsigned)i) && field_mul_checked(&field, r, x, &r)) return 1;
    }
    *result = r;
    return 0;
}
