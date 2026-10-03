#ifndef CURVE_ARITHMETIC_H
#define CURVE_ARITHMETIC_H

#include "bigint.h"

typedef struct {
    Big x;
    Big y;
    unsigned z;
} Point;

typedef struct {
    Field field;
    Big a;
    Big b;
} Curve;

/* State functions return zero on success. The caller supplies a prime p > 3. */
int curve_init(Curve *curve, Big p, Big a, Big b);
/* Point operations require a curve initialized by curve_init. */
int point_belongs(const Curve *curve, Point point);
int point_equal(Point point1, Point point2);
Point point_infinity(void);
int point_add(const Curve *curve, Point point1, Point point2, Point *point3);
int point_double(const Curve *curve, Point point1, Point *point3);

#endif
