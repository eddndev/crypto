#ifndef CURVE_ARITHMETIC_H
#define CURVE_ARITHMETIC_H
#include "bigint.h"
typedef struct { Big x, y; unsigned z; } Point;
typedef struct { Field field; Big a, b; } Curve;
/* Se supone p primo > 3; se exige a,b en Zp y curva no singular. */
int curve_init(Curve *curve, Big p, Big a, Big b);
int point_belongs(const Curve *curve, Point point);
int generate_curve(unsigned bits, Curve *curve);
int point_add(const Curve *curve, Point p, Point q, Point *result);
int point_double(const Curve *curve, Point p, Point *result);
void print_big(const char *label, Big value);
void print_point(const char *label, Point point);
/* Interfaz textual compartida por consola y WebAssembly. */
int arithmetic_command(int argc, char **argv);
int run_arithmetic(const char *command);
#endif
