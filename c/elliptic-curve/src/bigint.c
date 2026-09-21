#include "bigint.h"
#include <stdlib.h>
#include <string.h>

Big big_small(uint32_t x) {
    Big a = {{0}};
    a.word[0] = x;
    return a;
}

int big_compare(Big a, Big b) {
    for (int i = BIG_WORDS - 1; i >= 0; --i)
        if (a.word[i] != b.word[i]) return a.word[i] > b.word[i] ? 1 : -1;
    return 0;
}

unsigned big_bits(Big a) {
    for (int i = BIG_WORDS - 1; i >= 0; --i) {
        uint32_t w = a.word[i];
        if (w) {
            unsigned bits = 0;
            while (w) { ++bits; w >>= 1; }
            return (unsigned)i * 32 + bits;
        }
    }
    return 0;
}

/* Convertimos el decimal multiplicando el arreglo por 10 en cada paso. */
int big_parse(const char *text, Big *a) {
    *a = big_small(0);
    if (!text || !*text) return 0;
    for (; *text; ++text) {
        if (*text < '0' || *text > '9') return 0;
        uint64_t carry = (unsigned)(*text - '0');
        for (unsigned i = 0; i < BIG_WORDS; ++i) {
            carry += (uint64_t)a->word[i] * 10;
            a->word[i] = (uint32_t)carry;
            carry >>= 32;
        }
        if (carry || big_bits(*a) > BIG_BITS) return 0;
    }
    return 1;
}

void big_decimal(Big a, char text[BIG_DECIMAL]) {
    unsigned length = 0;
    do {
        uint64_t remainder = 0;
        for (int i = BIG_WORDS - 1; i >= 0; --i) {
            uint64_t value = (remainder << 32) | a.word[i];
            a.word[i] = (uint32_t)(value / 10);
            remainder = value % 10;
        }
        text[length++] = (char)('0' + remainder);
    } while (big_bits(a));
    text[length] = '\0';
    for (unsigned i = 0; i < length / 2; ++i) {
        char tmp = text[i]; text[i] = text[length-1-i]; text[length-1-i] = tmp;
    }
}

/* Resta con prestamos; se usa cuando a >= b. */
Big big_sub(Big a, Big b) {
    uint64_t borrow = 0;
    for (unsigned i = 0; i < BIG_WORDS; ++i) {
        uint64_t value = (uint64_t)b.word[i] + borrow;
        borrow = a.word[i] < value;
        a.word[i] = (uint32_t)((uint64_t)a.word[i] - value);
    }
    return a;
}

Big big_half(Big a) {
    uint32_t carry = 0;
    for (int i = BIG_WORDS - 1; i >= 0; --i) {
        uint32_t next = a.word[i] & 1;
        a.word[i] = (a.word[i] >> 1) | (carry << 31);
        carry = next;
    }
    return a;
}

/* Los operandos del campo siempre estan entre 0 y p-1. */
Big field_add(const Field *f, Big a, Big b) {
    uint64_t carry = 0;
    for (unsigned i = 0; i < BIG_WORDS; ++i) {
        carry += (uint64_t)a.word[i] + b.word[i];
        a.word[i] = (uint32_t)carry;
        carry >>= 32;
    }
    return big_compare(a, f->p) >= 0 ? big_sub(a, f->p) : a;
}

Big field_sub(const Field *f, Big a, Big b) {
    return big_compare(a, b) >= 0 ? big_sub(a, b) : big_sub(f->p, big_sub(b, a));
}

/* Multiplicacion de Montgomery: devuelve a*b/R modulo p, R=2^(32*n).
 * Primero multiplicamos como en papel. Luego cancelamos las celdas bajas.
 * Cada producto de dos celdas y sus acarreos cabe en uint64_t. */
static Big montgomery(const Field *f, Big a, Big b) {
    uint32_t t[2 * BIG_WORDS + 1] = {0};
    unsigned n = f->n;
    for (unsigned i = 0; i < n; ++i) {
        uint64_t carry = 0;
        for (unsigned j = 0; j < n; ++j) {
            uint64_t v = (uint64_t)a.word[i]*b.word[j] + t[i+j] + carry;
            t[i+j] = (uint32_t)v;
            carry = v >> 32;
        }
        t[i+n] = (uint32_t)carry;
    }
    for (unsigned i = 0; i < n; ++i) {
        uint32_t m = t[i] * f->inverse;
        uint64_t carry = 0;
        for (unsigned j = 0; j < n; ++j) {
            uint64_t v = (uint64_t)m*f->p.word[j] + t[i+j] + carry;
            t[i+j] = (uint32_t)v;
            carry = v >> 32;
        }
        unsigned k = i+n;
        while (carry) {
            carry += t[k]; t[k++] = (uint32_t)carry; carry >>= 32;
        }
    }
    Big result = {{0}};
    for (unsigned i = 0; i <= n; ++i) result.word[i] = t[i+n];
    return big_compare(result, f->p) >= 0 ? big_sub(result, f->p) : result;
}

