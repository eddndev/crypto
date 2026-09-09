#include "elliptic_curve.h"
#include <inttypes.h>
#include <stdlib.h>
#include <string.h>

/* Se supone que p es primo; no hacemos una prueba de primalidad. */
int quadratic_residues(uint32_t p, uint32_t **roots, FILE *output) {
    *roots = NULL;
    if (p <= 3 || p % 2 == 0) {
        fprintf(stderr, "Error: p must be a prime greater than 3.\n");
        return 1;
    }
    /* Reservamos una entrada por residuo; quien llama libera la tabla. */
    if ((uint64_t)p * sizeof(**roots) > SIZE_MAX ||
        !(*roots = malloc((size_t)p * sizeof(**roots)))) {
        fprintf(stderr, "Error: insufficient memory for the residue table.\n");
        return 1;
    }
    /* UINT32_MAX marca los residuos que no tienen raiz. */
    memset(*roots, 0xff, (size_t)p * sizeof(**roots));
    /* Solo recorremos hasta p/2: la otra raiz de y es p-y. */
    for (uint32_t y = 0; y <= p / 2; ++y) {
        uint32_t r = (uint32_t)((uint64_t)y * y % p);
        (*roots)[r] = y;
    }
    /* La funcion de la curva usa output = NULL para no imprimir aqui. */
    if (output) {
        fprintf(output, "p = %" PRIu32 "\nQR_p (nonzero squares) = {", p);
        const char *separator = "";
        for (uint32_t r = 1; r < p; ++r) {
            if ((*roots)[r] == UINT32_MAX) continue;
            fprintf(output, "%s%" PRIu32, separator, r);
            separator = ", ";
        }
        fprintf(output, "}\nResidue -> square roots modulo p\n");
        /* El cero tiene una sola raiz; los demas cuadrados tienen dos. */
        fprintf(output, "0 -> {0} (zero is listed separately)\n");
        for (uint32_t r = 1; r < p; ++r) {
            uint32_t y = (*roots)[r];
            if (y != UINT32_MAX)
                fprintf(output, "%" PRIu32 " -> {%" PRIu32 ", %" PRIu32 "}\n",
                        r, y, p - y);
        }
    }
    return 0;
}

/* Permite probar el primer ejercicio usando solamente p. */
int print_quadratic_residues(uint32_t p) {
    uint32_t *roots;
    int status = quadratic_residues(p, &roots, stdout);
    free(roots);
    return status;
}
