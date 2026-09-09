/* Adaptador de pruebas: la implementacion sigue estando en src/bigint.c. */
#include "bigint.h"
#include <stdlib.h>
#include <string.h>
int main(int argc, char **argv) {
    Big p,a,b,r; Field f;
    if (argc==3 && strcmp(argv[1],"prime")==0) {
        if (!big_parse(argv[2],&p)) return 1;
        srand(42); printf("%d\n",probable_prime(p)); return 0;
    }
    if (argc!=5 || !big_parse(argv[2],&p) || !big_parse(argv[3],&a) ||
        !big_parse(argv[4],&b) || !field_init(&f,p)) return 1;
    if (big_compare(a,p)>=0) return 1;
    if (strcmp(argv[1],"pow")==0) r=field_pow(&f,a,b);
    else {
        if (big_compare(b,p)>=0) return 1;
        if (strcmp(argv[1],"mul")==0) r=field_mul(&f,a,b);
        else if (strcmp(argv[1],"add")==0) r=field_add(&f,a,b);
        else if (strcmp(argv[1],"sub")==0) r=field_sub(&f,a,b);
        else return 1;
    }
    char text[BIG_DECIMAL]; big_decimal(r,text); puts(text); return 0;
}
