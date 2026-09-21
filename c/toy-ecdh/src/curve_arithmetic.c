#include "curve_arithmetic.h"

int curve_init(Curve *curve, Big p, Big a, Big b) {
    if (!curve || field_init(&curve->field, p) != 0 || big_compare(a, p) >= 0 ||
        big_compare(b, p) >= 0) {
        return 1;
    }
    curve->a = a;
    curve->b = b;
    const Field *f = &curve->field;
    Big a3 = field_mul(f, field_mul(f, a, a), a);
    Big b2 = field_mul(f, b, b);
    Big discriminant = big_small(0);
    /* Repeated addition also handles constants larger than a small modulus. */
    for (unsigned i = 0; i < 4; ++i) {
        discriminant = field_add(f, discriminant, a3);
    }
    for (unsigned i = 0; i < 27; ++i) {
        discriminant = field_add(f, discriminant, b2);
    }
    return big_bits(discriminant) == 0;
}

Point point_infinity(void) {
    Point result = {big_small(0), big_small(1), 0};
    return result;
}

int point_equal(Point point1, Point point2) {
    return point1.z == point2.z && big_compare(point1.x, point2.x) == 0 &&
           big_compare(point1.y, point2.y) == 0;
}

int point_belongs(const Curve *curve, Point point) {
    if (!curve) {
        return 0;
    }
    if (point.z == 0) {
        return point_equal(point, point_infinity());
    }
    const Field *f = &curve->field;
    if (point.z != 1 || big_compare(point.x, f->p) >= 0 || big_compare(point.y, f->p) >= 0) {
        return 0;
    }
    Big rhs = field_mul(f, field_mul(f, point.x, point.x), point.x);
    rhs = field_add(f, field_add(f, rhs, field_mul(f, curve->a, point.x)), curve->b);
    return big_compare(field_mul(f, point.y, point.y), rhs) == 0;
}

/* x3 = lambda^2-x1-x2 and y3 = lambda*(x1-x3)-y1, all modulo p. */
static Point from_slope(const Curve *curve, Big x1, Big y1, Big x2, Big lambda) {
    const Field *f = &curve->field;
    Big x3 = field_sub(f, field_sub(f, field_mul(f, lambda, lambda), x1), x2);
    Big y3 = field_sub(f, field_mul(f, lambda, field_sub(f, x1, x3)), y1);
    Point point3 = {x3, y3, 1};
    return point3;
}

int point_double(const Curve *curve, Point point1, Point *point3) {
    if (!point3 || !point_belongs(curve, point1)) {
        return 1;
    }
    Big x1 = point1.x;
    Big y1 = point1.y;
    if (point1.z == 0 || big_bits(y1) == 0) {
        *point3 = point_infinity();
        return 0;
    }
    const Field *f = &curve->field;
    Big x1_squared = field_mul(f, x1, x1);
    Big numerator = field_add(f, field_add(f, x1_squared, x1_squared), x1_squared);
    numerator = field_add(f, numerator, curve->a);
    Big denominator = field_add(f, y1, y1);
    Big lambda = field_mul(f, numerator, field_inverse(f, denominator));
    *point3 = from_slope(curve, x1, y1, x1, lambda);
    return 0;
}

int point_add(const Curve *curve, Point point1, Point point2, Point *point3) {
    if (!point3 || !point_belongs(curve, point1) || !point_belongs(curve, point2)) {
        return 1;
    }
    if (point1.z == 0) {
        *point3 = point2;
        return 0;
    }
    if (point2.z == 0) {
        *point3 = point1;
        return 0;
    }
    const Field *f = &curve->field;
    Big x1 = point1.x;
    Big y1 = point1.y;
    Big x2 = point2.x;
    Big y2 = point2.y;
    if (big_compare(x1, x2) == 0) {
        if (big_compare(y1, y2) == 0) {
            return point_double(curve, point1, point3);
        }
        *point3 = point_infinity();
        return 0;
    }
    Big numerator = field_sub(f, y2, y1);
    Big denominator = field_sub(f, x2, x1);
    Big lambda = field_mul(f, numerator, field_inverse(f, denominator));
    *point3 = from_slope(curve, x1, y1, x2, lambda);
    return 0;
}
