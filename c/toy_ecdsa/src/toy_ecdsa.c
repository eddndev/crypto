#include "toy_ecdsa.h"
#include "toy_ecdh.h"
#include <stddef.h>
#include <stdlib.h>

static int valid_scalar(Big value, Big q) {
    return big_bits(value) != 0 && big_compare(value, q) < 0;
}

/* Reduce x modulo q one bit at a time without needing a division library. */
static Big reduce_mod(const Field *field, Big x) {
    Big remainder = big_small(0);
    for (unsigned remaining = big_bits(x); remaining > 0; --remaining) {
        unsigned i = remaining - 1;
        remainder = field_add(field, remainder, remainder);
        if ((x.word[i / 32] >> (i % 32)) & UINT32_C(1)) {
            remainder = field_add(field, remainder, big_small(1));
        }
    }
    return remainder;
}

static int prepare_domain(Big p, Big a, Big b, Big q, Point generator, EcdsaPublicKey *public_key) {
    if (!public_key || !probable_prime(p) || !probable_prime(q) ||
        big_compare(q, big_small(3)) <= 0 || curve_init(&public_key->curve, p, a, b) != 0 ||
        generator.z != 1 || !point_belongs(&public_key->curve, generator)) {
        return 1;
    }

    Point order_check;
    if (scalar_multiply_ltr(&public_key->curve, q, generator, &order_check, NULL, NULL) != 0 ||
        order_check.z != 0) {
        return 1;
    }
    public_key->q = q;
    public_key->generator = generator;
    return 0;
}

int ecdsa_public_from_private(Big p, Big a, Big b, Big q, Point generator, Big private_key,
                              EcdsaPublicKey *public_key) {
    if (prepare_domain(p, a, b, q, generator, public_key) != 0 || !valid_scalar(private_key, q) ||
        scalar_multiply_ltr(&public_key->curve, private_key, generator, &public_key->public_point,
                            NULL, NULL) != 0) {
        return 1;
    }
    return public_key->public_point.z != 1;
}

int ecdsa_generate_key_pair(Big p, Big a, Big b, Big q, Point generator, EcdsaPublicKey *public_key,
                            Big *private_key) {
    if (!private_key || prepare_domain(p, a, b, q, generator, public_key) != 0) {
        return 1;
    }

    do {
        *private_key = random_below(q);
    } while (!valid_scalar(*private_key, q));

    if (scalar_multiply_ltr(&public_key->curve, *private_key, generator, &public_key->public_point,
                            NULL, NULL) != 0) {
        return 1;
    }
    return public_key->public_point.z != 1;
}

int ecdsa_sign(const EcdsaPublicKey *public_key, Big private_key, Big message,
               EcdsaSignature *signature) {
    if (!public_key || !signature || !valid_scalar(private_key, public_key->q) ||
        !valid_scalar(message, public_key->q)) {
        return 1;
    }

    Field order_field;
    if (field_init(&order_field, public_key->q) != 0) {
        return 1;
    }
    for (unsigned attempt = 0; attempt < 128; ++attempt) {
        Big nonce = random_below(public_key->q);
        if (!valid_scalar(nonce, public_key->q)) {
            continue;
        }

        Point point;
        if (scalar_multiply_ltr(&public_key->curve, nonce, public_key->generator, &point, NULL,
                                NULL) != 0 ||
            point.z != 1) {
            return 1;
        }
        Big r = reduce_mod(&order_field, point.x);
        if (big_bits(r) == 0) {
            continue;
        }
        Big numerator = field_add(&order_field, message, field_mul(&order_field, private_key, r));
        Big s = field_mul(&order_field, numerator, field_inverse(&order_field, nonce));
        if (big_bits(s) != 0) {
            signature->r = r;
            signature->s = s;
            return 0;
        }
    }
    return 1;
}

