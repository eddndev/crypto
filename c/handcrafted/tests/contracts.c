#include "bigint.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

static int source(void *context, unsigned char *bytes, size_t length) {
    memset(bytes, *(unsigned char *)context, length);
    return 0;
}
static int failed_source(void *context, unsigned char *bytes, size_t length) {
    (void)context;
    memset(bytes, 0xff, length);
    return 1;
}

int handcrafted_contracts(void) {
    Big result = big_small(123);
    assert(big_parse(NULL, &result) && !big_bits(result));
    assert(big_parse("", &result) && !big_bits(result));
    assert(big_parse("12x", &result) && !big_bits(result));
    assert(big_parse("-1", &result) && !big_bits(result));
    assert(big_parse(" 1", &result) && !big_bits(result));
    assert(big_parse("1", NULL));
    char too_large[619];
    memset(too_large, '9', sizeof(too_large) - 1);
    too_large[sizeof(too_large) - 1] = '\0';
    assert(big_parse(too_large, &result) && !big_bits(result));
    assert(!big_parse("000001", &result) && big_compare(result, big_small(1)) == 0);

    assert(big_sub_checked(big_small(0), big_small(1), &result) && !big_bits(result));
    /* Regression: the unchecked underflow must still format without a buffer overrun. */
    Big underflow = big_sub(big_small(0), big_small(1));
    char decimal[BIG_DECIMAL];
    big_decimal(underflow, decimal);
    assert(strlen(decimal) == 627);
    assert(big_decimal_checked(underflow, decimal, sizeof(decimal)) && !*decimal);
    char tiny[2] = {'x', 'x'};
    assert(big_decimal_checked(big_small(123), tiny, sizeof(tiny)) && !*tiny);
    assert(!big_decimal_checked(big_small(0), tiny, sizeof(tiny)) && !strcmp(tiny, "0"));
    assert(big_decimal_checked(big_small(1), NULL, 0));
    big_decimal(big_small(0), NULL);

    Field field;
    memset(&field, 0xff, sizeof(field));
    assert(field_init(&field, big_small(2)) && field.n == 0 && !big_bits(field.p));
    assert(field_init(NULL, big_small(5)));
    assert(field_mul_checked(&field, big_small(1), big_small(1), &result));
    assert(field_mul_checked(NULL, big_small(1), big_small(1), &result));
    assert(!field_init(&field, big_small(15)));
    assert(!field_inverse_checked(&field, big_small(2), &result));
    assert(big_compare(result, big_small(8)) == 0);
    assert(field_inverse_checked(&field, big_small(5), &result) && !big_bits(result));
    assert(field_inverse_checked(&field, big_small(0), &result) && !big_bits(result));
    assert(field_mul_checked(&field, big_small(15), big_small(1), &result));
    assert(field_add_checked(&field, big_small(1), big_small(1), NULL));
    assert(field_sub_checked(NULL, big_small(1), big_small(1), &result));
    assert(field_pow_checked(NULL, big_small(1), big_small(1), &result));
    assert(field_reduce_checked(NULL, big_small(1), &result));

    Big a = big_small(7);
    Big b = big_small(3);
    assert(!big_add_checked(a, b, &a) && big_compare(a, big_small(10)) == 0);
    assert(!big_sub_checked(a, b, &a) && big_compare(a, big_small(7)) == 0);
    assert(!big_mul_checked(a, b, &a) && big_compare(a, big_small(21)) == 0);
    assert(!big_divmod(a, b, &a, &b) && big_compare(a, big_small(7)) == 0 && !big_bits(b));
    assert(big_divmod(a, b, &a, &b) && !big_bits(a) && !big_bits(b));
    assert(big_divmod(big_small(5), big_small(2), &a, &a));
    assert(big_divmod(big_small(5), big_small(2), NULL, &a));
    assert(big_add_checked(big_small(1), big_small(1), NULL));
    assert(big_sub_checked(big_small(1), big_small(1), NULL));
    assert(big_mul_checked(big_small(1), big_small(1), NULL));

    unsigned char bytes[256];
    memset(bytes, 0xff, sizeof(bytes));
    assert(!big_from_be(bytes, sizeof(bytes), &a) && big_bits(a) == 2048);
    assert(!big_to_be(a, bytes, sizeof(bytes)));
    for (size_t i = 0; i < sizeof(bytes); ++i) {
        assert(bytes[i] == 0xff);
    }
    assert(big_add_checked(a, big_small(1), &result) && !big_bits(result));
    assert(big_mul_checked(a, big_small(2), &result) && !big_bits(result));
    assert(big_from_be(bytes, 257, &result));
    assert(big_from_be(NULL, 1, &result));
    assert(big_to_be(big_small(256), bytes, 1) && !bytes[0]);
    assert(big_to_be(a, bytes, 257));
    assert(big_to_be(a, NULL, 1));
    assert(field_pow_checked(&field, big_small(1), underflow, &result));
    assert(field_reduce_checked(&field, underflow, &result));

    unsigned char value = 0xff;
    assert(!big_random_with(9, source, &value, &result) && result.word[0] == 511);
    assert(big_random_with(2049, source, &value, &result) && !big_bits(result));
    assert(big_random_with(1, NULL, NULL, &result));
    assert(big_random_with(10, failed_source, NULL, &result) && !big_bits(result));
    assert(!big_random_with(0, NULL, NULL, &result) && !big_bits(result));
    assert(random_below_with(big_small(3), source, &value, &result) && !big_bits(result));
    value = 1;
    assert(!random_below_with(big_small(3), source, &value, &result) && result.word[0] == 1);
    assert(random_below_with(big_small(0), source, &value, &result));
    assert(random_below_with(big_small(3), failed_source, NULL, &result));
    assert(random_below_with(big_small(3), NULL, NULL, &result));
    big_clear(&result);
    assert(!big_bits(result));
    big_clear(NULL);
    puts("PASS: parse, underflow, buffer sizes, null outputs, invalid fields, inverse, aliasing, endian conversion and bounded entropy contracts.");
    return 0;
}
#ifndef __EMSCRIPTEN__
int main(void) {
    return handcrafted_contracts();
}
#endif
