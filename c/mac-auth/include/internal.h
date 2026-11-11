#ifndef MAC_AUTH_INTERNAL_H
#define MAC_AUTH_INTERNAL_H
#include <openssl/evp.h>
#include <stddef.h>

/* Lengths in bytes: s and K (32), r and tau (32), KE for AES-128 (16). */
#define SECRET_BYTES 32
#define K_BYTES 32
#define R_BYTES 32
#define TAU_BYTES 32
#define KE_BYTES 16

/* Largest plaintext accepted by encrypt: 16 MiB. */
#define AES_MAX_INPUT ((size_t)16 * 1024 * 1024)

/* HKDF-SHA-256 with an empty salt: out = HKDF(ikm, info, length). Returns 0 on success. */
int mac_hkdf(const unsigned char *ikm, size_t ikm_length, const char *info,
             unsigned char *out, size_t length);

/* Read a whole file of at most max bytes into a new buffer owned by the caller.
 * The buffer is cleansed with OPENSSL_cleanse before free when it holds secrets. */
int mac_read_file(const char *path, size_t max, unsigned char **bytes, size_t *length);

/* Create path (never overwrite) and write length bytes. Removes the file on failure. */
int mac_write_file(const char *path, const unsigned char *bytes, size_t length);

/* Encode bytes as one Base64 line. *text is a new NUL-terminated buffer owned by the caller. */
int mac_base64_encode(const unsigned char *bytes, size_t length, char **text);

/* Write bytes to path as one Base64 line; *text receives the Base64 string (caller frees). */
int mac_write_base64(const char *path, const unsigned char *bytes, size_t length, char **text);

/* Read strict Base64 from path that decodes to 1..max bytes. *bytes is owned by the caller. */
int mac_read_base64(const char *path, size_t max, unsigned char **bytes, size_t *length);

/* Read a Base64 file that must decode to exactly size bytes into out. */
int mac_read_exact(const char *path, size_t size, unsigned char *out);

/* Print "label = <base64>" for bytes. Returns 0 on success. */
int mac_print_base64(const char *label, const unsigned char *bytes, size_t length);

/* Write bytes to path as Base64, then print header (when not NULL) and "label = <base64>".
 * Returns 0 on success. */
int mac_save_and_print(const char *path, const char *header, const char *label,
                       const unsigned char *bytes, size_t length);

#endif
