#include "elliptic_curve.h"
#include "curve_arithmetic.h"
#include <errno.h>
#include <stdlib.h>
#include <string.h>

/* Aceptamos solo enteros no negativos que quepan en uint32_t. */
static int parse_uint32(const char *text, uint32_t *value) {
    if (!text[0]) return 0;
    for (const char *c = text; *c; ++c)
        if (*c < '0' || *c > '9') return 0;
    errno = 0;
    char *end;
    unsigned long long parsed = strtoull(text, &end, 10);
    if (errno || *end || parsed > UINT32_MAX) return 0;
    *value = (uint32_t)parsed;
    return 1;
}

static void usage(const char *program) {
    fprintf(stderr, "Usage:\n  %s qr p\n  %s curve p a b [output.txt]\n",
            program, program);
    fprintf(stderr, "  %s generate nbits [seed]\n  %s add p a b Px Py Pz Qx Qy Qz\n  %s double p a b Px Py Pz\n", program, program, program);
    fprintf(stderr, "Assume prime p > 3; require 0 <= a,b < p.\n");
}

int main(int argc, char **argv) {
    uint32_t p, a, b;
    /* qr prueba los residuos sin ejecutar la funcion de la curva. */
    if (argc == 3 && strcmp(argv[1], "qr") == 0 &&
        parse_uint32(argv[2], &p))
        return print_quadratic_residues(p);
    /* curve prueba los puntos y permite elegir el archivo de salida. */
    if ((argc == 5 || argc == 6) && strcmp(argv[1], "curve") == 0 &&
        parse_uint32(argv[2], &p) && parse_uint32(argv[3], &a) &&
        parse_uint32(argv[4], &b))
        return rational_points(p, a, b,
            argc == 6 ? argv[5] : "elliptic-curve-points.txt");
    if (argc >= 2 && (strcmp(argv[1], "generate") == 0 ||
        strcmp(argv[1], "add") == 0 || strcmp(argv[1], "double") == 0))
        return arithmetic_command(argc, argv);
    usage(argv[0]);
    return 1;
}
