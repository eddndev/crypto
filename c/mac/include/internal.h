#ifndef MAC_INTERNAL_H
#define MAC_INTERNAL_H
#include <stddef.h>

/* Largest key or tag used by the two algorithms, in bytes. */
#define MAC_MAX_BYTES 32

/* Largest Base64 key or tag file accepted: 4 KiB. */
#define B64_FILE_MAX 4096

/* One MAC algorithm and the OpenSSL parameter that selects its primitive. */
struct mac_algorithm {
    const char *name;       /* Command-line name: "hmac" or "cmac". */
    const char *label;      /* Printed name, e.g. "HMAC-SHA-256". */
    const char *mac;        /* EVP_MAC name for EVP_MAC_fetch. */
    const char *param;      /* OSSL_MAC_PARAM_DIGEST or OSSL_MAC_PARAM_CIPHER. */
    const char *value;      /* "SHA256" or "AES-128-CBC". */
    size_t key_bytes;
    size_t tag_bytes;
};

/* Look up an algorithm by its command-line name. Returns NULL if unknown. */
const struct mac_algorithm *mac_find(const char *name);

/* Read the key of algorithm from a Base64 file into key (exactly key_bytes bytes). */
int mac_read_key(const struct mac_algorithm *algorithm, const char *path,
                 unsigned char key[MAC_MAX_BYTES]);

/* Encode bytes as one Base64 line. *text is a new NUL-terminated buffer owned by the caller. */
int mac_base64_encode(const unsigned char *bytes, size_t length, char **text);

/* Create path (never overwrite) with one Base64 line; *text receives the string (caller frees). */
int mac_write_base64(const char *path, const unsigned char *bytes, size_t length, char **text);

/* Read strict Base64 from a file of at most B64_FILE_MAX bytes. *bytes is owned by the caller. */
int mac_read_base64(const char *path, unsigned char **bytes, size_t *length);

#endif
