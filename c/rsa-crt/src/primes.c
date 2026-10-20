#include "internal.h"
#include "rsa_crt.h"
#include <openssl/bn.h>
#include <openssl/crypto.h>
#include <openssl/rand.h>

/* Intentos para obtener un primo con exactamente bits bits. */
#define PRIME_ATTEMPTS 64

/* El enunciado pide un generador de primos ya disponible y no uno propio. La
 * biblioteca estandar de C no tiene uno, asi que usamos el de OpenSSL. Es el
 * unico uso de OpenSSL en esta practica. */
int generate_prime(unsigned bits, Big *prime) {
    if (!prime) return 1;
    *prime = big_small(0);
    if (bits < RSA_CRT_MIN_BITS || bits > RSA_CRT_MAX_BITS) return 1;

    BIGNUM *candidate = BN_new();
    BIGNUM *add = BN_new();
    BIGNUM *rem = BN_new();
    int failed = 1;
    if (!candidate || !add || !rem) goto cleanup;

    /* Sin add/rem OpenSSL fija los dos bits altos: con 4 bits solo sale 13.
     * Con p = 1 mod 2 solo fija el bit alto, asi 4 bits da 11 o 13. */
    if (!BN_set_word(add, 2) || !BN_set_word(rem, 1)) goto cleanup;
    for (unsigned attempt = 0; attempt < PRIME_ATTEMPTS; ++attempt) {
        if (!BN_generate_prime_ex(candidate, (int)bits, 0, add, rem, NULL)) goto cleanup;
        /* Con add puede salir un primo de bits + 1 bits (por ejemplo 17); se descarta. */
        if (BN_num_bits(candidate) == (int)bits) {
            failed = 0;
            break;
        }
    }
    if (failed) goto cleanup;

    /* Pasamos el BIGNUM a Big con bytes big-endian de ancho fijo. */
    unsigned char bytes[RSA_CRT_MAX_BITS / 8];
    size_t length = (bits + 7) / 8;
    failed = BN_bn2binpad(candidate, bytes, (int)length) != (int)length ||
             big_from_be(bytes, length, prime) != 0 || big_bits(*prime) != bits;
    OPENSSL_cleanse(bytes, sizeof(bytes));

cleanup:
    BN_clear_free(candidate);
    BN_free(add);
    BN_free(rem);
    if (failed) big_clear(prime);
    return failed;
}

/* En el navegador agregamos 48 bytes de Web Crypto al generador de OpenSSL. */
int rsa_crt_seed(const unsigned char *bytes, int length) {
    if (!bytes || length < 48) return 1;
    RAND_seed(bytes, length);
    return RAND_status() != 1;
}
