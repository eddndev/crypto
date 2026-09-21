#include "toy_ecdh.h"
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

static int write_big(FILE *output, const char *label, Big value) {
    char text[BIG_DECIMAL];
    big_decimal(value, text);
    return fprintf(output, "%s%s", label, text) < 0;
}

static int write_point(FILE *output, const char *label, Point point) {
    char x[BIG_DECIMAL];
    char y[BIG_DECIMAL];
    big_decimal(point.x, x);
    big_decimal(point.y, y);
    return fprintf(output, "%s(%s, %s, %u)", label, x, y, point.z) < 0;
}

static int write_step(const ScalarStep *step, void *context) {
    FILE *output = context;
    if (fprintf(output, "step=%u i=%u bit=%u ", step->iteration, step->bit_index, step->bit) < 0 ||
        write_point(output, "Q=", step->accumulator) || write_point(output, " P=", step->point) ||
        fputc('\n', output) == EOF) {
        return 1;
    }
    return 0;
}

static int read_point(char **text, Point *point) {
    Big z;
    if (big_parse(text[0], &point->x) || big_parse(text[1], &point->y) || big_parse(text[2], &z) ||
        big_compare(z, big_small(1)) > 0) {
        return 1;
    }
    point->z = (unsigned)z.word[0];
    return 0;
}

static int read_curve(char **text, Curve *curve) {
    Big p;
    Big a;
    Big b;
    if (big_parse(text[0], &p) || big_parse(text[1], &a) || big_parse(text[2], &b) ||
        curve_init(curve, p, a, b)) {
        return 1;
    }
    /* Reject known composites before using inverses based on Fermat's theorem. */
    return !probable_prime(p);
}

static int read_method(const char *text, ScalarMethod *method) {
    if (strcmp(text, "rtl") == 0) {
        *method = SCALAR_RTL;
    } else if (strcmp(text, "ltr") == 0) {
        *method = SCALAR_LTR;
    } else {
        return 1;
    }
    return 0;
}

static int read_role(const char *text, int *alice) {
    if (strcmp(text, "alice") != 0 && strcmp(text, "bob") != 0) {
        return 1;
    }
    *alice = strcmp(text, "alice") == 0;
    return 0;
}

static int multiply_command(int argc, char **argv) {
    ScalarMethod method;
    Curve curve;
    Point point;
    Point result;
    Big k;
    if ((argc != 10 && argc != 11) || (argc == 11 && strcmp(argv[10], "trace") != 0) ||
        read_method(argv[2], &method) || read_curve(argv + 3, &curve) || big_parse(argv[6], &k) ||
        read_point(argv + 7, &point)) {
        return 1;
    }
    int tracing = argc == 11;
    if (tracing) {
        printf("method = %s\n", argv[2]);
        write_big(stdout, "p = ", curve.field.p);
        write_big(stdout, "\na = ", curve.a);
        write_big(stdout, "\nb = ", curve.b);
        write_big(stdout, "\nk = ", k);
        write_point(stdout, "\nP = ", point);
        write_point(stdout, "\ninitial Q = ", point_infinity());
        putchar('\n');
    }
    int failed =
        method == SCALAR_RTL
            ? scalar_multiply_rtl(&curve, k, point, &result, tracing ? write_step : NULL, stdout)
            : scalar_multiply_ltr(&curve, k, point, &result, tracing ? write_step : NULL, stdout);
    if (failed) {
        return 1;
    }
    write_point(stdout, "kP = ", result);
    putchar('\n');
    return ferror(stdout) != 0;
}

static int exchange_command(int argc, char **argv) {
    int alice;
    ScalarMethod method;
    Curve curve;
    Point point;
    Point result;
    Big private_scalar;
    if (argc != 11 || read_role(argv[2], &alice) || read_method(argv[3], &method) ||
        read_curve(argv + 4, &curve) || big_parse(argv[7], &private_scalar) ||
        read_point(argv + 8, &point) ||
        ecdh_point(&curve, private_scalar, point, method, &result)) {
        return 1;
    }
    int shared = strcmp(argv[1], "shared") == 0;
    const char *label = shared ? (alice ? "K_A = " : "K_B = ") : (alice ? "A = " : "B = ");
    write_point(stdout, label, result);
    putchar('\n');
    return ferror(stdout) != 0;
}

