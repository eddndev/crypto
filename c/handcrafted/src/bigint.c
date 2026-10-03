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
        if (a.word[i] != b.word[i])
            return a.word[i] > b.word[i] ? 1 : -1;
    return 0;
}

unsigned big_bits(Big a) {
    for (int i = BIG_WORDS - 1; i >= 0; --i) {
        uint32_t w = a.word[i];
        if (w) {
            unsigned bits = 0;
            while (w) {
                ++bits;
                w >>= 1;
            }
            return (unsigned)i * 32 + bits;
        }
    }
    return 0;
}

/* Parse decimal digits by multiplying the limb array by ten. */
int big_parse(const char *text, Big *a) {
    if (!a) {
        return 1;
    }
    *a = big_small(0);
    if (!text || !*text) {
        return 1;
    }
    Big parsed = big_small(0);
    for (; *text; ++text) {
        if (*text < '0' || *text > '9') {
            return 1;
        }
        uint64_t carry = (unsigned)(*text - '0');
        for (unsigned i = 0; i < BIG_WORDS; ++i) {
            carry += (uint64_t)parsed.word[i] * 10;
            parsed.word[i] = (uint32_t)carry;
            carry >>= 32;
        }
        if (carry || big_bits(parsed) > BIG_BITS) {
            return 1;
        }
    }
    *a = parsed;
    return 0;
}

void big_decimal(Big a, char text[BIG_DECIMAL]) {
    if (!text) {
        return;
    }
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
        char tmp = text[i];
        text[i] = text[length - 1 - i];
        text[length - 1 - i] = tmp;
    }
}

/* Subtract with borrow; requires a >= b. */
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

/* Field operands are canonical values between zero and p-1. */
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

/* Montgomery product a*b/R modulo p, where R = 2^(32*n).
 * Multiply the limbs, then cancel the low words. Each product and carry
 * fits in uint64_t. */
static Big montgomery(const Field *f, Big a, Big b) {
    uint32_t t[2 * BIG_WORDS + 1] = {0};
    unsigned n = f->n;
    for (unsigned i = 0; i < n; ++i) {
        uint64_t carry = 0;
        for (unsigned j = 0; j < n; ++j) {
            uint64_t v = (uint64_t)a.word[i] * b.word[j] + t[i + j] + carry;
            t[i + j] = (uint32_t)v;
            carry = v >> 32;
        }
        t[i + n] = (uint32_t)carry;
    }
    for (unsigned i = 0; i < n; ++i) {
        uint32_t m = (uint32_t)((uint64_t)t[i] * f->inverse);
        uint64_t carry = 0;
        for (unsigned j = 0; j < n; ++j) {
            uint64_t v = (uint64_t)m * f->p.word[j] + t[i + j] + carry;
            t[i + j] = (uint32_t)v;
            carry = v >> 32;
        }
        unsigned k = i + n;
        while (carry) {
            carry += t[k];
            t[k++] = (uint32_t)carry;
            carry >>= 32;
        }
    }
    Big result = {{0}};
    for (unsigned i = 0; i <= n; ++i)
        result.word[i] = t[i + n];
    return big_compare(result, f->p) >= 0 ? big_sub(result, f->p) : result;
}

int field_init(Field *f, Big p) {
    if (!f)
        return 1;
    *f = (Field){0};
    if (big_compare(p, big_small(3)) <= 0 || !(p.word[0] & 1) || big_bits(p) > BIG_BITS)
        return 1;
    f->p = p;
    f->n = (big_bits(p) + 31) / 32;
    /* Newton iteration computes the negative inverse of p[0] modulo 2^32. */
    uint32_t inverse = 1;
    for (unsigned i = 0; i < 5; ++i)
        inverse = (uint32_t)((uint64_t)inverse * (UINT64_C(2) - (uint64_t)p.word[0] * inverse));
    f->inverse = 0u - inverse;
    f->r2 = big_small(1);
    for (unsigned i = 0; i < 64 * f->n; ++i)
        f->r2 = field_add(f, f->r2, f->r2);
    f->one = montgomery(f, big_small(1), f->r2);
    return 0;
}

Big field_mul(const Field *f, Big a, Big b) {
    return montgomery(f, montgomery(f, a, f->r2), b);
}

