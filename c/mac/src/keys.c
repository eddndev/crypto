#include "mac.h"
#include "internal.h"
#include <openssl/core_names.h>
#include <openssl/crypto.h>
#include <openssl/rand.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* HMAC-SHA-256 (FIPS 198-1): 256-bit key and full 256-bit tag.
 * CMAC-AES-128 (NIST SP 800-38B): 128-bit AES key and full 128-bit tag. */
static const struct mac_algorithm algorithms[] = {
    {"hmac", "HMAC-SHA-256", "HMAC", OSSL_MAC_PARAM_DIGEST, "SHA256", 32, 32},
    {"cmac", "CMAC-AES-128", "CMAC", OSSL_MAC_PARAM_CIPHER, "AES-128-CBC", 16, 16}
};

const struct mac_algorithm *mac_find(const char *name) {
    for (size_t i = 0; i < sizeof(algorithms) / sizeof(algorithms[0]); ++i) {
        if (!strcmp(name, algorithms[i].name)) return &algorithms[i];
    }
    return NULL;
}

int mac_read_key(const struct mac_algorithm *algorithm, const char *path,
                 unsigned char key[MAC_MAX_BYTES]) {
    unsigned char *bytes = NULL;
    size_t length = 0;
    if (mac_read_base64(path, &bytes, &length)) {
        fprintf(stderr, "Error: cannot read the key '%s' (strict Base64, at most 4 KiB).\n", path);
        return 1;
    }

    /* The key length is fixed by the algorithm, so a key of the other one is rejected. */
    int failed = length != algorithm->key_bytes;
    if (failed) {
        fprintf(stderr, "Error: the key '%s' has %zu bytes; %s needs exactly %zu bytes.\n",
                path, length, algorithm->label, algorithm->key_bytes);
    } else {
        memcpy(key, bytes, length);
    }
    OPENSSL_cleanse(bytes, length);
    free(bytes);
    return failed;
}

int mac_keygen(const char *name, const char *key_path) {
    const struct mac_algorithm *algorithm = mac_find(name);
    if (!algorithm) return -1;

    /* The key is key_bytes random bytes from the OpenSSL DRBG. */
    unsigned char key[MAC_MAX_BYTES];
    if (RAND_bytes(key, (int)algorithm->key_bytes) != 1) {
        fputs("Error: the random generator failed.\n", stderr);
        return 1;
    }

    char *text = NULL;
    int failed = mac_write_base64(key_path, key, algorithm->key_bytes, &text);
    OPENSSL_cleanse(key, sizeof(key));
    if (failed) return 1;

    printf("Algorithm = %s\n", algorithm->label);
    printf("KeyBits = %zu\n", algorithm->key_bytes * 8);
    printf("Key = %s\n", text);
    OPENSSL_cleanse(text, strlen(text));
    free(text);
    return 0;
}
