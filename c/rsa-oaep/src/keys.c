#include "rsa_oaep.h"
#include "internal.h"
#include <openssl/bn.h>
#include <openssl/core_names.h>
#include <openssl/pem.h>
#include <openssl/rsa.h>
#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* Modulus length n for new key pairs: 3072 bits gives 128-bit security
 * (NIST SP 800-56B Rev. 2, Section 6.3, Table 2). */
#define RSA_OAEP_MODULUS_BITS 3072

/* Largest PEM file accepted when reading a key. */
#define PEM_MAX_BYTES 16384

/* Public-key profile: even modulus length of 2048..8192 bits and an odd
 * exponent 65537 <= e < 2^256 (SP 800-56B Rev. 2, Sections 6.2 and 6.3). */
static int public_profile(EVP_PKEY *key) {
    if (!key || !EVP_PKEY_is_a(key, "RSA")) return 0;

    int bits = EVP_PKEY_get_bits(key);
    if (bits < 2048 || bits > RSA_MAX_BYTES * 8 || bits % 2 != 0) return 0;

    BIGNUM *e = NULL;
    if (EVP_PKEY_get_bn_param(key, OSSL_PKEY_PARAM_RSA_E, &e) != 1) return 0;
    /* Values of at most 17 bits fit in a word, so BN_get_word is exact there. */
    int ok = BN_is_odd(e) && BN_num_bits(e) <= 256;
    if (ok) ok = BN_num_bits(e) > 17 || BN_get_word(e) >= 65537;
    BN_free(e);
    return ok;
}

/* The CRT format needs (n, e, d, p, q, dP, dQ, qInv) with exactly two primes. */
static int crt_profile(EVP_PKEY *key) {
    const char *names[] = {
        OSSL_PKEY_PARAM_RSA_D,
        OSSL_PKEY_PARAM_RSA_FACTOR1,
        OSSL_PKEY_PARAM_RSA_FACTOR2,
        OSSL_PKEY_PARAM_RSA_EXPONENT1,
        OSSL_PKEY_PARAM_RSA_EXPONENT2,
        OSSL_PKEY_PARAM_RSA_COEFFICIENT1
    };
    int bits = EVP_PKEY_get_bits(key);
    int ok = 1;

    for (size_t i = 0; ok && i < sizeof(names) / sizeof(names[0]); ++i) {
        BIGNUM *value = NULL;
        ok = EVP_PKEY_get_bn_param(key, names[i], &value) == 1 && !BN_is_zero(value);
        /* Both primes must have half the modulus length. */
        if (ok && (i == 1 || i == 2)) ok = BN_num_bits(value) == bits / 2;
        BN_clear_free(value);
    }

    BIGNUM *third = NULL;
    if (ok && EVP_PKEY_get_bn_param(key, OSSL_PKEY_PARAM_RSA_FACTOR3, &third) == 1) ok = 0;
    BN_clear_free(third);
    return ok;
}

static int validate_key(EVP_PKEY *key, int private_required) {
    if (!public_profile(key)) return 0;

    EVP_PKEY_CTX *context = EVP_PKEY_CTX_new_from_pkey(NULL, key, NULL);
    if (!context) return 0;
    int ok = EVP_PKEY_public_check(context) == 1;
    if (ok && private_required) ok = crt_profile(key);
    /* The pairwise check confirms that d, p, q, dP, dQ and qInv match (n, e). */
    if (ok && private_required) ok = EVP_PKEY_pairwise_check(context) == 1;
    EVP_PKEY_CTX_free(context);
    return ok;
}

/* Avoid interactive password prompts: this exercise uses unencrypted PEM. */
static int no_password(char *buffer, int size, int writing, void *context) {
    (void)buffer;
    (void)size;
    (void)writing;
    (void)context;
    return 0;
}

EVP_PKEY *oaep_read_key(const char *path, int private_required) {
    unsigned char *bytes = NULL;
    size_t length = 0;
    if (oaep_read_file(path, PEM_MAX_BYTES, &bytes, &length)) return NULL;

    EVP_PKEY *key = NULL;
    int failed = 0;
    BIO *input = BIO_new_mem_buf(bytes, (int)length);
    if (input) {
        if (private_required) key = PEM_read_bio_PrivateKey(input, NULL, no_password, NULL);
        else key = PEM_read_bio_PUBKEY(input, NULL, no_password, NULL);

        /* Only whitespace may follow the PEM block. */
        char c;
        while (BIO_read(input, &c, 1) == 1) {
            if (!isspace((unsigned char)c)) {
                failed = 1;
                break;
            }
        }
    }
    BIO_free(input);
    OPENSSL_cleanse(bytes, length);
    free(bytes);

    if (failed || !validate_key(key, private_required)) {
        EVP_PKEY_free(key);
        return NULL;
    }
    return key;
}

