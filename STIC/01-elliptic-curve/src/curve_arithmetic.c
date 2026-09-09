#include "curve_arithmetic.h"

int curve_init(Curve *curve, Big p, Big a, Big b) {
    if (!field_init(&curve->field, p) || big_compare(a,p)>=0 || big_compare(b,p)>=0)
        return 0;
    curve->a = a; curve->b = b;
    const Field *f = &curve->field;
    Big a3 = field_mul(f, field_mul(f,a,a), a), b2 = field_mul(f,b,b);
    /* Sumamos 4a^3 y 27b^2; asi las constantes tambien sirven si p es 5. */
    Big discriminant = big_small(0);
    for (unsigned i=0; i<4; ++i) discriminant = field_add(f,discriminant,a3);
    for (unsigned i=0; i<27; ++i) discriminant = field_add(f,discriminant,b2);
    return big_bits(discriminant) != 0;
}

int point_belongs(const Curve *curve, Point point) {
    if (point.z == 0)
        return !big_bits(point.x) && big_compare(point.y,big_small(1))==0;
    const Field *f = &curve->field;
    if (point.z != 1 || big_compare(point.x,f->p)>=0 || big_compare(point.y,f->p)>=0)
        return 0;
    Big rhs = field_mul(f,field_mul(f,point.x,point.x),point.x);
    rhs = field_add(f,field_add(f,rhs,field_mul(f,curve->a,point.x)),curve->b);
    return big_compare(field_mul(f,point.y,point.y),rhs)==0;
}

/* Fijamos el primer bit y el ultimo: exactamente n bits y candidato impar. */
int generate_curve(unsigned bits, Curve *curve) {
    if (bits < 3 || bits > BIG_BITS) return 0;
    Big p, a, b;
    do {
        p = big_random(bits);
        p.word[(bits-1)/32] |= UINT32_C(1) << ((bits-1)%32);
        p.word[0] |= 1;
    } while (!probable_prime(p));
    do {
        a = random_below(p); b = random_below(p);
    } while (!curve_init(curve,p,a,b));
    return 1;
}

static Point infinity(void) {
    Point result = {big_small(0),big_small(1),0};
    return result;
}

/* Con la pendiente calculamos x3=lambda^2-x1-x2, y3=lambda(x1-x3)-y1. */
static Point from_slope(const Curve *curve, Point p, Point q, Big slope) {
    const Field *f = &curve->field;
    Point result;
    result.x = field_sub(f,field_sub(f,field_mul(f,slope,slope),p.x),q.x);
    result.y = field_sub(f,field_mul(f,slope,field_sub(f,p.x,result.x)),p.y);
    result.z = 1;
    return result;
}

int point_double(const Curve *curve, Point p, Point *result) {
    if (!point_belongs(curve,p)) return 0;
    if (!p.z || !big_bits(p.y)) { *result = infinity(); return 1; }
    const Field *f = &curve->field;
    Big x2 = field_mul(f,p.x,p.x);
    Big numerator = field_add(f,field_add(f,x2,x2),x2);
    numerator = field_add(f,numerator,curve->a);
    Big denominator = field_add(f,p.y,p.y);
    Big slope = field_mul(f,numerator,field_inverse(f,denominator));
    *result = from_slope(curve,p,p,slope);
    return 1;
}

int point_add(const Curve *curve, Point p, Point q, Point *result) {
    if (!point_belongs(curve,p) || !point_belongs(curve,q)) return 0;
    if (!p.z) { *result = q; return 1; }
    if (!q.z) { *result = p; return 1; }
    const Field *f = &curve->field;
    /* Tambien atendemos P=Q y P=-Q, aunque el ejercicio los excluye. */
    if (big_compare(p.x,q.x)==0) {
        if (big_compare(p.y,q.y)==0) return point_double(curve,p,result);
        *result = infinity(); return 1;
    }
    Big numerator = field_sub(f,q.y,p.y);
    Big denominator = field_sub(f,q.x,p.x);
    Big slope = field_mul(f,numerator,field_inverse(f,denominator));
    *result = from_slope(curve,p,q,slope);
    return 1;
}

void print_big(const char *label, Big value) {
    char text[BIG_DECIMAL];
    big_decimal(value,text);
    printf("%s%s\n",label,text);
}

void print_point(const char *label, Point point) {
    char x[BIG_DECIMAL], y[BIG_DECIMAL];
    big_decimal(point.x,x); big_decimal(point.y,y);
    printf("%s(%s, %s, %u)\n",label,x,y,point.z);
}
