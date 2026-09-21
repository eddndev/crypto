#include "elliptic_curve.h"
#include <inttypes.h>
#include <stdlib.h>

/* Calculamos x^3 + ax + b modulo p usando productos de 64 bits. */
static uint32_t rhs(uint32_t x, uint32_t p, uint32_t a, uint32_t b) {
    uint64_t x2 = (uint64_t)x * x % p;
    return (uint32_t)((x2 * x % p + (uint64_t)a * x % p + b) % p);
}

/* La misma salida sirve para la pantalla y para el archivo. */
static void write_points(FILE *out, uint32_t p, uint32_t a, uint32_t b,
                         const uint32_t *roots, uint64_t count) {
    fprintf(out, "p = %" PRIu32 "\na = %" PRIu32 "\nb = %" PRIu32 "\n", p, a, b);
    fprintf(out, "E: y^2 = x^3 + a*x + b (mod p)\n");
    fprintf(out, "Rational points (x, y, z):\n");
    for (uint32_t x = 0; x < p; ++x) {
        uint32_t y = roots[rhs(x, p, a, b)];
        /* Si el resultado no tiene raiz, este x no da un punto. */
        if (y == UINT32_MAX) continue;
        fprintf(out, "(%" PRIu32 ", %" PRIu32 ", 1)\n", x, y);
        /* Con y = 0 evitamos escribir el mismo punto dos veces. */
        if (y != 0)
            fprintf(out, "(%" PRIu32 ", %" PRIu32 ", 1)\n", x, p - y);
    }
    fprintf(out, "(0, 1, 0)\nTotal points (including infinity): %" PRIu64 "\n", count);
}

int rational_points(uint32_t p, uint32_t a, uint32_t b, const char *path) {
    if (p <= 3 || p % 2 == 0 || a >= p || b >= p) {
        fprintf(stderr, "Error: require prime p > 3 and 0 <= a,b < p.\n");
        return 1;
    }
    /* Una curva no singular cumple 4a^3 + 27b^2 != 0 modulo p. */
    uint64_t a3 = ((uint64_t)a * a % p) * a % p;
    uint64_t b2 = (uint64_t)b * b % p;
    if ((4 * a3 + 27 * b2) % p == 0) {
        fprintf(stderr, "Error: singular curve; 4*a^3 + 27*b^2 = 0 (mod p).\n");
        return 1;
    }
    /* Primero obtenemos los residuos y las raices del ejercicio 1. */
    uint32_t *roots;
    if (quadratic_residues(p, &roots, NULL)) return 1;
    uint64_t count = 1; /* Contamos el punto al infinito desde el inicio. */
    for (uint32_t x = 0; x < p; ++x) {
        uint32_t y = roots[rhs(x, p, a, b)];
        if (y != UINT32_MAX) count += y == 0 ? 1 : 2;
    }
    /* Guardamos p, a, b y todos los puntos en el archivo indicado. */
    FILE *file = fopen(path, "w");
    if (!file) {
        fprintf(stderr, "Error: cannot open output file: %s\n", path);
        free(roots);
        return 1;
    }
    write_points(file, p, a, b, roots, count);
    /* Revisamos que la escritura y el cierre hayan terminado bien. */
    int failed = ferror(file);
    if (fclose(file) != 0) failed = 1;
    if (failed) {
        fprintf(stderr, "Error: could not finish writing: %s\n", path);
        free(roots);
        return 1;
    }
    write_points(stdout, p, a, b, roots, count);
    printf("Saved to: %s\n", path);
    free(roots);
    return 0;
}

/* Version con nombre de archivo fijo para usar desde el navegador. */
int print_rational_points(uint32_t p, uint32_t a, uint32_t b) {
    return rational_points(p, a, b, "elliptic-curve-points.txt");
}
