#ifndef ELLIPTIC_CURVE_H
#define ELLIPTIC_CURVE_H

#include <stdint.h>
#include <stdio.h>

/* Se supone que p es primo. roots[r] guarda su menor raiz o UINT32_MAX
 * si no existe. Quien llama libera *roots con free.
 * Si output es NULL, se calcula la tabla sin imprimirla. */
int quadratic_residues(uint32_t p, uint32_t **roots, FILE *output);
int print_quadratic_residues(uint32_t p);

/* Guarda los puntos, incluido (0, 1, 0), en un archivo de texto.
 * Los coeficientes deben cumplir 0 <= a,b < p. */
int rational_points(uint32_t p, uint32_t a, uint32_t b, const char *path);
int print_rational_points(uint32_t p, uint32_t a, uint32_t b);

#endif