int rsa_oaep_keygen(const char *private_path, const char *public_path) {
    if (!strcmp(private_path, public_path)) return 1;

    EVP_PKEY_CTX *context = EVP_PKEY_CTX_new_from_name(NULL, "RSA", NULL);
    EVP_PKEY *key = NULL;
    FILE *private_file = NULL;
    FILE *public_file = NULL;
    int failed = 1;

    if (!context) goto cleanup;
    if (EVP_PKEY_keygen_init(context) != 1) goto cleanup;
    /* This line sets the length of the modulus n. */
    if (EVP_PKEY_CTX_set_rsa_keygen_bits(context, RSA_OAEP_MODULUS_BITS) != 1) goto cleanup;
    /* Two primes p and q; OpenSSL keeps dP, dQ and qInv for the CRT. */
    if (EVP_PKEY_CTX_set_rsa_keygen_primes(context, 2) != 1) goto cleanup;
    /* OpenSSL's default public exponent is e = 65537. */
    if (EVP_PKEY_generate(context, &key) != 1) goto cleanup;
    if (!validate_key(key, 1)) goto cleanup;

    private_file = fopen(private_path, "wbx");
    if (!private_file) goto cleanup;
    public_file = fopen(public_path, "wbx");
    if (!public_file) goto cleanup;

    /* PKCS#8 and SubjectPublicKeyInfo DER, written as Base64 PEM. */
    if (PEM_write_PKCS8PrivateKey(private_file, key, NULL, NULL, 0, NULL, NULL) != 1) goto cleanup;
    if (PEM_write_PUBKEY(public_file, key) != 1) goto cleanup;
    failed = 0;

cleanup:
    if (private_file && fclose(private_file) != 0) failed = 1;
    if (public_file && fclose(public_file) != 0) failed = 1;
    if (failed) {
        if (private_file) remove(private_path);
        if (public_file) remove(public_path);
    } else {
        printf("RSA-OAEP key pair generated (%d-bit modulus, CRT private key).\n",
               RSA_OAEP_MODULUS_BITS);
    }
    EVP_PKEY_free(key);
    EVP_PKEY_CTX_free(context);
    return failed;
}

/* Print one component as lowercase hexadecimal without leading zeros. */
static int print_component(EVP_PKEY *key, const char *param, const char *label) {
    BIGNUM *value = NULL;
    if (EVP_PKEY_get_bn_param(key, param, &value) != 1) return 1;

    char *hex = BN_bn2hex(value);
    BN_clear_free(value);
    if (!hex) return 1;

    size_t length = strlen(hex);
    size_t start = 0;
    while (start + 1 < length && hex[start] == '0') ++start;
    for (size_t i = start; i < length; ++i) {
        hex[i] = (char)tolower((unsigned char)hex[i]);
    }

    int failed = printf("%s = %s\n", label, hex + start) < 0;
    OPENSSL_cleanse(hex, length);
    OPENSSL_free(hex);
    return failed;
}

int rsa_oaep_inspect(const char *private_path) {
    EVP_PKEY *key = oaep_read_key(private_path, 1);
    if (!key) return 1;

    /* CRT format of SP 800-56B Rev. 2, Section 6.2.2: (n, e, d, p, q, dP, dQ, qInv). */
    const char *params[] = {
        OSSL_PKEY_PARAM_RSA_N,
        OSSL_PKEY_PARAM_RSA_E,
        OSSL_PKEY_PARAM_RSA_D,
        OSSL_PKEY_PARAM_RSA_FACTOR1,
        OSSL_PKEY_PARAM_RSA_FACTOR2,
        OSSL_PKEY_PARAM_RSA_EXPONENT1,
        OSSL_PKEY_PARAM_RSA_EXPONENT2,
        OSSL_PKEY_PARAM_RSA_COEFFICIENT1
    };
    const char *labels[] = {"n", "e", "d", "p", "q", "dP", "dQ", "qInv"};

    int failed = 0;
    for (size_t i = 0; !failed && i < sizeof(params) / sizeof(params[0]); ++i) {
        failed = print_component(key, params[i], labels[i]);
    }
    EVP_PKEY_free(key);
    return failed;
}
