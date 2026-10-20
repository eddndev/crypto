#ifndef RSA_OAEP_INTERNAL_H
#define RSA_OAEP_INTERNAL_H
#include <openssl/evp.h>
#include <stddef.h>

/* AES-128 key length K in bytes. */
#define AES_KEY_BYTES 16

/* Largest plaintext accepted by aes-encrypt: 16 MiB. */
#define AES_MAX_INPUT ((size_t)16 * 1024 * 1024)

/* Largest RSA modulus accepted by the key checks, in bytes (8192 bits). */
#define RSA_MAX_BYTES 1024

/* Read and validate an RSA key from PEM. Returns NULL on error; free with EVP_PKEY_free. */
EVP_PKEY *oaep_read_key(const char *path, int private_required);

/* Read a whole file of at most max bytes into a new buffer owned by the caller.
 * The buffer is cleansed with OPENSSL_cleanse before free when it holds secrets. */
int oaep_read_file(const char *path, size_t max, unsigned char **bytes, size_t *length);

/* Create path (never overwrite) and write length bytes. Removes the file on failure. */
int oaep_write_file(const char *path, const unsigned char *bytes, size_t length);

/* Encode bytes as one Base64 line. *text is a new NUL-terminated buffer owned by the caller. */
int oaep_base64_encode(const unsigned char *bytes, size_t length, char **text);

/* Write bytes to path as one Base64 line; *text receives the Base64 string (caller frees). */
int oaep_write_base64(const char *path, const unsigned char *bytes, size_t length, char **text);

/* Read strict Base64 from path that decodes to 1..max bytes. *bytes is owned by the caller. */
int oaep_read_base64(const char *path, size_t max, unsigned char **bytes, size_t *length);

/* Read K from a Base64 file; it must decode to exactly AES_KEY_BYTES bytes. */
int oaep_read_aes_key(const char *path, unsigned char key[AES_KEY_BYTES]);

#endif
