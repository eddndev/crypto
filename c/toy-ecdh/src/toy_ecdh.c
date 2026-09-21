#include "toy_ecdh.h"
#include <stddef.h>

static unsigned scalar_bit(Big k, unsigned index) {
    return (unsigned)((k.word[index / 32] >> (index % 32)) & UINT32_C(1));
}

int scalar_multiply_rtl(const Curve *curve, Big k, Point point, Point *result, ScalarTrace trace,
                        void *context) {
    if (!result || big_bits(k) > BIG_BITS || !point_belongs(curve, point)) {
        return 1;
    }
    *result = point_infinity();
    Point q = point_infinity();
    unsigned bits = big_bits(k);
    for (unsigned i = 0; i < bits; ++i) {
        unsigned bit = scalar_bit(k, i);
        if (bit && point_add(curve, q, point, &q) != 0) {
            return 1;
        }
        /* Retain the final doubling to follow Algorithm 1 exactly. */
        if (point_double(curve, point, &point) != 0) {
            return 1;
        }
        ScalarStep step = {i + 1, i, bit, q, point};
        if (trace && trace(&step, context) != 0) {
            return 1;
        }
    }
    *result = q;
    return 0;
}

int scalar_multiply_ltr(const Curve *curve, Big k, Point point, Point *result, ScalarTrace trace,
                        void *context) {
    if (!result || big_bits(k) > BIG_BITS || !point_belongs(curve, point)) {
        return 1;
    }
    *result = point_infinity();
    Point q = point_infinity();
    unsigned bits = big_bits(k);
    /* Count down without unsigned underflow, including the zero-scalar case. */
    for (unsigned remaining = bits; remaining > 0; --remaining) {
        unsigned i = remaining - 1;
        unsigned bit = scalar_bit(k, i);
        if (point_double(curve, q, &q) != 0) {
            return 1;
        }
        if (bit && point_add(curve, q, point, &q) != 0) {
            return 1;
        }
        ScalarStep step = {bits - i, i, bit, q, point};
        if (trace && trace(&step, context) != 0) {
            return 1;
        }
    }
    *result = q;
    return 0;
}

int ecdh_point(const Curve *curve, Big secret, Point point, ScalarMethod method, Point *result) {
    if (!curve || !result || big_bits(curve->field.p) < 7 || big_bits(secret) == 0 ||
        big_compare(secret, curve->field.p) >= 0 || point.z != 1) {
        return 1;
    }
    int failed;
    if (method == SCALAR_RTL) {
        failed = scalar_multiply_rtl(curve, secret, point, result, NULL, NULL);
    } else if (method == SCALAR_LTR) {
        failed = scalar_multiply_ltr(curve, secret, point, result, NULL, NULL);
    } else {
        return 1;
    }
    return failed || result->z == 0;
}
