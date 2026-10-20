#ifndef RSA_PSS_H
#define RSA_PSS_H
#include <stdbool.h>
int rsa_pss_keygen(int bits, const char *private_path, const char *public_path);
int rsa_pss_sign(const char *private_path, const char *message_path, const char *signature_path);
/* Return 0 for a completed check; valid holds the boolean result. */
int rsa_pss_verify(const char *public_path, const char *message_path,
                   const char *signature_path, bool *valid);
int rsa_pss_run(const char *operation, int bits, const char *private_path,
                const char *public_path, const char *message_path, const char *signature_path);
int rsa_pss_seed(const unsigned char *bytes, int length);
#endif
