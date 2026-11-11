#include "mac_auth.h"
#include "internal.h"
#include <openssl/rand.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* AES-128-GCM file layout: IV (12 bytes) || ciphertext || tag (16 bytes). */
#define GCM_IV_BYTES 12
#define GCM_TAG_BYTES 16

/* Encrypt plaintext into output = IV || C || tag. The output buffer is preallocated. */
static int gcm_encrypt(const unsigned char key[KE_BYTES], const unsigned char *plaintext,
                       size_t length, unsigned char *output) {
    if (length > (size_t)INT_MAX) return 1;
    if (RAND_bytes(output, GCM_IV_BYTES) != 1) return 1;

    EVP_CIPHER_CTX *context = EVP_CIPHER_CTX_new();
    if (!context) return 1;

    unsigned char *ciphertext = output + GCM_IV_BYTES;
    int written = 0;
    int final_length = 0;
    int failed = 1;
    if (EVP_EncryptInit_ex(context, EVP_aes_128_gcm(), NULL, NULL, NULL) != 1) goto cleanup;
    if (EVP_CIPHER_CTX_ctrl(context, EVP_CTRL_AEAD_SET_IVLEN, GCM_IV_BYTES, NULL) != 1) goto cleanup;
    if (EVP_EncryptInit_ex(context, NULL, NULL, key, output) != 1) goto cleanup;
    /* Skip Update for an empty file: a NULL output pointer would mean AAD in GCM. */
    if (length > 0 &&
        EVP_EncryptUpdate(context, ciphertext, &written, plaintext, (int)length) != 1) {
        goto cleanup;
    }
    if (EVP_EncryptFinal_ex(context, ciphertext + written, &final_length) != 1) goto cleanup;
    if ((size_t)written + (size_t)final_length != length) goto cleanup;
    if (EVP_CIPHER_CTX_ctrl(context, EVP_CTRL_AEAD_GET_TAG, GCM_TAG_BYTES,
                            ciphertext + length) != 1) {
        goto cleanup;
    }
    failed = 0;

cleanup:
    EVP_CIPHER_CTX_free(context);
    return failed;
}

/* Decrypt input = IV || C || tag. Returns 1 when the tag does not verify. */
static int gcm_decrypt(const unsigned char key[KE_BYTES], const unsigned char *input,
                       size_t length, unsigned char *plaintext) {
    if (length < GCM_IV_BYTES + GCM_TAG_BYTES) return 1;
    size_t ciphertext_length = length - GCM_IV_BYTES - GCM_TAG_BYTES;
    if (ciphertext_length > (size_t)INT_MAX) return 1;

    EVP_CIPHER_CTX *context = EVP_CIPHER_CTX_new();
    if (!context) return 1;

    const unsigned char *ciphertext = input + GCM_IV_BYTES;
    unsigned char tag[GCM_TAG_BYTES];
    memcpy(tag, ciphertext + ciphertext_length, GCM_TAG_BYTES);
    int written = 0;
    int final_length = 0;
    int failed = 1;
    if (EVP_DecryptInit_ex(context, EVP_aes_128_gcm(), NULL, NULL, NULL) != 1) goto cleanup;
    if (EVP_CIPHER_CTX_ctrl(context, EVP_CTRL_AEAD_SET_IVLEN, GCM_IV_BYTES, NULL) != 1) goto cleanup;
    if (EVP_DecryptInit_ex(context, NULL, NULL, key, input) != 1) goto cleanup;
    if (ciphertext_length > 0 &&
        EVP_DecryptUpdate(context, plaintext, &written, ciphertext,
                          (int)ciphertext_length) != 1) {
        goto cleanup;
    }
    if (EVP_CIPHER_CTX_ctrl(context, EVP_CTRL_AEAD_SET_TAG, GCM_TAG_BYTES, tag) != 1) goto cleanup;
    /* DecryptFinal checks the tag: any change to IV, C or tag fails here. */
    if (EVP_DecryptFinal_ex(context, plaintext + written, &final_length) != 1) goto cleanup;
    failed = (size_t)written + (size_t)final_length != ciphertext_length;

cleanup:
    EVP_CIPHER_CTX_free(context);
    return failed;
}

int mac_auth_encrypt(const char *key_path, const char *input_path, const char *output_path) {
    unsigned char key[KE_BYTES];
    if (mac_read_exact(key_path, KE_BYTES, key)) return 1;

    unsigned char *plaintext = NULL;
    unsigned char *output = NULL;
    size_t length = 0;
    int failed = 1;
    if (mac_read_file(input_path, AES_MAX_INPUT, &plaintext, &length)) goto cleanup;

    size_t output_length = GCM_IV_BYTES + length + GCM_TAG_BYTES;
    output = malloc(output_length);
    if (!output) goto cleanup;
    if (gcm_encrypt(key, plaintext, length, output)) goto cleanup;

    char *text = NULL;
    if (mac_write_base64(output_path, output, output_length, &text)) goto cleanup;
    free(text);
    failed = printf("Cipher = AES-128-GCM\nBytes = %zu\n", length) < 0 ||
             mac_print_base64("IV", output, GCM_IV_BYTES);
    if (fflush(stdout) != 0) failed = 1;
    if (failed) remove(output_path);

cleanup:
    OPENSSL_cleanse(key, sizeof(key));
    if (plaintext) {
        OPENSSL_cleanse(plaintext, length);
        free(plaintext);
    }
    free(output);
    return failed;
}

int mac_auth_decrypt(const char *key_path, const char *input_path, const char *output_path) {
    unsigned char key[KE_BYTES];
    if (mac_read_exact(key_path, KE_BYTES, key)) return 1;

    unsigned char *input = NULL;
    unsigned char *plaintext = NULL;
    size_t length = 0;
    size_t plaintext_length = 0;
    int failed = 1;
    if (mac_read_base64(input_path, GCM_IV_BYTES + AES_MAX_INPUT + GCM_TAG_BYTES,
                        &input, &length)) {
        goto cleanup;
    }
    if (length < GCM_IV_BYTES + GCM_TAG_BYTES) goto cleanup;

    plaintext_length = length - GCM_IV_BYTES - GCM_TAG_BYTES;
    /* One extra byte keeps malloc away from a zero-size request. */
    plaintext = malloc(plaintext_length + 1);
    if (!plaintext) goto cleanup;

    /* The output file is created only after the tag has been verified. */
    if (gcm_decrypt(key, input, length, plaintext)) goto cleanup;
    if (mac_write_file(output_path, plaintext, plaintext_length)) goto cleanup;
    failed = printf("Cipher = AES-128-GCM\nBytes = %zu\n", plaintext_length) < 0;
    if (fflush(stdout) != 0) failed = 1;
    if (failed) remove(output_path);

cleanup:
    OPENSSL_cleanse(key, sizeof(key));
    free(input);
    if (plaintext) {
        OPENSSL_cleanse(plaintext, plaintext_length + 1);
        free(plaintext);
    }
    return failed;
}
