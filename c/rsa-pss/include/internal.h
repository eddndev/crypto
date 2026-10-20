#ifndef RSA_PSS_INTERNAL_H
#define RSA_PSS_INTERNAL_H
#include <openssl/evp.h>
#include <stdio.h>
EVP_PKEY *pss_read_key(const char *path, int private_required);
int pss_validate_key(EVP_PKEY *key, int private_required);
int pss_write_base64(const char *path, const unsigned char *bytes, size_t length);
int pss_read_base64(const char *path, unsigned char *bytes, size_t *length);
#endif
