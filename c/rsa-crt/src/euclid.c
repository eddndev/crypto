#include "internal.h"

/* Algoritmo de Euclides: gcd(a, b) = gcd(b, a mod b) hasta que b = 0. */
int big_gcd(Big a, Big b, Big *gcd) {
    if (!gcd) return 1;
    *gcd = big_small(0);
    while (big_bits(b)) {
        Big quotient;
        Big remainder;
        if (big_divmod(a, b, &quotient, &remainder)) return 1;
        a = b;
        b = remainder;
    }
    *gcd = a;
    return 0;
}

/* Euclides extendido para a^-1 mod modulus. No usamos field_inverse_checked
 * porque phi(n) es par y Field solo acepta modulos impares.
 * Solo guardamos el coeficiente t de a: modulus*s + a*t = r. Los signos de t
 * se alternan (0, 1, -q1, ...), asi que basta guardar |t| y sumar:
 * |t_nuevo| = |t_anterior| + q * |t|. Ademas |t| <= modulus, no hay desborde. */
int inverse_mod(Big a, Big modulus, Big *inverse) {
    if (!inverse) return 1;
    *inverse = big_small(0);
    if (big_compare(modulus, big_small(1)) <= 0) return 1;

    Big old_r = modulus;
    Big r;
    Big quotient;
    if (big_divmod(a, modulus, &quotient, &r)) return 1;
    Big old_t = big_small(0);
    Big t = big_small(1);
    /* old_t pasa por t0 = 0, t1 = 1 (positivo), t2 < 0, ...; el primer paso deja 0. */
    int negative = 1;

    while (big_bits(r)) {
        Big remainder;
        if (big_divmod(old_r, r, &quotient, &remainder)) return 1;
        Big next_t;
        if (big_mul_checked(quotient, t, &next_t)) return 1;
        if (big_add_checked(next_t, old_t, &next_t)) return 1;
        old_r = r;
        r = remainder;
        old_t = t;
        t = next_t;
        /* Cada paso alterna el signo del coeficiente que queda en old_t. */
        negative = !negative;
    }

    /* Solo hay inverso si gcd(a, modulus) = 1. */
    if (big_compare(old_r, big_small(1)) != 0) return 1;
    /* Si old_t es negativo, su representante en [0, modulus) es modulus - |old_t|. */
    if (negative && big_bits(old_t)) {
        if (big_sub_checked(modulus, old_t, inverse)) return 1;
    } else {
        Big unused;
        if (big_divmod(old_t, modulus, &unused, inverse)) return 1;
    }
    return 0;
}