/* Square and multiply while keeping intermediates in Montgomery form. */
Big field_pow(const Field *f, Big a, Big exponent) {
    Big result = f->one;
    a = montgomery(f, a, f->r2);
    for (int i = (int)big_bits(exponent) - 1; i >= 0; --i) {
        result = montgomery(f, result, result);
        if ((exponent.word[i / 32] >> (i % 32)) & 1)
            result = montgomery(f, result, a);
    }
    return montgomery(f, result, big_small(1));
}

Big field_inverse(const Field *f, Big a) {
    /* For prime p and nonzero a, a^(p-2) is the multiplicative inverse. */
    return field_pow(f, a, big_sub(f->p, big_small(2)));
}

/* Standard rand is for this toy exercise, not real private keys.
 * Rejection sampling produces unbiased 15-bit blocks. */
static uint32_t random15(void) {
    uint64_t range = (uint64_t)RAND_MAX + 1;
    uint64_t limit = range - range % 32768;
    unsigned value;
    do {
        value = (unsigned)rand();
    } while ((uint64_t)value >= limit);
    return value % 32768;
}

Big big_random(unsigned bits) {
    Big a = {{0}};
    if (bits > BIG_BITS)
        return a;
    for (unsigned i = 0; i < bits; i += 15) {
        uint32_t value = random15();
        for (unsigned j = 0; j < 15 && i + j < bits; ++j)
            a.word[(i + j) / 32] |= ((value >> j) & 1u) << ((i + j) % 32);
    }
    return a;
}

Big random_below(Big limit) {
    Big a;
    if (!big_bits(limit))
        return big_small(0);
    do {
        a = big_random(big_bits(limit));
    } while (big_compare(a, limit) >= 0);
    return a;
}

/* Trial division followed by 32 Miller-Rabin rounds.
 * A positive result means probable prime. */
int probable_prime(Big p) {
    if (big_compare(p, big_small(2)) < 0)
        return 0;
    for (uint32_t d = 2; d < 2000; ++d) {
        if (big_compare(p, big_small(d)) == 0)
            return 1;
        uint64_t remainder = 0;
        for (int i = BIG_WORDS - 1; i >= 0; --i)
            remainder = ((remainder << 32) | p.word[i]) % d;
        if (!remainder)
            return 0;
    }
    Field f;
    if (field_init(&f, p) != 0)
        return 0;
    Big minus_one = big_sub(p, big_small(1));
    Big d = minus_one;
    unsigned s = 0;
    while (!(d.word[0] & 1)) {
        d = big_half(d);
        ++s;
    }
    for (unsigned round = 0; round < 32; ++round) {
        Big base = random_below(big_sub(p, big_small(3)));
        base = field_add(&f, base, big_small(2));
        Big x = field_pow(&f, base, d);
        if (big_compare(x, big_small(1)) == 0 || big_compare(x, minus_one) == 0)
            continue;
        unsigned r;
        for (r = 1; r < s; ++r) {
            x = field_mul(&f, x, x);
            if (big_compare(x, minus_one) == 0)
                break;
        }
        if (r == s)
            return 0;
    }
    return 1;
}

static int valid_big(Big a) {
    return big_bits(a) <= BIG_BITS;
}

static int ready_field(const Field *f) {
    return f && valid_big(f->p) && big_compare(f->p, big_small(3)) > 0 &&
           (f->p.word[0] & 1) && f->n == (big_bits(f->p) + 31) / 32 &&
           big_compare(f->r2, f->p) < 0 && big_bits(f->one) != 0 &&
           big_compare(f->one, f->p) < 0 &&
           (uint32_t)((uint64_t)f->p.word[0] * f->inverse) == UINT32_MAX;
}

static Big storage_add(Big a, Big b) {
    uint64_t carry = 0;
    for (unsigned i = 0; i < BIG_WORDS; ++i) {
        carry += (uint64_t)a.word[i] + b.word[i];
        a.word[i] = (uint32_t)carry;
        carry >>= 32;
    }
    return a;
}

