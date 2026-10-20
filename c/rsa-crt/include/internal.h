#ifndef RSA_CRT_INTERNAL_H
#define RSA_CRT_INTERNAL_H
#include "bigint.h"
#include "rsa_crt.h"
#include <stddef.h>
#include <stdio.h>

/* primes.c: unico archivo que usa OpenSSL, solo para generar primos. */
int generate_prime(unsigned bits, Big *prime);

/* euclid.c: maximo comun divisor e inverso modular sobre Big. */
int big_gcd(Big a, Big b, Big *gcd);
int inverse_mod(Big a, Big modulus, Big *inverse);

/* keys.c: bytes aleatorios de /dev/urandom para elegir e. */
int urandom_bytes(void *context, unsigned char *bytes, size_t length);

/* rsa.c: NULL si la llave privada es consistente; si no, el motivo en ingles. */
const char *private_key_error(const RsaPrivateKey *key);

/* Escribe "name = <decimal>" en output. */
int write_value(FILE *output, const char *name, Big value);
#endif
