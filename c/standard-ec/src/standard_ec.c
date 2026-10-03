#include "standard_ec.h"
#include <ctype.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <openssl/bn.h>
#include <openssl/core_names.h>
#include <openssl/crypto.h>
#include <openssl/ec.h>
#include <openssl/ecdsa.h>
#include <openssl/err.h>
#include <openssl/evp.h>
#include <openssl/kdf.h>
#include <openssl/params.h>
#include <openssl/pem.h>
#include <openssl/rand.h>

#define MAX_KEY_FILE 16384
#define MAX_SIGNATURE_FILE 512
#define MAX_POINT_BYTES 133

typedef struct {
    const char *name;
    const char *group;
    const char *digest;
    int nid;
    unsigned strength;
} CurveSpec;
static const CurveSpec curves[] = {
    {"P-224", "secp224r1", "SHA224", NID_secp224r1, 112},
    {"P-256", "prime256v1", "SHA256", NID_X9_62_prime256v1, 128},
    {"P-384", "secp384r1", "SHA384", NID_secp384r1, 192},
    {"P-521", "secp521r1", "SHA512", NID_secp521r1, 256}
};

static const CurveSpec *curve_spec(const char *name) {
    for (size_t i = 0; i < sizeof(curves) / sizeof(*curves); ++i) {
        if (!strcmp(name, curves[i].name) || !strcmp(name, curves[i].group)) {
            return &curves[i];
        }
    }
    return NULL;
}

static int print_base64(const char *label, const unsigned char *data, size_t length) {
    if (length > MAX_KEY_FILE) {
        return 1;
    }
    unsigned char text[4 * ((MAX_KEY_FILE + 2) / 3) + 1];
    int written = EVP_EncodeBlock(text, data, (int)length);
    if (written < 0) {
        return 1;
    }
    return printf("%s = %s\n", label, text) < 0;
}

static int print_bn(const char *name, const BIGNUM *value) {
    char *text = BN_bn2hex(value);
    if (!text) {
        return 1;
    }
    int failed = printf("%s = %s\n", name, text) < 0;
    OPENSSL_free(text);
    return failed;
}

static int validate_key(EVP_PKEY *key, int private_required, const CurveSpec **spec) {
    char group[80];
    size_t length = 0;
    if (!key || !EVP_PKEY_is_a(key, "EC") ||
        !EVP_PKEY_get_utf8_string_param(key, OSSL_PKEY_PARAM_GROUP_NAME, group,
                                       sizeof(group), &length)) {
        return 1;
    }
    *spec = curve_spec(group);
    if (!*spec) {
        return 1;
    }
    EVP_PKEY_CTX *context = EVP_PKEY_CTX_new_from_pkey(NULL, key, NULL);
    if (!context) {
        return 1;
    }
    int failed = EVP_PKEY_param_check(context) != 1 ||
                 EVP_PKEY_public_check(context) != 1;
    if (private_required && !failed) {
        failed = EVP_PKEY_private_check(context) != 1 ||
                 EVP_PKEY_pairwise_check(context) != 1;
    }
    EVP_PKEY_CTX_free(context);
    return failed;
}

static EVP_PKEY *generate_key(const CurveSpec *spec) {
    EVP_PKEY *key = NULL;
    EVP_PKEY_CTX *context = EVP_PKEY_CTX_new_from_name(NULL, "EC", NULL);
    OSSL_PARAM parameters[] = {
        OSSL_PARAM_construct_utf8_string(OSSL_PKEY_PARAM_GROUP_NAME, (char *)spec->group, 0),
        OSSL_PARAM_construct_end()
    };
    if (!context || EVP_PKEY_keygen_init(context) <= 0 ||
        EVP_PKEY_CTX_set_params(context, parameters) <= 0 ||
        EVP_PKEY_generate(context, &key) <= 0) {
        EVP_PKEY_free(key);
        key = NULL;
    }
    EVP_PKEY_CTX_free(context);
    return key;
}

/* Exclusive creation keeps existing keys and message files intact. */
static int write_key(const char *filename, EVP_PKEY *key, int private_key) {
    FILE *file = fopen(filename, "wbx");
    if (!file) {
        return 1;
    }
    int written = private_key ? PEM_write_PrivateKey(file, key, NULL, NULL, 0, NULL, NULL)
                              : PEM_write_PUBKEY(file, key);
    int failed = written != 1 || ferror(file);
    if (fclose(file) != 0) {
        failed = 1;
    }
    if (failed) {
        remove(filename);
    }
    return failed;
}

