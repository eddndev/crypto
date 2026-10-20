#include "internal.h"
#include <ctype.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* Length of the Base64 text for length bytes, without the NUL terminator. */
static size_t encoded_length(size_t length) {
    return 4 * ((length + 2) / 3);
}

int oaep_read_file(const char *path, size_t max, unsigned char **bytes, size_t *length) {
    *bytes = NULL;
    *length = 0;
    if (max >= SIZE_MAX) return 1;

    FILE *file = fopen(path, "rb");
    if (!file) return 1;

    /* One extra byte tells us whether the file is larger than max. */
    unsigned char *buffer = malloc(max + 1);
    if (!buffer) {
        fclose(file);
        return 1;
    }

    size_t count = fread(buffer, 1, max + 1, file);
    int failed = ferror(file) || count > max;
    if (fclose(file) != 0) failed = 1;
    if (failed) {
        OPENSSL_cleanse(buffer, max + 1);
        free(buffer);
        return 1;
    }

    *bytes = buffer;
    *length = count;
    return 0;
}

int oaep_write_file(const char *path, const unsigned char *bytes, size_t length) {
    /* "x" makes fopen fail when the file already exists. */
    FILE *file = fopen(path, "wbx");
    if (!file) return 1;

    int failed = length != 0 && fwrite(bytes, 1, length, file) != length;
    if (fclose(file) != 0) failed = 1;
    if (failed) remove(path);
    return failed;
}

int oaep_base64_encode(const unsigned char *bytes, size_t length, char **text) {
    *text = NULL;
    if (length > (size_t)INT_MAX / 2) return 1;

    size_t size = encoded_length(length);
    unsigned char *buffer = malloc(size + 1);
    if (!buffer) return 1;

    int written = EVP_EncodeBlock(buffer, bytes, (int)length);
    if (written < 0 || (size_t)written != size) {
        free(buffer);
        return 1;
    }

    buffer[size] = '\0';
    *text = (char *)buffer;
    return 0;
}

int oaep_write_base64(const char *path, const unsigned char *bytes, size_t length, char **text) {
    *text = NULL;
    char *encoded = NULL;
    if (oaep_base64_encode(bytes, length, &encoded)) return 1;

    size_t size = strlen(encoded);
    FILE *file = fopen(path, "wbx");
    if (!file) {
        OPENSSL_cleanse(encoded, size);
        free(encoded);
        return 1;
    }

    int failed = fwrite(encoded, 1, size, file) != size;
    if (fputc('\n', file) == EOF) failed = 1;
    if (fclose(file) != 0) failed = 1;
    if (failed) {
        remove(path);
        OPENSSL_cleanse(encoded, size);
        free(encoded);
        return 1;
    }

    *text = encoded;
    return 0;
}

int oaep_read_base64(const char *path, size_t max, unsigned char **bytes, size_t *length) {
    *bytes = NULL;
    *length = 0;
    if (max == 0 || max > (size_t)INT_MAX / 2) return 1;

    /* Accept line breaks and surrounding spaces, but keep a tight size bound. */
    size_t text_max = encoded_length(max);
    size_t file_max = text_max + text_max / 32 + 64;
    unsigned char *text = NULL;
    size_t file_length = 0;
    if (oaep_read_file(path, file_max, &text, &file_length)) return 1;

    size_t count = 0;
    for (size_t i = 0; i < file_length; ++i) {
        if (!isspace(text[i])) text[count++] = text[i];
    }

    unsigned char *decoded = NULL;
    unsigned char *canonical = NULL;
    int failed = 1;
    if (count == 0 || count % 4 != 0 || count > text_max) goto cleanup;

    decoded = malloc(count / 4 * 3);
    canonical = malloc(count + 1);
    if (!decoded || !canonical) goto cleanup;

    int size = EVP_DecodeBlock(decoded, text, (int)count);
    if (size < 0) goto cleanup;

    /* EVP_DecodeBlock counts the padding bytes; remove them. */
    if (text[count - 1] == '=') --size;
    if (text[count - 2] == '=') --size;
    if (size < 1 || (size_t)size > max) goto cleanup;

    /* Only the canonical encoding is accepted (no stray padding or bits). */
    int encoded = EVP_EncodeBlock(canonical, decoded, size);
    if (encoded != (int)count || memcmp(canonical, text, count) != 0) goto cleanup;

    *bytes = decoded;
    *length = (size_t)size;
    decoded = NULL;
    failed = 0;

cleanup:
    OPENSSL_cleanse(text, file_length);
    free(text);
    if (canonical) {
        OPENSSL_cleanse(canonical, count + 1);
        free(canonical);
    }
    if (decoded) {
        OPENSSL_cleanse(decoded, count / 4 * 3);
        free(decoded);
    }
    return failed;
}

int oaep_read_aes_key(const char *path, unsigned char key[AES_KEY_BYTES]) {
    unsigned char *bytes = NULL;
    size_t length = 0;
    if (oaep_read_base64(path, AES_KEY_BYTES, &bytes, &length)) return 1;

    int failed = length != AES_KEY_BYTES;
    if (!failed) memcpy(key, bytes, AES_KEY_BYTES);
    OPENSSL_cleanse(bytes, length);
    free(bytes);
    return failed;
}
