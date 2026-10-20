#include "internal.h"
#include "rsa_crt.h"

/* Intentos para elegir e y para regenerar p y q si fuera necesario. */
#define EXPONENT_ATTEMPTS 4096
#define KEY_ATTEMPTS 64

/* Fuente de bytes para e. En Emscripten /dev/urandom usa crypto.getRandomValues. */
int urandom_bytes(void *context, unsigned char *bytes, size_t length) {
    (void)context;
    FILE *file = fopen("/dev/urandom", "rb");
    if (!file) return 1;
    int failed = fread(bytes, 1, length, file) != length;
    if (fclose(file) != 0) failed = 1;
    return failed;
}

/* Elegimos e al azar: impar, 1 < e < phi, gcd(e, phi) = 1, sin 3 ni 65537. */
static int random_exponent(Big phi, Big *e) {
    for (unsigned attempt = 0; attempt < EXPONENT_ATTEMPTS; ++attempt) {
        Big candidate;
        Big gcd;
        if (random_below_with(phi, urandom_bytes, NULL, &candidate)) return 1;
        if (big_compare(candidate, big_small(1)) <= 0) continue;
        if (!(candidate.word[0] & 1)) continue;
        if (big_compare(candidate, big_small(3)) == 0) continue;
        if (big_compare(candidate, big_small(65537)) == 0) continue;
        if (big_gcd(candidate, phi, &gcd)) return 1;
        if (big_compare(gcd, big_small(1)) == 0) {
            *e = candidate;
            return 0;
        }
    }
    return 1;
}

/* Un intento completo: primos distintos, phi, e, d, dp y dq. */
static int try_keygen(unsigned bits, RsaPublicKey *public_key, RsaPrivateKey *private_key) {
    Big p;
    if (generate_prime(bits, &p)) return 1;
    /* |p| = |q| = bits y p != q (con 4 bits solo existen 11 y 13). */
    Big q = p;
    for (unsigned attempt = 0; big_compare(p, q) == 0; ++attempt) {
        if (attempt == KEY_ATTEMPTS || generate_prime(bits, &q)) return 1;
    }

    /* n = p*q y phi(n) = (p-1)(q-1). */
    Big n;
    Big p1;
    Big q1;
    Big phi;
    if (big_mul_checked(p, q, &n)) return 1;
    if (big_sub_checked(p, big_small(1), &p1)) return 1;
    if (big_sub_checked(q, big_small(1), &q1)) return 1;
    if (big_mul_checked(p1, q1, &phi)) return 1;

    /* e aleatoria y d = e^-1 mod phi(n). */
    Big e;
    Big d;
    if (random_exponent(phi, &e)) return 1;
    if (inverse_mod(e, phi, &d)) return 1;

    /* dp = d mod (p-1) y dq = d mod (q-1). */
    Big quotient;
    Big dp;
    Big dq;
    if (big_divmod(d, p1, &quotient, &dp)) return 1;
    if (big_divmod(d, q1, &quotient, &dq)) return 1;

    public_key->e = e;
    public_key->n = n;
    *private_key = (RsaPrivateKey){p, q, n, d, dp, dq};
    big_clear(&phi);
    return 0;
}

/* Ejercicio 1: genera la llave publica (e, n) y la privada (p, q, n, d, dp, dq). */
int rsa_crt_keygen(unsigned bits, RsaPublicKey *public_key, RsaPrivateKey *private_key) {
    if (!public_key || !private_key) return 1;
    *public_key = (RsaPublicKey){0};
    *private_key = (RsaPrivateKey){0};
    if (bits < RSA_CRT_MIN_BITS || bits > RSA_CRT_MAX_BITS) return 1;

    /* Si algun paso falla (por ejemplo, no encontramos e), regeneramos p y q. */
    for (unsigned attempt = 0; attempt < KEY_ATTEMPTS; ++attempt) {
        if (!try_keygen(bits, public_key, private_key)) return 0;
    }
    return 1;
}