static EVP_PKEY *read_key(const char *filename, int private_key) {
    FILE *file = fopen(filename, "rb");
    if (!file) {
        return NULL;
    }
    unsigned char buffer[MAX_KEY_FILE + 1];
    size_t length = fread(buffer, 1, sizeof(buffer), file);
    int failed = ferror(file) || length == sizeof(buffer);
    if (fclose(file) != 0) {
        failed = 1;
    }
    BIO *bio = failed ? NULL : BIO_new_mem_buf(buffer, (int)length);
    EVP_PKEY *key = NULL;
    if (bio) {
        /* This activity writes unencrypted PEM; reject encrypted files without prompting. */
        key = private_key ? PEM_read_bio_PrivateKey(bio, NULL, NULL, "")
                          : PEM_read_bio_PUBKEY(bio, NULL, NULL, NULL);
        char remaining;
        while (key && BIO_read(bio, &remaining, 1) == 1) {
            if (!isspace((unsigned char)remaining)) {
                EVP_PKEY_free(key);
                key = NULL;
            }
        }
    }
    BIO_free(bio);
    OPENSSL_cleanse(buffer, sizeof(buffer));
    return key;
}

static int key_pair(const CurveSpec *spec, const char *private_file, const char *public_file) {
    if (!strcmp(private_file, public_file)) {
        return 1;
    }
    EVP_PKEY *key = generate_key(spec);
    int failed = !key;
    if (!failed) {
        failed = write_key(private_file, key, 1);
        if (!failed && write_key(public_file, key, 0)) {
            remove(private_file);
            failed = 1;
        }
    }
    if (!failed) {
        printf("Curve = %s\nHash = %s\nPrivate key file = %s\nPublic key file = %s\n",
               spec->name, spec->digest, private_file, public_file);
    }
    EVP_PKEY_free(key);
    return failed;
}

static int update_message(EVP_MD_CTX *context, const char *filename, int signing) {
    FILE *file = fopen(filename, "rb");
    if (!file) {
        return 1;
    }
    unsigned char block[8192];
    size_t length;
    int failed = 0;
    while ((length = fread(block, 1, sizeof(block), file)) != 0) {
        int result = signing ? EVP_DigestSignUpdate(context, block, length)
                             : EVP_DigestVerifyUpdate(context, block, length);
        if (result != 1) {
            failed = 1;
            break;
        }
    }
    failed |= ferror(file) != 0;
    if (fclose(file) != 0) {
        failed = 1;
    }
    return failed;
}

static int save_signature(const char *filename, const unsigned char *der, size_t length) {
    const unsigned char *cursor = der;
    ECDSA_SIG *signature = d2i_ECDSA_SIG(NULL, &cursor, (long)length);
    if (!signature || cursor != der + length) {
        ECDSA_SIG_free(signature);
        return 1;
    }
    const BIGNUM *r;
    const BIGNUM *s;
    ECDSA_SIG_get0(signature, &r, &s);
    char *r_hex = BN_bn2hex(r);
    char *s_hex = BN_bn2hex(s);
    FILE *file = r_hex && s_hex ? fopen(filename, "wbx") : NULL;
    int failed = !file;
    if (file) {
        failed = fprintf(file, "r = %s\ns = %s\n", r_hex, s_hex) < 0 || ferror(file);
        if (fclose(file) != 0) {
            failed = 1;
        }
        if (failed) {
            remove(filename);
        } else {
            printf("r = %s\ns = %s\nSignature file = %s\n", r_hex, s_hex, filename);
        }
    }
    OPENSSL_free(r_hex);
    OPENSSL_free(s_hex);
    ECDSA_SIG_free(signature);
    return failed;
}

