#include "mac_auth.h"
#include "internal.h"
#include <openssl/crypto.h>
#include <openssl/rand.h>
#include <stdio.h>
#include <stdlib.h>

/* tau = HMAC-SHA-256_K(r). Returns 0 on success. */
static int hmac(const unsigned char key[K_BYTES], const unsigned char r[R_BYTES],
                unsigned char tau[TAU_BYTES]) {
    size_t length = 0;
    unsigned char *out = EVP_Q_mac(NULL, "HMAC", NULL, "SHA256", NULL, key, K_BYTES,
                                   r, R_BYTES, tau, TAU_BYTES, &length);
    return !out || length != TAU_BYTES;
}

/* Alice: random challenge r of 256 bits. */
int mac_auth_challenge(const char *r_path) {
    unsigned char r[R_BYTES];
    char *text = NULL;
    if (RAND_bytes(r, R_BYTES) != 1 || mac_write_base64(r_path, r, R_BYTES, &text)) return 1;
    int failed = printf("r = %s\nrBits = %d\n", text, R_BYTES * 8) < 0;
    if (fflush(stdout) != 0) failed = 1;
    if (failed) remove(r_path);
    free(text);
    return failed;
}

/* Bob: answers the challenge with tau = MAC_K(r). */
int mac_auth_respond(const char *key_path, const char *r_path, const char *tau_path) {
    unsigned char key[K_BYTES];
    unsigned char r[R_BYTES];
    unsigned char tau[TAU_BYTES];
    int failed = mac_read_exact(key_path, K_BYTES, key) || mac_read_exact(r_path, R_BYTES, r) ||
                 hmac(key, r, tau) ||
                 mac_save_and_print(tau_path, "MAC = HMAC-SHA-256\n", "tau", tau, TAU_BYTES);
    OPENSSL_cleanse(key, sizeof(key));
    OPENSSL_cleanse(tau, sizeof(tau));
    return failed;
}

/* Alice: recomputes tau' = MAC_K(r) and compares it with Bob's tau.
 * Returns 0 when they match, 2 when they differ and 1 on any error. */
int mac_auth_check(const char *key_path, const char *r_path, const char *tau_path) {
    unsigned char key[K_BYTES];
    unsigned char r[R_BYTES];
    unsigned char tau[TAU_BYTES];
    unsigned char tau_prime[TAU_BYTES];
    int result = 1;
    if (mac_read_exact(key_path, K_BYTES, key) || mac_read_exact(r_path, R_BYTES, r) ||
        mac_read_exact(tau_path, TAU_BYTES, tau) || hmac(key, r, tau_prime)) {
        goto cleanup;
    }
    if (printf("MAC = HMAC-SHA-256\n") < 0 || mac_print_base64("tau", tau, TAU_BYTES) ||
        mac_print_base64("tau_prime", tau_prime, TAU_BYTES)) {
        goto cleanup;
    }

    /* Constant-time comparison: the time does not reveal where the tags differ. */
    if (CRYPTO_memcmp(tau, tau_prime, TAU_BYTES) == 0) {
        result = printf("Result = authenticated\n") < 0;
    } else {
        result = printf("Result = rejected\n") < 0 ? 1 : 2;
    }

cleanup:
    OPENSSL_cleanse(key, sizeof(key));
    OPENSSL_cleanse(tau, sizeof(tau));
    OPENSSL_cleanse(tau_prime, sizeof(tau_prime));
    return result;
}

/* Both sides: KE = HKDF-SHA-256(IKM = tau, salt = empty, info = "STIC-Lab07-KE", L = 16). */
int mac_auth_session_key(const char *tau_path, const char *ke_path) {
    unsigned char tau[TAU_BYTES];
    unsigned char ke[KE_BYTES];
    int failed = mac_read_exact(tau_path, TAU_BYTES, tau) ||
                 mac_hkdf(tau, TAU_BYTES, "STIC-Lab07-KE", ke, KE_BYTES) ||
                 mac_save_and_print(ke_path, "KDF = HKDF-SHA-256\n", "KE", ke, KE_BYTES);
    OPENSSL_cleanse(tau, sizeof(tau));
    OPENSSL_cleanse(ke, sizeof(ke));
    return failed;
}
