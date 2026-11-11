#include "mac_auth.h"
#include "internal.h"
#include <openssl/core_names.h>
#include <openssl/kdf.h>
#include <openssl/pem.h>
#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* Curve P-256; OpenSSL names it prime256v1. */
#define CURVE_NAME "prime256v1"

/* Uncompressed point 04 || x || y for P-256. */
#define POINT_BYTES 65

/* Largest PEM file accepted when reading a key. */
#define PEM_MAX_BYTES 16384

/* Only EC keys on P-256 with a valid public point (and private scalar) are used. */
static int validate_key(EVP_PKEY *key, int private_required) {
    char group[64];
    size_t length = 0;
    if (!key || !EVP_PKEY_is_a(key, "EC")) return 0;
    if (EVP_PKEY_get_utf8_string_param(key, OSSL_PKEY_PARAM_GROUP_NAME, group, sizeof(group),
                                       &length) != 1) {
        return 0;
    }
    if (strcmp(group, CURVE_NAME) != 0) return 0;

    EVP_PKEY_CTX *context = EVP_PKEY_CTX_new_from_pkey(NULL, key, NULL);
    if (!context) return 0;
    int ok = EVP_PKEY_public_check(context) == 1;
    /* The pairwise check confirms that the private scalar matches the public point. */
    if (ok && private_required) ok = EVP_PKEY_private_check(context) == 1;
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

static EVP_PKEY *read_key(const char *path, int private_required) {
    unsigned char *bytes = NULL;
    size_t length = 0;
    if (mac_read_file(path, PEM_MAX_BYTES, &bytes, &length)) return NULL;

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

int mac_hkdf(const unsigned char *ikm, size_t ikm_length, const char *info,
             unsigned char *out, size_t length) {
    EVP_KDF *algorithm = EVP_KDF_fetch(NULL, "HKDF", NULL);
    EVP_KDF_CTX *context = algorithm ? EVP_KDF_CTX_new(algorithm) : NULL;
    char digest[] = "SHA256";
    /* No salt parameter: HKDF then uses HashLen zero bytes, the same as an empty salt. */
    OSSL_PARAM parameters[] = {
        OSSL_PARAM_construct_utf8_string(OSSL_KDF_PARAM_DIGEST, digest, 0),
        OSSL_PARAM_construct_octet_string(OSSL_KDF_PARAM_KEY, (void *)ikm, ikm_length),
        OSSL_PARAM_construct_octet_string(OSSL_KDF_PARAM_INFO, (void *)info, strlen(info)),
        OSSL_PARAM_construct_end()
    };
    int failed = !context || EVP_KDF_derive(context, out, length, parameters) != 1;
    EVP_KDF_CTX_free(context);
    EVP_KDF_free(algorithm);
    return failed;
}

/* Print the public point Q = dG in uncompressed form (04 || x || y). */
static int print_public(EVP_PKEY *key) {
    unsigned char point[POINT_BYTES];
    size_t length = 0;
    if (EVP_PKEY_get_octet_string_param(key, OSSL_PKEY_PARAM_ENCODED_PUBLIC_KEY, point,
                                        sizeof(point), &length) != 1) {
        return 1;
    }
    if (length != POINT_BYTES || point[0] != 0x04) return 1;
    return mac_print_base64("Public", point, length);
}

int mac_auth_keygen(const char *private_path, const char *public_path) {
    if (!strcmp(private_path, public_path)) return 1;

    /* EVP_EC_gen picks a random scalar d in [1, n - 1] and computes Q = dG. */
    EVP_PKEY *key = EVP_EC_gen(CURVE_NAME);
    FILE *private_file = NULL;
    FILE *public_file = NULL;
    int failed = 1;
    if (!key || !validate_key(key, 1)) goto cleanup;

    private_file = fopen(private_path, "wbx");
    if (!private_file) goto cleanup;
    public_file = fopen(public_path, "wbx");
    if (!public_file) goto cleanup;

    /* PKCS#8 and SubjectPublicKeyInfo, written as PEM in separate files. */
    if (PEM_write_PKCS8PrivateKey(private_file, key, NULL, NULL, 0, NULL, NULL) != 1) goto cleanup;
    if (PEM_write_PUBKEY(public_file, key) != 1) goto cleanup;
    failed = 0;

cleanup:
    if (private_file && fclose(private_file) != 0) failed = 1;
    if (public_file && fclose(public_file) != 0) failed = 1;
    /* Print only after both files exist. */
    if (!failed) failed = printf("Curve = P-256\n") < 0 || print_public(key);
    /* stdout is buffered when redirected: flush to see a write error now. */
    if (fflush(stdout) != 0) failed = 1;
    if (failed) {
        if (private_file) remove(private_path);
        if (public_file) remove(public_path);
    }
    EVP_PKEY_free(key);
    return failed;
}

/* s = x coordinate of d_own * Q_peer (32 bytes for P-256). */
static int derive_secret(EVP_PKEY *own, EVP_PKEY *peer, unsigned char secret[SECRET_BYTES]) {
    size_t length = SECRET_BYTES;
    EVP_PKEY_CTX *context = EVP_PKEY_CTX_new_from_pkey(NULL, own, NULL);
    /* The last argument 1 makes OpenSSL validate the peer key again. */
    int failed = !context || EVP_PKEY_derive_init(context) != 1 ||
                 EVP_PKEY_derive_set_peer_ex(context, peer, 1) != 1 ||
                 EVP_PKEY_derive(context, secret, &length) != 1 || length != SECRET_BYTES;
    EVP_PKEY_CTX_free(context);
    return failed;
}

int mac_auth_derive(const char *private_path, const char *peer_path, const char *key_path) {
    EVP_PKEY *own = read_key(private_path, 1);
    EVP_PKEY *peer = own ? read_key(peer_path, 0) : NULL;
    unsigned char secret[SECRET_BYTES];
    unsigned char key[K_BYTES];
    int failed = 1;
    if (!peer) goto cleanup;

    if (derive_secret(own, peer, secret)) goto cleanup;
    /* K = HKDF-SHA-256(IKM = s, salt = empty, info = "STIC-Lab07-K", L = 32). */
    if (mac_hkdf(secret, SECRET_BYTES, "STIC-Lab07-K", key, K_BYTES)) goto cleanup;

    char *text = NULL;
    if (mac_write_base64(key_path, key, K_BYTES, &text)) goto cleanup;
    failed = printf("Curve = P-256\nKDF = HKDF-SHA-256\n") < 0 ||
             mac_print_base64("s", secret, SECRET_BYTES) || printf("K = %s\n", text) < 0;
    OPENSSL_cleanse(text, strlen(text));
    free(text);
    if (fflush(stdout) != 0) failed = 1;
    if (failed) remove(key_path);

cleanup:
    OPENSSL_cleanse(secret, sizeof(secret));
    OPENSSL_cleanse(key, sizeof(key));
    EVP_PKEY_free(own);
    EVP_PKEY_free(peer);
    return failed;
}