static int sign_file(const char *private_file, const char *message_file, const char *signature_file) {
    if (!strcmp(signature_file, private_file) || !strcmp(signature_file, message_file)) {
        return 1;
    }
    EVP_PKEY *key = read_key(private_file, 1);
    const CurveSpec *spec = NULL;
    EVP_MD_CTX *context = EVP_MD_CTX_new();
    unsigned char *signature = NULL;
    size_t length = 0;
    int failed = validate_key(key, 1, &spec) || !context;
    if (!failed) {
        failed = EVP_DigestSignInit_ex(context, NULL, spec->digest, NULL, NULL, key, NULL) != 1 ||
                 update_message(context, message_file, 1) ||
                 EVP_DigestSignFinal(context, NULL, &length) != 1;
    }
    if (!failed) {
        signature = OPENSSL_malloc(length);
        failed = !signature || EVP_DigestSignFinal(context, signature, &length) != 1;
    }
    if (!failed) {
        printf("Curve = %s\nHash = %s\n", spec->name, spec->digest);
        failed = save_signature(signature_file, signature, length);
    }
    OPENSSL_free(signature);
    EVP_MD_CTX_free(context);
    EVP_PKEY_free(key);
    return failed;
}

static BIGNUM *parse_hex(char *text, const char *prefix) {
    size_t prefix_length = strlen(prefix);
    if (strncmp(text, prefix, prefix_length)) {
        return NULL;
    }
    char *digits = text + prefix_length;
    size_t length = strlen(digits);
    if (!length || length > 132) {
        return NULL;
    }
    for (size_t i = 0; i < length; ++i) {
        if (!isxdigit((unsigned char)digits[i])) {
            return NULL;
        }
    }
    BIGNUM *number = NULL;
    if (BN_hex2bn(&number, digits) != (int)length) {
        BN_free(number);
        return NULL;
    }
    return number;
}

static ECDSA_SIG *load_signature(const char *filename) {
    FILE *file = fopen(filename, "rb");
    if (!file) {
        return NULL;
    }
    char buffer[MAX_SIGNATURE_FILE + 1];
    size_t length = fread(buffer, 1, sizeof(buffer) - 1, file);
    int failed = ferror(file) || !feof(file);
    if (fclose(file) != 0) {
        failed = 1;
    }
    if (failed || memchr(buffer, '\0', length)) {
        return NULL;
    }
    buffer[length] = '\0';
    char *newline = strchr(buffer, '\n');
    if (!newline) {
        return NULL;
    }
    *newline = '\0';
    char *second = newline + 1;
    char *end = strchr(second, '\n');
    if (end) {
        *end++ = '\0';
        if (*end) {
            return NULL;
        }
    }
    BIGNUM *r = parse_hex(buffer, "r = ");
    BIGNUM *s = parse_hex(second, "s = ");
    ECDSA_SIG *signature = ECDSA_SIG_new();
    if (!r || !s || !signature || !ECDSA_SIG_set0(signature, r, s)) {
        BN_free(r);
        BN_free(s);
        ECDSA_SIG_free(signature);
        return NULL;
    }
    return signature;
}

static int verify_file(const char *public_file, const char *message_file, const char *signature_file) {
    EVP_PKEY *key = read_key(public_file, 0);
    const CurveSpec *spec = NULL;
    ECDSA_SIG *signature = load_signature(signature_file);
    EVP_MD_CTX *context = EVP_MD_CTX_new();
    unsigned char *der = NULL;
    BIGNUM *order = NULL;
    int status = 1;
    if (validate_key(key, 0, &spec) || !signature || !context ||
        !EVP_PKEY_get_bn_param(key, OSSL_PKEY_PARAM_EC_ORDER, &order)) {
        goto cleanup;
    }
    const BIGNUM *r;
    const BIGNUM *s;
    ECDSA_SIG_get0(signature, &r, &s);
    if (BN_is_zero(r) || BN_is_zero(s) || BN_cmp(r, order) >= 0 || BN_cmp(s, order) >= 0) {
        status = 2;
        goto cleanup;
    }
    int length = i2d_ECDSA_SIG(signature, &der);
    if (length <= 0 ||
        EVP_DigestVerifyInit_ex(context, NULL, spec->digest, NULL, NULL, key, NULL) != 1 ||
        update_message(context, message_file, 0)) {
        goto cleanup;
    }
    int verified = EVP_DigestVerifyFinal(context, der, (size_t)length);
    status = verified == 1 ? 0 : verified == 0 ? 2 : 1;
cleanup:
    if (status != 1) {
        printf("Valid = %s\n", status == 0 ? "true" : "false");
    }
    BN_free(order);
    OPENSSL_free(der);
    EVP_MD_CTX_free(context);
    ECDSA_SIG_free(signature);
    EVP_PKEY_free(key);
    return status;
}

