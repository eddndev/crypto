#include "rsa_pss.h"
#include "internal.h"
#include <openssl/core_names.h>
#include <openssl/pem.h>
#include <openssl/rsa.h>
#include <ctype.h>
#include <string.h>

/* Additional private-key bounds from FIPS 186-5, Appendix A.1.1. */
static int private_bounds(EVP_PKEY *key, const BIGNUM *p, const BIGNUM *q, int bits) {
    BN_CTX *context = BN_CTX_new();
    BIGNUM *d = NULL;
    if (!context) return 0;
    BN_CTX_start(context);
    BIGNUM *bound = BN_CTX_get(context);
    BIGNUM *square = BN_CTX_get(context);
    BIGNUM *delta = BN_CTX_get(context);
    BIGNUM *p1 = BN_CTX_get(context);
    BIGNUM *q1 = BN_CTX_get(context);
    BIGNUM *gcd = BN_CTX_get(context);
    BIGNUM *lcm = BN_CTX_get(context);
    int ok = 0;
    if (!lcm) goto cleanup;
    if (!BN_one(bound) || !BN_lshift(bound, bound, bits - 1)) goto cleanup;
    if (!BN_sqr(square, p, context) || BN_cmp(square, bound) < 0) goto cleanup;
    if (!BN_sqr(square, q, context) || BN_cmp(square, bound) < 0) goto cleanup;
    if (!BN_sub(delta, p, q)) goto cleanup;
    BN_set_negative(delta, 0);
    if (!BN_one(bound) || !BN_lshift(bound, bound, bits / 2 - 100)) goto cleanup;
    if (BN_cmp(delta, bound) <= 0) goto cleanup;
    if (EVP_PKEY_get_bn_param(key, OSSL_PKEY_PARAM_RSA_D, &d) != 1) goto cleanup;
    if (!BN_one(bound) || !BN_lshift(bound, bound, bits / 2)) goto cleanup;
    if (BN_cmp(d, bound) <= 0) goto cleanup;
    if (!BN_copy(p1, p) || !BN_sub_word(p1, 1)) goto cleanup;
    if (!BN_copy(q1, q) || !BN_sub_word(q1, 1)) goto cleanup;
    if (!BN_gcd(gcd, p1, q1, context)) goto cleanup;
    if (!BN_div(lcm, NULL, p1, gcd, context)) goto cleanup;
    if (!BN_mul(lcm, lcm, q1, context)) goto cleanup;
    ok = BN_cmp(d, lcm) < 0;
cleanup:
    BN_clear_free(d);
    if (bound) BN_clear(bound);
    if (square) BN_clear(square);
    if (delta) BN_clear(delta);
    if (p1) BN_clear(p1);
    if (q1) BN_clear(q1);
    if (gcd) BN_clear(gcd);
    if (lcm) BN_clear(lcm);
    BN_CTX_end(context);
    BN_CTX_free(context);
    return ok;
}

int pss_validate_key(EVP_PKEY *key, int private_required) {
    if (!key || (!EVP_PKEY_is_a(key, "RSA") && !EVP_PKEY_is_a(key, "RSA-PSS"))) return 0;
    int bits = EVP_PKEY_get_bits(key);
    if (bits != 2048 && bits != 3072 && bits != 4096) return 0;
    BIGNUM *e = NULL;
    int ok = EVP_PKEY_get_bn_param(key, OSSL_PKEY_PARAM_RSA_E, &e);
    if (ok != 1 || !BN_is_odd(e) || BN_num_bits(e) < 17 || BN_num_bits(e) > 256) {
        BN_free(e);
        return 0;
    }
    BN_free(e);
    EVP_PKEY_CTX *context = EVP_PKEY_CTX_new_from_pkey(NULL, key, NULL);
    if (!context) return 0;
    ok = EVP_PKEY_public_check(context);
    if (ok == 1 && private_required) ok = EVP_PKEY_pairwise_check(context);
    EVP_PKEY_CTX_free(context);
    if (ok != 1 || !private_required) return ok == 1;
    BIGNUM *p = NULL, *q = NULL, *extra = NULL;
    int got_p = EVP_PKEY_get_bn_param(key, OSSL_PKEY_PARAM_RSA_FACTOR1, &p);
    int got_q = EVP_PKEY_get_bn_param(key, OSSL_PKEY_PARAM_RSA_FACTOR2, &q);
    int got_extra = EVP_PKEY_get_bn_param(key, OSSL_PKEY_PARAM_RSA_FACTOR3, &extra);
    ok = got_p == 1 && got_q == 1 && got_extra != 1;
    if (ok) ok = BN_num_bits(p) == bits / 2 && BN_num_bits(q) == bits / 2;
    if (ok) ok = private_bounds(key, p, q, bits);
    BN_clear_free(p);
    BN_clear_free(q);
    BN_clear_free(extra);
    return ok;
}

