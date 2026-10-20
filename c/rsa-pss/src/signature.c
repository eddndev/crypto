#include "rsa_pss.h"
#include "internal.h"
#include <openssl/rsa.h>

static EVP_MD_CTX *prepare(EVP_PKEY *key, int signing) {
    EVP_MD_CTX *context = EVP_MD_CTX_new();
    EVP_PKEY_CTX *pkey_context = NULL;
    if (!context) return NULL;
    int ok;
    if (signing) ok = EVP_DigestSignInit_ex(context, &pkey_context, "SHA256", NULL, NULL, key, NULL);
    else ok = EVP_DigestVerifyInit_ex(context, &pkey_context, "SHA256", NULL, NULL, key, NULL);
    if (ok != 1) goto failure;
    if (EVP_PKEY_CTX_set_rsa_padding(pkey_context, RSA_PKCS1_PSS_PADDING) != 1) goto failure;
    if (EVP_PKEY_CTX_set_rsa_mgf1_md_name(pkey_context, "SHA256", NULL) != 1) goto failure;
    if (EVP_PKEY_CTX_set_rsa_pss_saltlen(pkey_context, 32) != 1) goto failure;
    return context;
failure:
    EVP_MD_CTX_free(context);
    return NULL;
}

static int read_message(EVP_MD_CTX *context, const char *path, int signing) {
    FILE *file = fopen(path, "rb");
    if (!file) return 1;
    unsigned char block[8192];
    size_t length;
    int failed = 0;
    while ((length = fread(block, 1, sizeof(block), file)) != 0) {
        int ok;
        if (signing) ok = EVP_DigestSignUpdate(context, block, length);
        else ok = EVP_DigestVerifyUpdate(context, block, length);
        if (ok != 1) { failed = 1; break; }
    }
    if (ferror(file)) failed = 1;
    if (fclose(file) != 0) failed = 1;
    return failed;
}

int rsa_pss_sign(const char *private_path, const char *message_path, const char *signature_path) {
    EVP_PKEY *key = pss_read_key(private_path, 1);
    if (!key) return 1;
    EVP_MD_CTX *context = prepare(key, 1);
    unsigned char signature[512];
    size_t length = sizeof(signature);
    int failed = 1;
    if (!context) goto cleanup;
    if (read_message(context, message_path, 1)) goto cleanup;
    if (EVP_DigestSignFinal(context, signature, &length) != 1) goto cleanup;
    failed = pss_write_base64(signature_path, signature, length);
cleanup:
    EVP_MD_CTX_free(context);
    EVP_PKEY_free(key);
    return failed;
}

int rsa_pss_verify(const char *public_path, const char *message_path,
                   const char *signature_path, bool *valid) {
    if (!valid) return 1;
    *valid = false;
    EVP_PKEY *key = pss_read_key(public_path, 0);
    if (!key) return 1;
    EVP_MD_CTX *context = prepare(key, 0);
    unsigned char signature[512];
    size_t length = sizeof(signature);
    int failed = 1;
    if (!context) goto cleanup;
    if (read_message(context, message_path, 0)) goto cleanup;
    if (pss_read_base64(signature_path, signature, &length)) goto cleanup;
    failed = 0;
    if (length != (size_t)EVP_PKEY_get_size(key)) goto cleanup;
    int result = EVP_DigestVerifyFinal(context, signature, length);
    if (result < 0) failed = 1;
    *valid = result == 1;
cleanup:
    EVP_MD_CTX_free(context);
    EVP_PKEY_free(key);
    return failed;
}