static int derive_secret(EVP_PKEY *own, EVP_PKEY *peer, unsigned char *secret, size_t *length) {
    EVP_PKEY_CTX *context = EVP_PKEY_CTX_new_from_pkey(NULL, own, NULL);
    int failed = !context || EVP_PKEY_derive_init(context) != 1 ||
                 EVP_PKEY_derive_set_peer(context, peer) != 1 ||
                 EVP_PKEY_derive(context, secret, length) != 1;
    EVP_PKEY_CTX_free(context);
    return failed;
}

static int hkdf(const unsigned char *secret, size_t length, unsigned char salt[32],
                unsigned char key[32]) {
    EVP_KDF *algorithm = EVP_KDF_fetch(NULL, "HKDF", NULL);
    EVP_KDF_CTX *context = algorithm ? EVP_KDF_CTX_new(algorithm) : NULL;
    char digest[] = "SHA256";
    char mode[] = "EXTRACT_AND_EXPAND";
    unsigned char info[] = "STIC-Lab04-ECDH-v1";
    OSSL_PARAM parameters[] = {
        OSSL_PARAM_construct_utf8_string(OSSL_KDF_PARAM_DIGEST, digest, 0),
        OSSL_PARAM_construct_utf8_string(OSSL_KDF_PARAM_MODE, mode, 0),
        OSSL_PARAM_construct_octet_string(OSSL_KDF_PARAM_KEY, (void *)secret, length),
        OSSL_PARAM_construct_octet_string(OSSL_KDF_PARAM_SALT, salt, 32),
        OSSL_PARAM_construct_octet_string(OSSL_KDF_PARAM_INFO, info, sizeof(info) - 1),
        OSSL_PARAM_construct_end()
    };
    int failed = !context || EVP_KDF_derive(context, key, 32, parameters) != 1;
    EVP_KDF_CTX_free(context);
    EVP_KDF_free(algorithm);
    return failed;
}

/* Show the full abG point requested by the lab, in addition to EVP's x-coordinate. */
static int shared_point(const CurveSpec *spec, EVP_PKEY *own, EVP_PKEY *peer,
                        unsigned char *encoded, size_t *length) {
    unsigned char public_bytes[MAX_POINT_BYTES];
    size_t public_length = 0;
    BIGNUM *private_scalar = NULL;
    EC_GROUP *group = EC_GROUP_new_by_curve_name(spec->nid);
    EC_POINT *public_point = group ? EC_POINT_new(group) : NULL;
    EC_POINT *point = group ? EC_POINT_new(group) : NULL;
    BN_CTX *context = BN_CTX_new();
    int failed = !group || !public_point || !point || !context ||
                 !EVP_PKEY_get_bn_param(own, OSSL_PKEY_PARAM_PRIV_KEY, &private_scalar) ||
                 !EVP_PKEY_get_octet_string_param(peer, OSSL_PKEY_PARAM_PUB_KEY, public_bytes,
                                                 sizeof(public_bytes), &public_length);
    if (!failed) {
        BN_set_flags(private_scalar, BN_FLG_CONSTTIME);
        failed = !EC_POINT_oct2point(group, public_point, public_bytes, public_length, context) ||
                 !EC_POINT_mul(group, point, NULL, public_point, private_scalar, context) ||
                 EC_POINT_is_at_infinity(group, point);
    }
    if (!failed) {
        *length = EC_POINT_point2oct(group, point, POINT_CONVERSION_UNCOMPRESSED,
                                     encoded, *length, context);
        failed = *length == 0;
    }
    BN_clear_free(private_scalar);
    BN_CTX_free(context);
    EC_POINT_clear_free(point);
    EC_POINT_free(public_point);
    EC_GROUP_free(group);
    return failed;
}

