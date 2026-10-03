#include "curve_arithmetic.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

static int small_argument(const char *text, unsigned *value) {
    Big a;
    if (big_parse(text,&a) != 0 || big_bits(a)>32) return 0;
    *value = a.word[0];
    return 1;
}

static int read_point(char **text, Point *point) {
    return big_parse(text[0],&point->x) == 0 && big_parse(text[1],&point->y) == 0 &&
           small_argument(text[2],&point->z) && point->z<=1;
}

/* Cada subcomando permite probar una funcion por separado. */
int arithmetic_command(int argc, char **argv) {
    Curve curve;
    if (argc>=2 && strcmp(argv[1],"generate")==0) {
        unsigned bits, seed = (unsigned)time(NULL);
        if ((argc!=3 && argc!=4) || !small_argument(argv[2],&bits) ||
            (argc==4 && !small_argument(argv[3],&seed))) goto invalid;
        srand(seed);
        if (!generate_curve(bits,&curve)) goto invalid;
        printf("bits = %u\nseed = %u\nMiller-Rabin: 32 rondas (primo probable)\n",bits,seed);
        print_big("p = ",curve.field.p);
        print_big("a = ",curve.a); print_big("b = ",curve.b);
        puts("4*a^3 + 27*b^2 != 0 (mod p)");
        return 0;
    }
    int add = argc>=2 && strcmp(argv[1],"add")==0;
    int doubling = argc>=2 && strcmp(argv[1],"double")==0;
    if ((add && argc==11) || (doubling && argc==8)) {
        Big p,a,b;
        Point point1,point2,point3;
        if (big_parse(argv[2],&p) != 0 || big_parse(argv[3],&a) != 0 || big_parse(argv[4],&b) != 0 ||
            !curve_init(&curve,p,a,b) || !read_point(argv+5,&point1)) goto invalid;
        int ok;
        if (add) {
            if (!read_point(argv+8,&point2)) goto invalid;
            ok = point_add(&curve,point1,point2,&point3);
        } else ok = point_double(&curve,point1,&point3);
        if (!ok) { fputs("Error: el punto no pertenece a la curva.\n",stderr); return 1; }
        print_point(add ? "P + Q = " : "2P = ",point3);
        return 0;
    }
invalid:
    fputs("Error: revisa parametros, coordenadas y curva no singular.\n"
          "generate nbits [seed] (3..2048 bits)\n"
          "add p a b x1 y1 z1 x2 y2 z2\n"
          "double p a b x1 y1 z1\n",stderr);
    return 1;
}

/* La web envia los decimales como texto para no perder precision. */
int run_arithmetic(const char *command) {
    char buffer[6000], *argv[12];
    if (!command || strlen(command)>=sizeof(buffer)) return 1;
    strcpy(buffer,command);
    int argc = 1;
    argv[0] = "elliptic-curve";
    char *token = strtok(buffer," \t\r\n");
    while (token && argc<12) {
        argv[argc++] = token; token = strtok(NULL," \t\r\n");
    }
    if (token) return 1;
    return arithmetic_command(argc,argv);
}
