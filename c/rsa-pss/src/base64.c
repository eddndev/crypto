#include "internal.h"
#include <ctype.h>
#include <string.h>

int pss_write_base64(const char *path, const unsigned char *bytes, size_t length) {
    if (length > 512) return 1;
    unsigned char text[685];
    int size = EVP_EncodeBlock(text, bytes, (int)length);
    if (size <= 0) return 1;
    FILE *file = fopen(path, "wbx");
    if (!file) return 1;
    int failed = fwrite(text, 1, (size_t)size, file) != (size_t)size;
    if (fputc('\n', file) == EOF) failed = 1;
    if (fclose(file) != 0) failed = 1;
    if (failed) remove(path);
    else printf("%s\n", text);
    return failed;
}

int pss_read_base64(const char *path, unsigned char *bytes, size_t *length) {
    FILE *file = fopen(path, "rb");
    if (!file) return 1;
    unsigned char text[685], decoded[513], canonical[685];
    size_t count = 0, total = 0;
    int c, failed = 0;
    while ((c = fgetc(file)) != EOF) {
        if (++total > 2048) { failed = 1; break; }
        if (isspace((unsigned char)c)) continue;
        if (count >= 684) { failed = 1; break; }
        text[count++] = (unsigned char)c;
    }
    if (ferror(file)) failed = 1;
    fclose(file);
    if (failed || count == 0 || count % 4 != 0) return 1;
    int size = EVP_DecodeBlock(decoded, text, (int)count);
    if (size < 0) return 1;
    if (text[count - 1] == '=') size--;
    if (text[count - 2] == '=') size--;
    if (size < 1 || (size_t)size > *length) return 1;
    int encoded = EVP_EncodeBlock(canonical, decoded, size);
    if (encoded != (int)count || memcmp(canonical, text, count)) return 1;
    memcpy(bytes, decoded, (size_t)size);
    *length = (size_t)size;
    return 0;
}