int field_init(Field *f, Big p) {
    if (big_compare(p, big_small(3)) <= 0 || !(p.word[0]&1) || big_bits(p)>BIG_BITS)
        return 0;
    f->p = p; f->n = (big_bits(p)+31)/32;
    /* Newton encuentra p[0]^-1 modulo 2^32; necesitamos su negativo. */
    uint32_t inverse = 1;
    for (unsigned i = 0; i < 5; ++i) inverse *= 2u - p.word[0]*inverse;
    f->inverse = 0u - inverse;
    f->r2 = big_small(1);
    for (unsigned i = 0; i < 64*f->n; ++i) f->r2 = field_add(f, f->r2, f->r2);
    f->one = montgomery(f, big_small(1), f->r2);
    return 1;
}

Big field_mul(const Field *f, Big a, Big b) {
    return montgomery(f, montgomery(f, a, f->r2), b);
}

/* Cuadrados y multiplicaciones; mantenemos los valores en Montgomery. */
Big field_pow(const Field *f, Big a, Big exponent) {
    Big result = f->one;
    a = montgomery(f, a, f->r2);
    for (int i = (int)big_bits(exponent)-1; i >= 0; --i) {
        result = montgomery(f, result, result);
        if ((exponent.word[i/32] >> (i%32)) & 1) result = montgomery(f, result, a);
    }
    return montgomery(f, result, big_small(1));
}

Big field_inverse(const Field *f, Big a) {
    /* Para p primo y a != 0, a^(p-2) es el inverso de a. */
    return field_pow(f, a, big_sub(f->p, big_small(2)));
}

/* rand es estandar y sirve para la practica, no para claves de uso real.
 * Rechazamos el sobrante para obtener bloques uniformes de 15 bits. */
static uint32_t random15(void) {
    uint64_t range = (uint64_t)RAND_MAX + 1;
    uint64_t limit = range - range % 32768;
    unsigned value;
    do { value = (unsigned)rand(); } while ((uint64_t)value >= limit);
    return value % 32768;
}

Big big_random(unsigned bits) {
    Big a = {{0}};
    if (bits > BIG_BITS) return a;
    for (unsigned i = 0; i < bits; i += 15) {
        uint32_t value = random15();
        for (unsigned j = 0; j < 15 && i+j < bits; ++j)
            a.word[(i+j)/32] |= ((value >> j)&1u) << ((i+j)%32);
    }
    return a;
}

Big random_below(Big limit) {
    Big a;
    if (!big_bits(limit)) return big_small(0);
    do { a = big_random(big_bits(limit)); } while (big_compare(a, limit) >= 0);
    return a;
}

/* Primero descartamos divisores pequenos; despues hacemos 32 rondas
 * de Miller-Rabin. Un resultado positivo significa primo probable. */
int probable_prime(Big p) {
    if (big_compare(p, big_small(2)) < 0) return 0;
    for (uint32_t d = 2; d < 2000; ++d) {
        if (big_compare(p, big_small(d)) == 0) return 1;
        uint64_t remainder = 0;
        for (int i = BIG_WORDS-1; i >= 0; --i)
            remainder = ((remainder << 32) | p.word[i]) % d;
        if (!remainder) return 0;
    }
    Field f;
    if (!field_init(&f, p)) return 0;
    Big minus_one = big_sub(p, big_small(1)), d = minus_one;
    unsigned s = 0;
    while (!(d.word[0]&1)) { d = big_half(d); ++s; }
    for (unsigned round = 0; round < 32; ++round) {
        Big base = random_below(big_sub(p, big_small(3)));
        base = field_add(&f, base, big_small(2));
        Big x = field_pow(&f, base, d);
        if (big_compare(x, big_small(1)) == 0 || big_compare(x, minus_one) == 0) continue;
        unsigned r;
        for (r = 1; r < s; ++r) {
            x = field_mul(&f, x, x);
            if (big_compare(x, minus_one) == 0) break;
        }
        if (r == s) return 0;
    }
    return 1;
}
