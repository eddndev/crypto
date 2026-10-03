#include "toy_ecdsa.h"
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

static int read_parameters(char **args, Big *p, Big *a, Big *b, Big *q, Point *generator) {
    if (big_parse(args[0], p) || big_parse(args[1], a) || big_parse(args[2], b) ||
        big_parse(args[3], q) || big_parse(args[4], &generator->x) ||
        big_parse(args[5], &generator->y)) {
        return 1;
    }
    generator->z = 1;
    return 0;
}

static void print_big(const char *label, Big value) {
    char text[BIG_DECIMAL];
    big_decimal(value, text);
    printf("%s%s\n", label, text);
}

static void print_point(const char *label, Point point) {
    char x[BIG_DECIMAL];
    char y[BIG_DECIMAL];
    big_decimal(point.x, x);
    big_decimal(point.y, y);
    printf("%s(%s, %s, %u)\n", label, x, y, point.z);
}

static void print_public_key(const EcdsaPublicKey *key) {
    print_big("p = ", key->curve.field.p);
    print_big("a = ", key->curve.a);
    print_big("b = ", key->curve.b);
    print_big("q = ", key->q);
    print_point("A = ", key->generator);
    print_point("B = ", key->public_point);
}

static void print_signature(Big message, EcdsaSignature signature) {
    print_big("m = ", message);
    print_big("r = ", signature.r);
    print_big("s = ", signature.s);
}

static int demo(const EcdsaPublicKey *alice, Big alice_private, Big message) {
    EcdsaPublicKey bob;
    Big bob_private;
    if (ecdsa_generate_key_pair(alice->curve.field.p, alice->curve.a, alice->curve.b, alice->q,
                                alice->generator, &bob, &bob_private)) {
        return 1;
    }
    const EcdsaPublicKey *keys[] = {alice, &bob};
    Big private_keys[] = {alice_private, bob_private};
    const char *names[] = {"Alice", "Bob"};
    /* Verification receives only public values from each simulated signer. */
    for (unsigned i = 0; i < 2; ++i) {
        EcdsaSignature signature;
        EcdsaVerification check;
        EcdsaVerification changed;
        Big tampered = big_compare(message, big_small(1)) == 0 ? big_small(2) : big_small(1);
        if (ecdsa_sign(keys[i], private_keys[i], message, &signature) ||
            ecdsa_verify(keys[i], message, signature, &check) ||
            ecdsa_verify(keys[i], tampered, signature, &changed)) {
            return 1;
        }
        printf("%s signs; %s verifies\n", names[i], names[1 - i]);
        print_point("B = ", keys[i]->public_point);
        print_signature(message, signature);
        printf("signature = %s\n", check.valid ? "VALID" : "INVALID");
        print_big("modified m = ", tampered);
        printf("modified signature = %s\n\n", changed.valid ? "VALID" : "INVALID");
        if (!check.valid) {
            return 1;
        }
    }
    return 0;
}

static int execute(int argc, char **argv) {
    if (argc < 8) {
        return 1;
    }
    const char *command = argv[1];
    int keygen = strcmp(command, "keygen") == 0;
    int signing = strcmp(command, "sign") == 0;
    int public = strcmp(command, "public") == 0;
    int verify = strcmp(command, "verify") == 0;
    int dlog = strcmp(command, "dlog") == 0;
    int exchange = strcmp(command, "demo") == 0;
    int expected = keygen ? 8 : (public || exchange) ? 9 : (signing || dlog) ? 10 : 13;
    int seeded = (keygen || signing || exchange) && argc == expected + 1;
    if ((!keygen && !signing && !public && !verify && !dlog && !exchange) ||
        (argc != expected && !seeded)) {
        return 1;
    }
    unsigned seed = (unsigned)time(NULL) ^ (unsigned)clock();
    if (seeded) {
        Big parsed;
        if (big_parse(argv[expected], &parsed) || big_bits(parsed) > 32 ||
            parsed.word[0] > UINT_MAX) {
            return 1;
        }
        seed = (unsigned)parsed.word[0];
    }
    srand(seed);
    Big p;
    Big a;
    Big b;
    Big q;
    Point generator;
    if (read_parameters(argv + 2, &p, &a, &b, &q, &generator)) {
        return 1;
    }
    EcdsaPublicKey key;
    Big private_key;
    if (keygen || exchange) {
        if (ecdsa_generate_key_pair(p, a, b, q, generator, &key, &private_key)) {
            return 1;
        }
        if (exchange) {
            Big message;
            if (big_parse(argv[8], &message)) {
                return 1;
            }
            puts("Local Alice/Bob simulation");
            print_big("p = ", p);
            print_big("q = ", q);
            return demo(&key, private_key, message);
        }
        puts("Public key:");
        print_public_key(&key);
        print_big("Private key d = ", private_key);
    } else if (signing || public) {
        if (big_parse(argv[8], &private_key) ||
            ecdsa_public_from_private(p, a, b, q, generator, private_key, &key)) {
            return 1;
        }
        if (public) {
            print_public_key(&key);
            return 0;
        }
        Big message;
        EcdsaSignature signature;
        if (big_parse(argv[9], &message) || ecdsa_sign(&key, private_key, message, &signature)) {
            return 1;
        }
        print_signature(message, signature);
        print_point("B = ", key.public_point);
    } else {
        Point public_point = {big_small(0), big_small(0), 1};
        if (big_parse(argv[8], &public_point.x) || big_parse(argv[9], &public_point.y) ||
            ecdsa_public_key(p, a, b, q, generator, public_point, &key)) {
            return 1;
        }
        if (dlog) {
            int status = ecdsa_discrete_log(&key, &private_key);
            if (status == 2) {
                puts("No private scalar found in 1 <= d <= min(q-1, 4294967295).");
                return 0;
            }
            if (status) {
                return 1;
            }
            print_big("Recovered d = ", private_key);
            print_point("dA = B = ", public_point);
            return 0;
        }
        Big message;
        EcdsaSignature signature;
        EcdsaVerification result;
        if (big_parse(argv[10], &message) || big_parse(argv[11], &signature.r) ||
            big_parse(argv[12], &signature.s) || ecdsa_verify(&key, message, signature, &result)) {
            return 1;
        }
        print_signature(message, signature);
        print_big("w = ", result.w);
        print_big("u1 = ", result.u1);
        print_big("u2 = ", result.u2);
        print_point("P = ", result.point);
        printf("signature = %s\n", result.valid ? "VALID" : "INVALID");
    }
    return ferror(stdout) != 0;
}

int toy_ecdsa_command(int argc, char **argv) {
    int failed = execute(argc, argv);
    if (failed) {
        fputs("Error: check prime p/q, curve, subgroup, key and decimal inputs.\n"
              "keygen p a b q Ax Ay [seed]\n"
              "public p a b q Ax Ay d\n"
              "sign p a b q Ax Ay d m [seed]\n"
              "verify p a b q Ax Ay Bx By m r s\n"
              "dlog p a b q Ax Ay Bx By\n"
              "demo p a b q Ax Ay m [seed]\n", stderr);
    }
    return failed;
}

int run_toy_ecdsa(const char *command) {
    char buffer[8192];
    char *argv[15];
    if (!command || strlen(command) >= sizeof(buffer)) {
        return 1;
    }
    strcpy(buffer, command);
    argv[0] = "toy_ecdsa";
    int argc = 1;
    char *token = strtok(buffer, " \t\r\n");
    while (token && argc < 15) {
        argv[argc++] = token;
        token = strtok(NULL, " \t\r\n");
    }
    return token ? 1 : toy_ecdsa_command(argc, argv);
}