int ecdsa_public_key(Big p, Big a, Big b, Big q, Point generator, Point public_point,
                     EcdsaPublicKey *public_key) {
    if (prepare_domain(p, a, b, q, generator, public_key) != 0 || public_point.z != 1 ||
        !point_belongs(&public_key->curve, public_point)) {
        return 1;
    }
    Point check;
    if (scalar_multiply_ltr(&public_key->curve, q, public_point, &check, NULL, NULL) != 0 ||
        check.z != 0) {
        return 1;
    }
    public_key->public_point = public_point;
    return 0;
}

int ecdsa_verify(const EcdsaPublicKey *public_key, Big message, EcdsaSignature signature,
                 EcdsaVerification *result) {
    if (!public_key || !result) {
        return 1;
    }
    *result = (EcdsaVerification){big_small(0), big_small(0), big_small(0),
                                 point_infinity(), 0};
    Big q = public_key->q;
    if (!valid_scalar(message, q) || !valid_scalar(signature.r, q) ||
        !valid_scalar(signature.s, q)) {
        return 0;
    }
    Field order_field;
    if (field_init(&order_field, q) != 0) {
        return 1;
    }
    result->w = field_inverse(&order_field, signature.s);
    result->u1 = field_mul(&order_field, result->w, message);
    result->u2 = field_mul(&order_field, result->w, signature.r);
    Point point1;
    Point point2;
    if (scalar_multiply_ltr(&public_key->curve, result->u1, public_key->generator,
                            &point1, NULL, NULL) != 0 ||
        scalar_multiply_ltr(&public_key->curve, result->u2, public_key->public_point,
                            &point2, NULL, NULL) != 0 ||
        point_add(&public_key->curve, point1, point2, &result->point) != 0) {
        return 1;
    }
    result->valid = result->point.z == 1 &&
                    big_compare(reduce_mod(&order_field, result->point.x), signature.r) == 0;
    return 0;
}

typedef struct {
    Point point;
    uint32_t scalar;
} BabyStep;

static int compare_points(Point point1, Point point2) {
    if (point1.z != point2.z) {
        return point1.z < point2.z ? -1 : 1;
    }
    int x_order = big_compare(point1.x, point2.x);
    return x_order ? x_order : big_compare(point1.y, point2.y);
}

static int compare_babies(const void *left, const void *right) {
    const BabyStep *step1 = left;
    const BabyStep *step2 = right;
    return compare_points(step1->point, step2->point);
}

int ecdsa_discrete_log(const EcdsaPublicKey *public_key, Big *private_key) {
    if (!public_key || !private_key) {
        return 1;
    }
    uint32_t limit = UINT32_C(4294967295);
    if (big_compare(public_key->q, big_small(limit)) <= 0) {
        limit = public_key->q.word[0] - 1;
    }
    uint32_t width = 1;
    while ((uint64_t)width * width <= limit) {
        ++width;
    }
    if ((uint64_t)width * sizeof(BabyStep) > SIZE_MAX) {
        return 1;
    }
    BabyStep *table = malloc((size_t)width * sizeof(*table));
    if (!table) {
        return 1;
    }
    Point point = point_infinity();
    for (uint32_t j = 0; j < width; ++j) {
        table[j] = (BabyStep){point, j};
        if (point_add(&public_key->curve, point, public_key->generator, &point) != 0) {
            free(table);
            return 1;
        }
    }
    /* point = width*A; subtract it once per giant step. */
    if (point.z) {
        point.y = field_sub(&public_key->curve.field, big_small(0), point.y);
    }
    qsort(table, width, sizeof(*table), compare_babies);
    Point giant = public_key->public_point;
    for (uint32_t i = 0; i < width; ++i) {
        BabyStep needle = {giant, 0};
        const BabyStep *match = bsearch(&needle, table, width, sizeof(*table), compare_babies);
        if (match) {
            uint64_t candidate = (uint64_t)i * width + match->scalar;
            if (candidate > 0 && candidate <= limit) {
                *private_key = big_small((uint32_t)candidate);
                free(table);
                return 0;
            }
        }
        if (point_add(&public_key->curve, giant, point, &giant) != 0) {
            free(table);
            return 1;
        }
    }
    free(table);
    return 2;
}