int big_decimal_checked(Big a, char *text, size_t capacity) {
    if (!text || !capacity) {
        return 1;
    }
    text[0] = '\0';
    if (!valid_big(a)) {
        return 1;
    }
    char buffer[BIG_DECIMAL];
    big_decimal(a, buffer);
    size_t length = strlen(buffer) + 1;
    if (capacity < length) {
        return 1;
    }
    memcpy(text, buffer, length);
    return 0;
}

int big_add_checked(Big a, Big b, Big *result) {
    if (!result) {
        return 1;
    }
    *result = big_small(0);
    if (!valid_big(a) || !valid_big(b)) {
        return 1;
    }
    Big sum = storage_add(a, b);
    if (!valid_big(sum)) {
        return 1;
    }
    *result = sum;
    return 0;
}

int big_sub_checked(Big a, Big b, Big *result) {
    if (!result) {
        return 1;
    }
    *result = big_small(0);
    if (!valid_big(a) || !valid_big(b) || big_compare(a, b) < 0) {
        return 1;
    }
    *result = big_sub(a, b);
    return 0;
}

int big_mul_checked(Big a, Big b, Big *result) {
    if (!result) {
        return 1;
    }
    *result = big_small(0);
    if (!valid_big(a) || !valid_big(b)) {
        return 1;
    }
    enum { WORDS = BIG_BITS / 32 };
    uint32_t product[2 * WORDS] = {0};
    for (unsigned i = 0; i < WORDS; ++i) {
        uint64_t carry = 0;
        for (unsigned j = 0; j < WORDS; ++j) {
            uint64_t value = (uint64_t)a.word[i] * b.word[j] + product[i + j] + carry;
            product[i + j] = (uint32_t)value;
            carry = value >> 32;
        }
        product[i + WORDS] = (uint32_t)carry;
    }
    for (unsigned i = WORDS; i < 2 * WORDS; ++i) {
        if (product[i]) {
            return 1;
        }
    }
    for (unsigned i = 0; i < WORDS; ++i) {
        result->word[i] = product[i];
    }
    return 0;
}

int big_divmod(Big a, Big b, Big *quotient, Big *remainder) {
    if (quotient) {
        *quotient = big_small(0);
    }
    if (remainder) {
        *remainder = big_small(0);
    }
    if (!quotient || !remainder || quotient == remainder ||
        !valid_big(a) || !valid_big(b) || !big_bits(b)) {
        return 1;
    }
    Big q = big_small(0);
    Big r = big_small(0);
    for (unsigned remaining = big_bits(a); remaining > 0; --remaining) {
        unsigned i = remaining - 1;
        r = storage_add(r, r);
        r.word[0] |= (a.word[i / 32] >> (i % 32)) & 1u;
        if (big_compare(r, b) >= 0) {
            r = big_sub(r, b);
            q.word[i / 32] |= UINT32_C(1) << (i % 32);
        }
    }
    *quotient = q;
    *remainder = r;
    return 0;
}

int big_from_be(const unsigned char *bytes, size_t length, Big *result) {
    if (!result) {
        return 1;
    }
    *result = big_small(0);
    if (!bytes || !length || length > BIG_BITS / 8) {
        return 1;
    }
    for (size_t i = 0; i < length; ++i) {
        result->word[i / 4] |= (uint32_t)bytes[length - 1 - i] << (8 * (i % 4));
    }
    return 0;
}

int big_to_be(Big a, unsigned char *bytes, size_t length) {
    if (!bytes || !length || length > BIG_BITS / 8) {
        return 1;
    }
    memset(bytes, 0, length);
    if (!valid_big(a) || big_bits(a) > length * 8) {
        return 1;
    }
    for (size_t i = 0; i < length; ++i) {
        bytes[length - 1 - i] = (unsigned char)(a.word[i / 4] >> (8 * (i % 4)));
    }
    return 0;
}

static int checked_operands(const Field *f, Big a, Big b, Big *result) {
    if (!result) {
        return 1;
    }
    *result = big_small(0);
    return !ready_field(f) || big_compare(a, f->p) >= 0 || big_compare(b, f->p) >= 0;
}

int field_add_checked(const Field *f, Big a, Big b, Big *result) {
    if (checked_operands(f, a, b, result)) {
        return 1;
    }
    *result = field_add(f, a, b);
    return 0;
}