static int exchange(const CurveSpec *spec, const char *alice_file, const char *bob_file) {
    if (!strcmp(alice_file, bob_file)) {
        return 1;
    }
    EVP_PKEY *alice = generate_key(spec);
    EVP_PKEY *bob = generate_key(spec);
    unsigned char secret_a[66] = {0};
    unsigned char secret_b[66] = {0};
    unsigned char point_a[MAX_POINT_BYTES];
    unsigned char point_b[MAX_POINT_BYTES];
    unsigned char public_a[MAX_POINT_BYTES];
    unsigned char public_b[MAX_POINT_BYTES];
    unsigned char salt[32];
    unsigned char key_a[32] = {0};
    unsigned char key_b[32] = {0};
    size_t secret_a_length = sizeof(secret_a);
    size_t secret_b_length = sizeof(secret_b);
    size_t point_a_length = sizeof(point_a);
    size_t point_b_length = sizeof(point_b);
    size_t public_a_length = 0;
    size_t public_b_length = 0;
    int failed = !alice || !bob || RAND_bytes(salt, sizeof(salt)) != 1;
    if (!failed) {
        failed = derive_secret(alice, bob, secret_a, &secret_a_length) ||
                 derive_secret(bob, alice, secret_b, &secret_b_length) ||
                 secret_a_length != secret_b_length ||
                 CRYPTO_memcmp(secret_a, secret_b, secret_a_length) ||
                 shared_point(spec, alice, bob, point_a, &point_a_length) ||
                 shared_point(spec, bob, alice, point_b, &point_b_length) ||
                 point_a_length != point_b_length ||
                 CRYPTO_memcmp(point_a, point_b, point_a_length);
    }
    /* SEC1 is 04 || x || y, with fixed-width field elements. */
    if (!failed) {
        failed = point_a_length != 1 + 2 * secret_a_length ||
                 CRYPTO_memcmp(point_a + 1, secret_a, secret_a_length) ||
                 hkdf(secret_a, secret_a_length, salt, key_a) ||
                 hkdf(secret_b, secret_b_length, salt, key_b) ||
                 CRYPTO_memcmp(key_a, key_b, sizeof(key_a)) ||
                 !EVP_PKEY_get_octet_string_param(alice, OSSL_PKEY_PARAM_PUB_KEY, public_a,
                                                  sizeof(public_a), &public_a_length) ||
                 !EVP_PKEY_get_octet_string_param(bob, OSSL_PKEY_PARAM_PUB_KEY, public_b,
                                                  sizeof(public_b), &public_b_length);
    }
    if (!failed) {
        failed = write_key(alice_file, alice, 0);
        if (!failed && write_key(bob_file, bob, 0)) {
            remove(alice_file);
            failed = 1;
        }
    }
    if (!failed) {
        printf("Curve = %s\nKDF = HKDF-SHA256\nInfo = STIC-Lab04-ECDH-v1\n", spec->name);
        failed = print_base64("aG", public_a, public_a_length) ||
                 print_base64("bG", public_b, public_b_length) ||
                 print_base64("K_A (SEC1)", point_a, point_a_length) ||
                 print_base64("K_B (SEC1)", point_b, point_b_length) ||
                 print_base64("Z_A (x)", secret_a, secret_a_length) ||
                 print_base64("Z_B (x)", secret_b, secret_b_length) ||
                 print_base64("Salt", salt, sizeof(salt)) ||
                 print_base64("k_A (256 bits)", key_a, sizeof(key_a)) ||
                 print_base64("k_B (256 bits)", key_b, sizeof(key_b));
        printf("Agreement = %s\n", failed ? "false" : "true");
    }
    OPENSSL_cleanse(secret_a, sizeof(secret_a));
    OPENSSL_cleanse(secret_b, sizeof(secret_b));
    OPENSSL_cleanse(point_a, sizeof(point_a));
    OPENSSL_cleanse(point_b, sizeof(point_b));
    OPENSSL_cleanse(key_a, sizeof(key_a));
    OPENSSL_cleanse(key_b, sizeof(key_b));
    EVP_PKEY_free(alice);
    EVP_PKEY_free(bob);
    return failed;
}

static int derive_files(const char *private_file, const char *peer_file) {
    EVP_PKEY *own = read_key(private_file, 1);
    EVP_PKEY *peer = read_key(peer_file, 0);
    const CurveSpec *own_spec = NULL;
    const CurveSpec *peer_spec = NULL;
    unsigned char secret[66] = {0};
    unsigned char point[MAX_POINT_BYTES];
    size_t length = sizeof(secret);
    size_t point_length = sizeof(point);
    int failed = validate_key(own, 1, &own_spec) || validate_key(peer, 0, &peer_spec) ||
                 own_spec != peer_spec;
    if (!failed) {
        failed = derive_secret(own, peer, secret, &length) ||
                 shared_point(own_spec, own, peer, point, &point_length) ||
                 print_base64("K (SEC1)", point, point_length) ||
                 print_base64("Z (x)", secret, length);
    }
    OPENSSL_cleanse(secret, sizeof(secret));
    OPENSSL_cleanse(point, sizeof(point));
    EVP_PKEY_free(own);
    EVP_PKEY_free(peer);
    return failed;
}

