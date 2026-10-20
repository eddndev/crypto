#ifndef RSA_CRT_H
#define RSA_CRT_H
#include "bigint.h"
#include <stdio.h>

/* Tamano permitido para |p| = |q|; n = p*q debe caber en los 2048 bits de Big. */
#define RSA_CRT_MIN_BITS 4
#define RSA_CRT_MAX_BITS 1024

/* Llave publica (e, n). */
typedef struct {
    Big e;
    Big n;
} RsaPublicKey;

/* Llave privada en formato CRT: (p, q, n, d, dp, dq). */
typedef struct {
    Big p;
    Big q;
    Big n;
    Big d;
    Big dp;
    Big dq;
} RsaPrivateKey;

/* Todas las funciones de estado regresan 0 si terminan bien y 1 si hay error. */

/* Ejercicio 1: genera p y q de bits bits cada uno y una e aleatoria. */
int rsa_crt_keygen(unsigned bits, RsaPublicKey *public_key, RsaPrivateKey *private_key);

/* Ejercicio 2 (Algoritmo 1): result = x^H mod n, con 0 <= x < n y n impar mayor que 3. */
int square_and_multiply(Big x, Big H, Big n, Big *result);

/* Ejercicio 3: c = m^e mod n, con 0 < m < n. */
int rsa_encrypt(Big m, const RsaPublicKey *public_key, Big *c);

/* Ejercicio 4: m = c^d mod n usando el TCR. Si output no es NULL,
 * escribe cada valor intermedio (cp, cq, mp, mq, q_inv, h, m). */
int rsa_decrypt_crt(Big c, const RsaPrivateKey *private_key, Big *m, FILE *output);

/* Frontera de la consola y de WebAssembly. argv[0] es el nombre del programa. */
int rsa_crt_cli(int argc, char **argv);

/* Siembra el generador de OpenSSL que produce p y q (al menos 48 bytes). */
int rsa_crt_seed(const unsigned char *bytes, int length);
#endif