/* Avoid interactive password requests: this exercise uses unencrypted PEM. */
static int no_password(char *buffer, int size, int writing, void *context) {
    (void)buffer; (void)size; (void)writing; (void)context;
    return 0;
}

EVP_PKEY *pss_read_key(const char *path, int private_required) {
    FILE *file = fopen(path, "rb");
    if (!file) return NULL;
    unsigned char bytes[8193];
    size_t length = fread(bytes, 1, sizeof(bytes), file);
    int failed = ferror(file) || length == sizeof(bytes);
    fclose(file);
    if (failed) { OPENSSL_cleanse(bytes, sizeof(bytes)); return NULL; }
    BIO *input = BIO_new_mem_buf(bytes, (int)length);
    EVP_PKEY *key = NULL;
    if (input) {
        if (private_required) key = PEM_read_bio_PrivateKey(input, NULL, no_password, NULL);
        else key = PEM_read_bio_PUBKEY(input, NULL, no_password, NULL);
        char c;
        while (BIO_read(input, &c, 1) == 1) {
            if (!isspace((unsigned char)c)) { failed = 1; break; }
        }
    }
    BIO_free(input);
    OPENSSL_cleanse(bytes, sizeof(bytes));
    if (failed || !pss_validate_key(key, private_required)) {
        EVP_PKEY_free(key);
        return NULL;
    }
    return key;
}

int rsa_pss_keygen(int bits, const char *private_path, const char *public_path) {
    if ((bits != 2048 && bits != 3072 && bits != 4096) || !strcmp(private_path, public_path)) return 1;
    EVP_PKEY_CTX *context = EVP_PKEY_CTX_new_from_name(NULL, "RSA", NULL);
    EVP_PKEY *key = NULL;
    int failed = 1;
    FILE *private_file = NULL, *public_file = NULL;
    if (!context) goto cleanup;
    if (EVP_PKEY_keygen_init(context) != 1) goto cleanup;
    if (EVP_PKEY_CTX_set_rsa_keygen_bits(context, bits) != 1) goto cleanup;
    if (EVP_PKEY_CTX_set_rsa_keygen_primes(context, 2) != 1) goto cleanup;
    /* OpenSSL's default public exponent is 65537. */
    if (EVP_PKEY_generate(context, &key) != 1) goto cleanup;
    if (!pss_validate_key(key, 1)) goto cleanup;
    private_file = fopen(private_path, "wbx");
    if (!private_file) goto cleanup;
    public_file = fopen(public_path, "wbx");
    if (!public_file) goto cleanup;
    if (PEM_write_PKCS8PrivateKey(private_file, key, NULL, NULL, 0, NULL, NULL) != 1) goto cleanup;
    if (PEM_write_PUBKEY(public_file, key) != 1) goto cleanup;
    failed = 0;
cleanup:
    if (private_file && fclose(private_file) != 0) failed = 1;
    if (public_file && fclose(public_file) != 0) failed = 1;
    if (failed) {
        if (private_file) remove(private_path);
        if (public_file) remove(public_path);
    }
    EVP_PKEY_free(key);
    EVP_PKEY_CTX_free(context);
    return failed;
}
