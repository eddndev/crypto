#ifndef TOY_ECDSA_H
#define TOY_ECDSA_H

#include "curve_arithmetic.h"

typedef struct {
    Curve curve;
    Big q;
    Point generator;
    Point public_point;
} EcdsaPublicKey;

typedef struct {
    Big r;
    Big s;
} EcdsaSignature;

typedef struct {
    Big w;
    Big u1;
    Big u2;
    Point point;
    int valid;
} EcdsaVerification;

/* All status functions return zero on success. The caller seeds rand().
 * The randomness is suitable only for this classroom toy exercise. */
int ecdsa_generate_key_pair(Big p, Big a, Big b, Big q, Point generator, EcdsaPublicKey *public_key,
                            Big *private_key);

/* Rebuild a public key from a known private scalar for a later signing run. */
int ecdsa_public_from_private(Big p, Big a, Big b, Big q, Point generator, Big private_key,
                              EcdsaPublicKey *public_key);

/* Requires 0 < message, private_key < q; retries zero r or s with a new nonce. */
int ecdsa_sign(const EcdsaPublicKey *public_key, Big private_key, Big message,
               EcdsaSignature *signature);

/* Validate both finite points and their membership in the order-q subgroup. */
int ecdsa_public_key(Big p, Big a, Big b, Big q, Point generator, Point public_point,
                     EcdsaPublicKey *public_key);
/* An invalid signature is a successful check with result->valid equal to zero. */
int ecdsa_verify(const EcdsaPublicKey *public_key, Big message, EcdsaSignature signature,
                 EcdsaVerification *result);
/* Search 1 <= d <= min(q-1, 4294967295). Return 2 if outside this interval. */
int ecdsa_discrete_log(const EcdsaPublicKey *public_key, Big *private_key);

int toy_ecdsa_command(int argc, char **argv);
int run_toy_ecdsa(const char *command);

#endif
