#include "rsa_pss.h"
#include <openssl/rand.h>
#include <stdio.h>
#include <string.h>

int rsa_pss_seed(const unsigned char *bytes, int length) {
    if (!bytes || length < 48) return 1;
    RAND_seed(bytes, length);
    return RAND_status() != 1;
}

int rsa_pss_run(const char *operation, int bits, const char *private_path,
                const char *public_path, const char *message_path, const char *signature_path) {
    int result = 1;
    if (!strcmp(operation, "keygen")) {
        result = rsa_pss_keygen(bits, private_path, public_path);
        if (!result) printf("RSA-PSS keys generated (%d bits).\n", bits);
    } else if (!strcmp(operation, "sign")) {
        result = rsa_pss_sign(private_path, message_path, signature_path);
    } else if (!strcmp(operation, "verify")) {
        bool valid = false;
        result = rsa_pss_verify(public_path, message_path, signature_path, &valid);
        if (!result) {
            puts(valid ? "true" : "false");
            return valid ? 0 : 2;
        }
    }
    if (result) fputs("Operation failed: check inputs, key profile and output paths. Existing files are not overwritten.\n", stderr);
    return result;
}
