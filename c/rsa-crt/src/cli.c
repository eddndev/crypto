#include "internal.h"
#include "rsa_crt.h"
#include <string.h>

static void usage(void) {
    fprintf(stderr,
            "Usage:\n"
            "  rsa-crt keygen <bits>\n"
            "  rsa-crt encrypt <m> <e> <n>\n"
            "  rsa-crt decrypt <c> <p> <q> <n> <d> <dp> <dq>\n"
            "bits is |p| = |q|, from %d to %d. All numbers are decimal.\n",
            RSA_CRT_MIN_BITS, RSA_CRT_MAX_BITS);
}

/* Lee un entero decimal de hasta 2048 bits y avisa cual argumento esta mal. */
static int parse_number(const char *name, const char *text, Big *value) {
    if (big_parse(text, value)) {
        fprintf(stderr, "Error: %s must be a nonnegative decimal integer of at most %d bits.\n",
                name, BIG_BITS);
        return 1;
    }
    return 0;
}

/* bits solo acepta digitos y el rango permitido. */
static int parse_bits(const char *text, unsigned *bits) {
    size_t length = strlen(text);
    unsigned value = 0;
    if (length == 0 || length > 4) return 1;
    for (size_t i = 0; i < length; ++i) {
        if (text[i] < '0' || text[i] > '9') return 1;
        value = value * 10 + (unsigned)(text[i] - '0');
    }
    if (value < RSA_CRT_MIN_BITS || value > RSA_CRT_MAX_BITS) return 1;
    *bits = value;
    return 0;
}

static int command_keygen(char **argv) {
    unsigned bits = 0;
    if (parse_bits(argv[2], &bits)) {
        fprintf(stderr, "Error: bits must be an integer from %d to %d.\n",
                RSA_CRT_MIN_BITS, RSA_CRT_MAX_BITS);
        return 1;
    }
    RsaPublicKey public_key;
    RsaPrivateKey private_key;
    if (rsa_crt_keygen(bits, &public_key, &private_key)) {
        fputs("Error: key generation failed.\n", stderr);
        return 1;
    }
    int failed = puts("Public key (e, n)") < 0;
    failed |= write_value(stdout, "e", public_key.e);
    failed |= write_value(stdout, "n", public_key.n);
    failed |= puts("Private key (p, q, n, d, dp, dq)") < 0;
    failed |= write_value(stdout, "p", private_key.p);
    failed |= write_value(stdout, "q", private_key.q);
    failed |= write_value(stdout, "n", private_key.n);
    failed |= write_value(stdout, "d", private_key.d);
    failed |= write_value(stdout, "dp", private_key.dp);
    failed |= write_value(stdout, "dq", private_key.dq);
    private_key = (RsaPrivateKey){0};
    return failed != 0;
}

static int command_encrypt(char **argv) {
    Big m;
    RsaPublicKey public_key;
    if (parse_number("m", argv[2], &m) || parse_number("e", argv[3], &public_key.e) ||
        parse_number("n", argv[4], &public_key.n)) {
        return 1;
    }
    if (big_compare(public_key.n, big_small(3)) <= 0 || !(public_key.n.word[0] & 1)) {
        fputs("Error: n must be odd and greater than 3.\n", stderr);
        return 1;
    }
    if (!big_bits(m) || big_compare(m, public_key.n) >= 0) {
        fputs("Error: m must satisfy 0 < m < n.\n", stderr);
        return 1;
    }
    if (big_compare(public_key.e, big_small(1)) <= 0 ||
        big_compare(public_key.e, public_key.n) >= 0) {
        fputs("Error: e must satisfy 1 < e < n.\n", stderr);
        return 1;
    }
    Big c;
    if (rsa_encrypt(m, &public_key, &c)) {
        fputs("Error: encryption failed.\n", stderr);
        return 1;
    }
    return write_value(stdout, "c", c);
}

static int command_decrypt(char **argv) {
    Big c;
    RsaPrivateKey key;
    if (parse_number("c", argv[2], &c) || parse_number("p", argv[3], &key.p) ||
        parse_number("q", argv[4], &key.q) || parse_number("n", argv[5], &key.n) ||
        parse_number("d", argv[6], &key.d) || parse_number("dp", argv[7], &key.dp) ||
        parse_number("dq", argv[8], &key.dq)) {
        return 1;
    }
    const char *problem = private_key_error(&key);
    if (problem) {
        fprintf(stderr, "Error: invalid private key: %s\n", problem);
        return 1;
    }
    if (!big_bits(c) || big_compare(c, key.n) >= 0) {
        fputs("Error: c must satisfy 0 < c < n.\n", stderr);
        return 1;
    }
    Big m;
    int failed = rsa_decrypt_crt(c, &key, &m, stdout);
    key = (RsaPrivateKey){0};
    if (failed) fputs("Error: decryption failed.\n", stderr);
    return failed;
}

/* Cada comando hace un procedimiento por separado: generar, cifrar o descifrar. */
int rsa_crt_cli(int argc, char **argv) {
    int result = 1;
    if (argc == 3 && !strcmp(argv[1], "keygen")) {
        result = command_keygen(argv);
    } else if (argc == 5 && !strcmp(argv[1], "encrypt")) {
        result = command_encrypt(argv);
    } else if (argc == 9 && !strcmp(argv[1], "decrypt")) {
        result = command_decrypt(argv);
    } else {
        usage();
    }
    /* En WebAssembly el modulo sigue vivo: vaciamos la salida al terminar. */
    fflush(stdout);
    fflush(stderr);
    return result;
}