static int keygen_command(int argc, char **argv) {
    int alice;
    ScalarMethod method;
    Curve curve;
    Point generator;
    Big seed;
    unsigned random_seed = (unsigned)time(NULL);
    if ((argc != 10 && argc != 11) || read_role(argv[2], &alice) || read_method(argv[3], &method) ||
        read_curve(argv + 4, &curve) || read_point(argv + 7, &generator) || generator.z != 1 ||
        !point_belongs(&curve, generator) || big_bits(curve.field.p) < 7) {
        return 1;
    }
    if (argc == 11) {
        if (big_parse(argv[10], &seed) || big_bits(seed) > 32 || seed.word[0] > UINT_MAX) {
            return 1;
        }
        random_seed = (unsigned)seed.word[0];
    }
    srand(random_seed);
    /* Exclude zero and scalars that send G to infinity. */
    for (unsigned attempt = 0; attempt < 128; ++attempt) {
        Big private_scalar = random_below(curve.field.p);
        Point public_point;
        if (ecdh_point(&curve, private_scalar, generator, method, &public_point) == 0) {
            printf("seed = %u\n", random_seed);
            write_big(stdout, alice ? "r = " : "s = ", private_scalar);
            write_point(stdout, alice ? "\nA = " : "\nB = ", public_point);
            puts("\nToy randomness: do not use these private scalars for real keys.");
            return ferror(stdout) != 0;
        }
    }
    return 1;
}

static int demo_command(int argc, char **argv) {
    Curve curve;
    Point generator;
    Point alice_public;
    Point bob_public;
    Point alice_shared;
    Point bob_shared;
    Big r;
    Big s;
    if (argc != 10 || read_curve(argv + 2, &curve) || read_point(argv + 5, &generator) ||
        big_parse(argv[8], &r) || big_parse(argv[9], &s) ||
        ecdh_point(&curve, r, generator, SCALAR_RTL, &alice_public) ||
        ecdh_point(&curve, s, generator, SCALAR_LTR, &bob_public) ||
        ecdh_point(&curve, r, bob_public, SCALAR_RTL, &alice_shared) ||
        ecdh_point(&curve, s, alice_public, SCALAR_LTR, &bob_shared)) {
        return 1;
    }
    write_point(stdout, "A = ", alice_public);
    write_point(stdout, "\nB = ", bob_public);
    write_point(stdout, "\nK_A = ", alice_shared);
    write_point(stdout, "\nK_B = ", bob_shared);
    int equal = point_equal(alice_shared, bob_shared);
    printf("\nK_A == K_B: %s\n", equal ? "yes" : "no");
    return !equal || ferror(stdout);
}

int toy_ecdh_command(int argc, char **argv) {
    int failed = 1;
    if (argc >= 2) {
        if (strcmp(argv[1], "multiply") == 0) {
            failed = multiply_command(argc, argv);
        } else if (strcmp(argv[1], "public") == 0 || strcmp(argv[1], "shared") == 0) {
            failed = exchange_command(argc, argv);
        } else if (strcmp(argv[1], "keygen") == 0) {
            failed = keygen_command(argc, argv);
        } else if (strcmp(argv[1], "demo") == 0) {
            failed = demo_command(argc, argv);
        }
    }
    if (failed) {
        fputs("Error: check the prime, nonsingular curve, point and scalar.\n"
              "multiply rtl|ltr p a b k x1 y1 z1 [trace]\n"
              "public|shared alice|bob rtl|ltr p a b r_or_s x1 y1 z1\n"
              "keygen alice|bob rtl|ltr p a b x1 y1 z1 [seed]\n"
              "demo p a b x1 y1 z1 r s\n"
              "ECDH requires p >= 7 bits, 0 < r,s < p and finite points/results.\n",
              stderr);
        return 1;
    }
    return 0;
}

int run_toy_ecdh(const char *command) {
    char buffer[8192];
    char *argv[12];
    if (!command || strlen(command) >= sizeof(buffer)) {
        return 1;
    }
    strcpy(buffer, command);
    argv[0] = "toy-ecdh";
    int argc = 1;
    char *token = strtok(buffer, " \t\r\n");
    while (token && argc < 12) {
        argv[argc++] = token;
        token = strtok(NULL, " \t\r\n");
    }
    if (token) {
        return 1;
    }
    return toy_ecdh_command(argc, argv);
}
