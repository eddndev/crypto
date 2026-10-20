#include "rsa_oaep.h"
#include "internal.h"
#include <openssl/rsa.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* RSA-OAEP profile: SHA-256 for the label hash, MGF1 with SHA-256, empty label. */
static EVP_PKEY_CTX *prepare(EVP_PKEY *key, int encrypting) {
    EVP_PKEY_CTX *context = EVP_PKEY_CTX_new_from_pkey(NULL, key, NULL);
    if (!context) return NULL;

    int ok;
    if (encrypting) ok = EVP_PKEY_encrypt_init(context);
    else ok = EVP_PKEY_decrypt_init(context);
    if (ok != 1) goto failure;
    if (EVP_PKEY_CTX_set_rsa_padding(context, RSA_PKCS1_OAEP_PADDING) != 1) goto failure;
    if (EVP_PKEY_CTX_set_rsa_oaep_md(context, EVP_sha256()) != 1) goto failure;
    if (EVP_PKEY_CTX_set_rsa_mgf1_md(context, EVP_sha256()) != 1) goto failure;
    /* No label is set, so OAEP uses the empty string L = "". */
    return context;

failure:
    EVP_PKEY_CTX_free(context);
    return NULL;
}

int rsa_oaep_wrap(const char *public_path, const char *key_path, const char *wrapped_path) {
    EVP_PKEY *key = oaep_read_key(public_path, 0);
    if (!key) return 1;

    unsigned char aes_key[AES_KEY_BYTES];
    unsigned char wrapped[RSA_MAX_BYTES];
    size_t length = sizeof(wrapped);
    EVP_PKEY_CTX *context = NULL;
    char *text = NULL;
    int failed = 1;

    if (oaep_read_aes_key(key_path, aes_key)) goto cleanup;
    context = prepare(key, 1);
    if (!context) goto cleanup;
    if (EVP_PKEY_encrypt(context, wrapped, &length, aes_key, AES_KEY_BYTES) != 1) goto cleanup;
    if (length != (size_t)EVP_PKEY_get_size(key)) goto cleanup;
    if (oaep_write_base64(wrapped_path, wrapped, length, &text)) goto cleanup;

    printf("C = %s\n", text);
    failed = 0;

cleanup:
    OPENSSL_cleanse(aes_key, sizeof(aes_key));
    free(text);
    EVP_PKEY_CTX_free(context);
    EVP_PKEY_free(key);
    return failed;
}

int rsa_oaep_unwrap(const char *private_path, const char *wrapped_path, const char *key_path) {
    EVP_PKEY *key = oaep_read_key(private_path, 1);
    if (!key) return 1;

    unsigned char *wrapped = NULL;
    size_t wrapped_length = 0;
    unsigned char aes_key[RSA_MAX_BYTES];
    size_t length = sizeof(aes_key);
    EVP_PKEY_CTX *context = NULL;
    char *text = NULL;
    int failed = 1;

    if (oaep_read_base64(wrapped_path, RSA_MAX_BYTES, &wrapped, &wrapped_length)) goto cleanup;
    /* An OAEP ciphertext always has the byte length of the modulus n. */
    if (wrapped_length != (size_t)EVP_PKEY_get_size(key)) goto cleanup;

    /* With p, q, dP, dQ and qInv present, OpenSSL decrypts with the CRT. */
    context = prepare(key, 0);
    if (!context) goto cleanup;
    if (EVP_PKEY_decrypt(context, aes_key, &length, wrapped, wrapped_length) != 1) goto cleanup;
    if (length != AES_KEY_BYTES) goto cleanup;
    if (oaep_write_base64(key_path, aes_key, AES_KEY_BYTES, &text)) goto cleanup;

    printf("K = %s\n", text);
    failed = 0;

cleanup:
    OPENSSL_cleanse(aes_key, sizeof(aes_key));
    if (text) {
        OPENSSL_cleanse(text, strlen(text));
        free(text);
    }
    free(wrapped);
    EVP_PKEY_CTX_free(context);
    EVP_PKEY_free(key);
    return failed;
}
