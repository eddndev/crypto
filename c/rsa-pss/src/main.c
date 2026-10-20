#include "rsa_pss.h"
#include <stdio.h>
#include <string.h>
int main(int argc, char **argv) {
    if (argc == 5 && !strcmp(argv[1], "keygen")) {
        int bits = 0;
        if (!strcmp(argv[2], "2048")) bits = 2048;
        if (!strcmp(argv[2], "3072")) bits = 3072;
        if (!strcmp(argv[2], "4096")) bits = 4096;
        return rsa_pss_run("keygen", bits, argv[3], argv[4], "", "");
    }
    if (argc == 5 && !strcmp(argv[1], "sign"))
        return rsa_pss_run("sign", 0, argv[2], "", argv[3], argv[4]);
    if (argc == 5 && !strcmp(argv[1], "verify"))
        return rsa_pss_run("verify", 0, "", argv[2], argv[3], argv[4]);
    fputs("Usage:\n  rsa-pss keygen <2048|3072|4096> <private.pem> <public.pem>\n"
          "  rsa-pss sign <private.pem> <message> <signature.b64>\n"
          "  rsa-pss verify <public.pem> <message> <signature.b64>\n", stderr);
    return 1;
}