int field_sub_checked(const Field *f, Big a, Big b, Big *result) {
    if (checked_operands(f, a, b, result)) {
        return 1;
    }
    *result = field_sub(f, a, b);
    return 0;
}

int field_mul_checked(const Field *f, Big a, Big b, Big *result) {
    if (checked_operands(f, a, b, result)) {
        return 1;
    }
    *result = field_mul(f, a, b);
    return 0;
}

int field_pow_checked(const Field *f, Big a, Big exponent, Big *result) {
    if (checked_operands(f, a, big_small(0), result) || !valid_big(exponent)) {
        return 1;
    }
    *result = field_pow(f, a, exponent);
    return 0;
}

int field_reduce_checked(const Field *f, Big a, Big *result) {
    if (!result) {
        return 1;
    }
    *result = big_small(0);
    if (!ready_field(f) || !valid_big(a)) {
        return 1;
    }
    for (unsigned remaining = big_bits(a); remaining > 0; --remaining) {
        unsigned i = remaining - 1;
        *result = field_add(f, *result, *result);
        if ((a.word[i / 32] >> (i % 32)) & 1u) {
            *result = field_add(f, *result, big_small(1));
        }
    }
    return 0;
}

int field_inverse_checked(const Field *f, Big a, Big *result) {
    if (checked_operands(f, a, big_small(0), result) || !big_bits(a)) {
        return 1;
    }
    Big u = a;
    Big v = f->p;
    Big x1 = big_small(1);
    Big x2 = big_small(0);
    /* Binary extended GCD: x1*a = u and x2*a = v modulo p. */
    while (big_bits(u) && big_bits(v)) {
        if (big_compare(u, big_small(1)) == 0) {
            *result = x1;
            return 0;
        }
        if (big_compare(v, big_small(1)) == 0) {
            *result = x2;
            return 0;
        }
        while (big_bits(u) && !(u.word[0] & 1)) {
            u = big_half(u);
            x1 = big_half((x1.word[0] & 1) ? storage_add(x1, f->p) : x1);
        }
        while (big_bits(v) && !(v.word[0] & 1)) {
            v = big_half(v);
            x2 = big_half((x2.word[0] & 1) ? storage_add(x2, f->p) : x2);
        }
        if (big_compare(u, v) >= 0) {
            u = big_sub(u, v);
            x1 = field_sub(f, x1, x2);
        } else {
            v = big_sub(v, u);
            x2 = field_sub(f, x2, x1);
        }
    }
    return 1;
}

static void clear_bytes(unsigned char *bytes, size_t length) {
    volatile unsigned char *cursor = bytes;
    while (length--) {
        *cursor++ = 0;
    }
}

void big_clear(Big *a) {
    if (a) {
        clear_bytes((unsigned char *)a, sizeof(*a));
    }
}

int big_random_with(unsigned bits, BigEntropy entropy, void *context, Big *result) {
    if (!result) {
        return 1;
    }
    *result = big_small(0);
    if (bits > BIG_BITS || (!entropy && bits)) {
        return 1;
    }
    if (!bits) {
        return 0;
    }
    unsigned char bytes[BIG_BITS / 8] = {0};
    size_t length = (bits + 7) / 8;
    if (entropy(context, bytes, length)) {
        clear_bytes(bytes, sizeof(bytes));
        return 1;
    }
    if (bits % 8) {
        bytes[length - 1] &= (unsigned char)((1u << (bits % 8)) - 1);
    }
    for (size_t i = 0; i < length; ++i) {
        result->word[i / 4] |= (uint32_t)bytes[i] << (8 * (i % 4));
    }
    clear_bytes(bytes, sizeof(bytes));
    return 0;
}

int random_below_with(Big limit, BigEntropy entropy, void *context, Big *result) {
    if (!result) {
        return 1;
    }
    *result = big_small(0);
    if (!valid_big(limit) || !big_bits(limit) || !entropy) {
        return 1;
    }
    /* Bound retries even if the caller's source repeatedly returns rejected bytes. */
    for (unsigned attempt = 0; attempt < 256; ++attempt) {
        Big candidate;
        if (big_random_with(big_bits(limit), entropy, context, &candidate)) {
            return 1;
        }
        if (big_compare(candidate, limit) < 0) {
            *result = candidate;
            return 0;
        }
    }
    return 1;
}
