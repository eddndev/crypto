#include "mac.h"
#include "internal.h"
#include <openssl/crypto.h>
#include <openssl/evp.h>
#include <openssl/params.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* The file is read in chunks, so its size has no limit. */
#define CHUNK_BYTES 65536

/* Compute the tag of a file: EVP_MAC_init with the key and the primitive,
 * EVP_MAC_update for every chunk and EVP_MAC_final for the tag. */
static int compute_tag(const struct mac_algorithm *algorithm, const unsigned char *key,
                       const char *path, unsigned char tag[MAC_MAX_BYTES],
                       unsigned long long *bytes) {
    *bytes = 0;
    FILE *file = fopen(path, "rb");
    if (!file) {
        fprintf(stderr, "Error: cannot open the file '%s'.\n", path);
        return 1;
    }

    EVP_MAC *mac = EVP_MAC_fetch(NULL, algorithm->mac, NULL);
    EVP_MAC_CTX *context = mac ? EVP_MAC_CTX_new(mac) : NULL;
    unsigned char *chunk = malloc(CHUNK_BYTES);
    size_t length = 0;
    int failed = 1;
    if (!context || !chunk) goto cleanup;

    /* HMAC takes the hash name (digest); CMAC takes the block cipher name (cipher). */
    OSSL_PARAM params[2];
    params[0] = OSSL_PARAM_construct_utf8_string(algorithm->param, (char *)algorithm->value, 0);
    params[1] = OSSL_PARAM_construct_end();
    if (EVP_MAC_init(context, key, algorithm->key_bytes, params) != 1) goto cleanup;
    if (EVP_MAC_CTX_get_mac_size(context) != algorithm->tag_bytes) goto cleanup;

    size_t count;
    while ((count = fread(chunk, 1, CHUNK_BYTES, file)) > 0) {
        if (EVP_MAC_update(context, chunk, count) != 1) goto cleanup;
        *bytes += count;
    }
    if (ferror(file)) {
        fprintf(stderr, "Error: cannot read the file '%s'.\n", path);
        failed = 2;
        goto cleanup;
    }

    if (EVP_MAC_final(context, tag, &length, MAC_MAX_BYTES) != 1) goto cleanup;
    failed = length != algorithm->tag_bytes;

cleanup:
    /* failed = 2 means the read error was already reported. */
    if (failed == 1) fputs("Error: the OpenSSL MAC operation failed.\n", stderr);
    else if (failed == 2) failed = 1;
    if (chunk) {
        OPENSSL_cleanse(chunk, CHUNK_BYTES);
        free(chunk);
    }
    EVP_MAC_CTX_free(context);
    EVP_MAC_free(mac);
    fclose(file);
    return failed;
}

int mac_tag(const char *name, const char *key_path, const char *file_path,
            const char *tag_path) {
    const struct mac_algorithm *algorithm = mac_find(name);
    if (!algorithm) return -1;

    unsigned char key[MAC_MAX_BYTES];
    unsigned char tag[MAC_MAX_BYTES];
    unsigned long long bytes = 0;
    char *text = NULL;
    int failed = 1;
    if (mac_read_key(algorithm, key_path, key)) goto cleanup;
    if (compute_tag(algorithm, key, file_path, tag, &bytes)) goto cleanup;
    if (mac_write_base64(tag_path, tag, algorithm->tag_bytes, &text)) goto cleanup;

    printf("Algorithm = %s\n", algorithm->label);
    printf("File = %s\n", file_path);
    printf("Bytes = %llu\n", bytes);
    printf("TagBits = %zu\n", algorithm->tag_bytes * 8);
    printf("Tag = %s\n", text);
    free(text);
    failed = 0;

cleanup:
    OPENSSL_cleanse(key, sizeof(key));
    return failed;
}

int mac_verify(const char *name, const char *key_path, const char *file_path,
               const char *tag_path) {
    const struct mac_algorithm *algorithm = mac_find(name);
    if (!algorithm) return -1;

    unsigned char key[MAC_MAX_BYTES];
    unsigned char computed[MAC_MAX_BYTES];
    unsigned char *expected = NULL;
    size_t expected_length = 0;
    unsigned long long bytes = 0;
    char *expected_text = NULL;
    char *computed_text = NULL;
    int result = 1;

    if (mac_read_key(algorithm, key_path, key)) goto cleanup;
    if (mac_read_base64(tag_path, &expected, &expected_length)) {
        fprintf(stderr, "Error: cannot read the tag '%s' (strict Base64, at most 4 KiB).\n",
                tag_path);
        goto cleanup;
    }
    /* A tag of another length cannot come from this algorithm. */
    if (expected_length != algorithm->tag_bytes) {
        fprintf(stderr, "Error: the tag '%s' has %zu bytes; %s tags have %zu bytes.\n",
                tag_path, expected_length, algorithm->label, algorithm->tag_bytes);
        goto cleanup;
    }
    if (compute_tag(algorithm, key, file_path, computed, &bytes)) goto cleanup;
    if (mac_base64_encode(expected, expected_length, &expected_text) ||
        mac_base64_encode(computed, algorithm->tag_bytes, &computed_text)) {
        goto cleanup;
    }

    /* CRYPTO_memcmp takes the same time wherever the tags differ. */
    int valid = CRYPTO_memcmp(expected, computed, algorithm->tag_bytes) == 0;
    printf("Algorithm = %s\n", algorithm->label);
    printf("File = %s\n", file_path);
    printf("Bytes = %llu\n", bytes);
    printf("Expected = %s\n", expected_text);
    printf("Computed = %s\n", computed_text);
    printf("Result = %s\n", valid ? "valid" : "invalid");
    result = valid ? 0 : 2;

cleanup:
    OPENSSL_cleanse(key, sizeof(key));
    free(expected);
    free(expected_text);
    free(computed_text);
    return result;
}