static int parameters(const CurveSpec *spec) {
    EC_GROUP *group = EC_GROUP_new_by_curve_name(spec->nid);
    BN_CTX *context = BN_CTX_new();
    BIGNUM *p = BN_new();
    BIGNUM *a = BN_new();
    BIGNUM *b = BN_new();
    BIGNUM *x = BN_new();
    BIGNUM *y = BN_new();
    BIGNUM *n = BN_new();
    BIGNUM *h = BN_new();
    int failed = !group || !context || !p || !a || !b || !x || !y || !n || !h ||
                 !EC_GROUP_get_curve(group, p, a, b, context) ||
                 !EC_POINT_get_affine_coordinates(group, EC_GROUP_get0_generator(group),
                                                  x, y, context) ||
                 !EC_GROUP_get_order(group, n, context) ||
                 !EC_GROUP_get_cofactor(group, h, context);
    if (!failed) {
        printf("Curve = %s\nGroup = %s\nSecurity bits = %u\nHash = %s\n",
               spec->name, spec->group, spec->strength, spec->digest);
        failed = print_bn("p", p) || print_bn("a", a) || print_bn("b", b) ||
                 print_bn("Gx", x) || print_bn("Gy", y) ||
                 print_bn("n", n) || print_bn("h", h);
    }
    BN_free(p);
    BN_free(a);
    BN_free(b);
    BN_free(x);
    BN_free(y);
    BN_free(n);
    BN_free(h);
    BN_CTX_free(context);
    EC_GROUP_free(group);
    return failed;
}

int standard_ec_seed(const unsigned char *entropy, unsigned length) {
    if (!entropy || length < 48 || length > INT_MAX) {
        return 1;
    }
    RAND_seed(entropy, (int)length);
    return RAND_status() != 1;
}

int standard_ec_cli(int argc, char **argv) {
    ERR_clear_error();
    int status = 1;
    const CurveSpec *spec = argc > 2 ? curve_spec(argv[2]) : NULL;
    if (argc == 3 && !strcmp(argv[1], "parameters") && spec) {
        status = parameters(spec);
    } else if (argc == 5 && !strcmp(argv[1], "keygen") && spec) {
        status = key_pair(spec, argv[3], argv[4]);
    } else if (argc == 5 && !strcmp(argv[1], "sign")) {
        status = sign_file(argv[2], argv[3], argv[4]);
    } else if (argc == 5 && !strcmp(argv[1], "verify")) {
        status = verify_file(argv[2], argv[3], argv[4]);
    } else if (argc == 4 && !strcmp(argv[1], "derive")) {
        status = derive_files(argv[2], argv[3]);
    } else if (argc == 5 && !strcmp(argv[1], "ecdh") && spec) {
        status = exchange(spec, argv[3], argv[4]);
    } else {
        fputs("Usage:\n  standard-ec parameters P-256\n"
              "  standard-ec keygen P-256 private.pem public.pem\n"
              "  standard-ec sign private.pem message.bin signature.txt\n"
              "  standard-ec verify public.pem message.bin signature.txt\n"
              "  standard-ec derive private.pem peer.pem\n"
              "  standard-ec ecdh P-256 alice.pem bob.pem\n", stderr);
    }
    if (status == 1) {
        fputs("Error: invalid input, existing output file, or OpenSSL operation failed.\n", stderr);
        ERR_print_errors_fp(stderr);
    }
    return status;
}

int run_standard_ec(const char *command) {
    if (!command || strlen(command) >= 1024) {
        return 1;
    }
    char buffer[1024];
    strcpy(buffer, command);
    char *argv[9] = {"standard-ec"};
    int argc = 1;
    char *token = strtok(buffer, " \t\r\n");
    while (token) {
        if (argc == 8) {
            return 1;
        }
        argv[argc++] = token;
        token = strtok(NULL, " \t\r\n");
    }
    return standard_ec_cli(argc, argv);
}
