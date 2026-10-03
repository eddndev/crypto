#include "bigint.h"
#include <stdio.h>
#include <string.h>

int run_handcrafted_probe(const char *command) {
    char op[16];
    char first[700];
    char second[700];
    char third[700];
    char extra;
    if (!command || sscanf(command, "%15s %699s %699s %699s %c", op, first, second,
                            third, &extra) != 4) {
        return 1;
    }
    Big p;
    Big a;
    Big b;
    Big result = big_small(0);
    Big remainder = big_small(0);
    if (big_parse(first, &p) || big_parse(second, &a) || big_parse(third, &b)) {
        return 1;
    }
    Field field;
    int status = 1;
    if (!strcmp(op, "intadd")) {
        status = big_add_checked(a, b, &result);
    } else if (!strcmp(op, "intsub")) {
        status = big_sub_checked(a, b, &result);
    } else if (!strcmp(op, "intmul")) {
        status = big_mul_checked(a, b, &result);
    } else if (!strcmp(op, "div")) {
        status = big_divmod(a, b, &result, &remainder);
    } else if (!strcmp(op, "bytes")) {
        unsigned char bytes[BIG_BITS / 8];
        status = big_to_be(a, bytes, sizeof(bytes));
        if (!status) {
            status = big_from_be(bytes, sizeof(bytes), &result);
        }
    } else if (!field_init(&field, p)) {
        if (!strcmp(op, "add")) {
            status = field_add_checked(&field, a, b, &result);
        } else if (!strcmp(op, "sub")) {
            status = field_sub_checked(&field, a, b, &result);
        } else if (!strcmp(op, "mul")) {
            status = field_mul_checked(&field, a, b, &result);
        } else if (!strcmp(op, "pow")) {
            status = field_pow_checked(&field, a, b, &result);
        } else if (!strcmp(op, "reduce")) {
            status = field_reduce_checked(&field, a, &result);
        } else if (!strcmp(op, "inv")) {
            status = field_inverse_checked(&field, a, &result);
        }
    }
    char decimal[BIG_DECIMAL];
    char remainder_decimal[BIG_DECIMAL];
    big_decimal(result, decimal);
    big_decimal(remainder, remainder_decimal);
    printf("%d %s %s\n", status, decimal, remainder_decimal);
    return 0;
}

#ifndef __EMSCRIPTEN__
int main(void) {
    char line[2200];
    while (fgets(line, sizeof(line), stdin)) {
        if (run_handcrafted_probe(line)) {
            return 1;
        }
    }
    return ferror(stdin) ? 1 : 0;
}
#endif
