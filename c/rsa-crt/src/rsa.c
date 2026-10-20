#include "internal.h"
#include "rsa_crt.h"

int write_value(FILE *output, const char *name, Big value) {
    char text[BIG_DECIMAL];
    if (big_decimal_checked(value, text, sizeof(text))) return 1;
    return fprintf(output, "%s = %s\n", name, text) < 0;
}

/* Ejercicio 3: c = m^e mod n con el Algoritmo 1. */
int rsa_encrypt(Big m, const RsaPublicKey *public_key, Big *c) {
    if (!c) return 1;
    *c = big_small(0);
    if (!public_key) return 1;
    /* Pedimos 0 < m < n y 1 < e < n. */
    if (!big_bits(m) || big_compare(m, public_key->n) >= 0) return 1;
    if (big_compare(public_key->e, big_small(1)) <= 0) return 1;
    if (big_compare(public_key->e, public_key->n) >= 0) return 1;
    return square_and_multiply(m, public_key->e, public_key->n, c);
}

/* Revisa la llave privada antes de descifrar. Regresa NULL si es consistente
 * o el motivo del error: p != q, gcd(p, q) = 1, n = p*q, dp = d mod (p-1)
 * y dq = d mod (q-1). */
const char *private_key_error(const RsaPrivateKey *key) {
    Big product;
    Big p1;
    Big q1;
    Big quotient;
    Big dp;
    Big dq;
    if (!key) return "missing private key.";
    /* Field requiere modulos impares mayores que 3 (p y q primos >= 5). */
    if (big_compare(key->p, big_small(3)) <= 0 || !(key->p.word[0] & 1) ||
        big_compare(key->q, big_small(3)) <= 0 || !(key->q.word[0] & 1)) {
        return "p and q must be odd primes greater than 3.";
    }
    if (big_compare(key->p, key->q) == 0) return "p and q must be different.";
    /* Sin gcd(p, q) = 1 no existe q^-1 mod p y el descifrado fallaria a la mitad. */
    if (big_gcd(key->p, key->q, &product) || big_compare(product, big_small(1)) != 0) {
        return "p and q must be coprime.";
    }
    if (big_mul_checked(key->p, key->q, &product) || big_compare(product, key->n) != 0) {
        return "n must be equal to p*q.";
    }
    if (big_sub_checked(key->p, big_small(1), &p1) ||
        big_divmod(key->d, p1, &quotient, &dp) || big_compare(dp, key->dp) != 0) {
        return "dp must be equal to d mod (p-1).";
    }
    if (big_sub_checked(key->q, big_small(1), &q1) ||
        big_divmod(key->d, q1, &quotient, &dq) || big_compare(dq, key->dq) != 0) {
        return "dq must be equal to d mod (q-1).";
    }
    return NULL;
}

/* Ejercicio 4: descifrado con el TCR (forma de Garner). Cada valor se
 * imprime en cuanto se calcula si output no es NULL. */
int rsa_decrypt_crt(Big c, const RsaPrivateKey *private_key, Big *m, FILE *output) {
    if (!m) return 1;
    *m = big_small(0);
    if (private_key_error(private_key)) return 1;
    if (!big_bits(c) || big_compare(c, private_key->n) >= 0) return 1;

    Field field_p;
    Field field_q;
    if (field_init(&field_p, private_key->p) || field_init(&field_q, private_key->q)) return 1;

    /* cp = c mod p y cq = c mod q. */
    Big cp;
    Big cq;
    if (field_reduce_checked(&field_p, c, &cp)) return 1;
    if (output && write_value(output, "cp", cp)) return 1;
    if (field_reduce_checked(&field_q, c, &cq)) return 1;
    if (output && write_value(output, "cq", cq)) return 1;

    /* mp = cp^dp mod p y mq = cq^dq mod q con el Algoritmo 1. */
    Big mp;
    Big mq;
    if (square_and_multiply(cp, private_key->dp, private_key->p, &mp)) return 1;
    if (output && write_value(output, "mp", mp)) return 1;
    if (square_and_multiply(cq, private_key->dq, private_key->q, &mq)) return 1;
    if (output && write_value(output, "mq", mq)) return 1;

    /* q_inv = q^-1 mod p. */
    Big q_mod_p;
    Big q_inv;
    if (field_reduce_checked(&field_p, private_key->q, &q_mod_p)) return 1;
    if (inverse_mod(q_mod_p, private_key->p, &q_inv)) return 1;
    if (output && write_value(output, "q_inv", q_inv)) return 1;

    /* h = q_inv * (mp - mq) mod p; mq puede ser mayor que p, primero lo reducimos. */
    Big mq_mod_p;
    Big h;
    if (field_reduce_checked(&field_p, mq, &mq_mod_p)) return 1;
    if (field_sub_checked(&field_p, mp, mq_mod_p, &h)) return 1;
    if (field_mul_checked(&field_p, q_inv, h, &h)) return 1;
    if (output && write_value(output, "h", h)) return 1;

    /* m = mq + h*q; como h < p y mq < q, el resultado queda en [0, n). */
    Big hq;
    if (big_mul_checked(h, private_key->q, &hq)) return 1;
    if (big_add_checked(mq, hq, m)) return 1;
    if (output && write_value(output, "m", *m)) return 1;
    return 0;
}
