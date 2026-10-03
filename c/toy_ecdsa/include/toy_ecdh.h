#ifndef TOY_ECDH_H
#define TOY_ECDH_H

#include "curve_arithmetic.h"

typedef enum { SCALAR_RTL, SCALAR_LTR } ScalarMethod;

typedef struct {
    unsigned iteration;
    unsigned bit_index;
    unsigned bit;
    Point accumulator;
    Point point;
} ScalarStep;

/* The step is borrowed for the callback duration; nonzero aborts the operation.
 * Each step contains the state after one complete loop iteration.
 * RTL point is the doubled working P; LTR point is the fixed input P. */
typedef int (*ScalarTrace)(const ScalarStep *step, void *context);

/* Zero means success. No heap allocation or I/O occurs in these functions.
 * The curve must be initialized over a prime field. k = 0 and P = O are valid. */
int scalar_multiply_rtl(const Curve *curve, Big k, Point point, Point *result, ScalarTrace trace,
                        void *context);
int scalar_multiply_ltr(const Curve *curve, Big k, Point point, Point *result, ScalarTrace trace,
                        void *context);

/* Toy ECDH: p has at least 7 bits, 0 < secret < p, and points must be finite.
 * Uses the same operation for A=rG, B=sG, K_A=rB and K_B=sA.
 * This does not certify the subgroup order or implement authentication/KDF. */
int ecdh_point(const Curve *curve, Big secret, Point point, ScalarMethod method, Point *result);

/* Text boundary shared by native CLI and WebAssembly. */
int toy_ecdh_command(int argc, char **argv);
int run_toy_ecdh(const char *command);

#endif
