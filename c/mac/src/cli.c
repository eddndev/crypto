#include "mac.h"
#include <openssl/err.h>
#include <openssl/rand.h>
#include <stdio.h>
#include <string.h>

int mac_seed(const unsigned char *bytes, int length) {
    if (!bytes || length < 48) return 1;
    RAND_seed(bytes, length);
    return RAND_status() != 1;
}

static void usage(void) {
    fputs("Usage:\n"
          "  mac keygen <hmac|cmac> <key.b64>\n"
          "  mac tag    <hmac|cmac> <key.b64> <file> <tag.b64>\n"
          "  mac verify <hmac|cmac> <key.b64> <file> <tag.b64>\n"
          "  hmac = HMAC-SHA-256 (256-bit key), cmac = CMAC-AES-128 (128-bit key)\n",
          stderr);
}

/* Each command takes a fixed number of arguments after its name. */
static int dispatch(int argc, char **argv) {
    const char *command = argv[1];
    if (!strcmp(command, "keygen") && argc == 4) return mac_keygen(argv[2], argv[3]);
    if (!strcmp(command, "tag") && argc == 6) return mac_tag(argv[2], argv[3], argv[4], argv[5]);
    if (!strcmp(command, "verify") && argc == 6) {
        return mac_verify(argv[2], argv[3], argv[4], argv[5]);
    }
    return -1;
}

int mac_cli(int argc, char **argv) {
    if (argc < 2 || !argv || !argv[1]) {
        usage();
        return 1;
    }
    for (int i = 2; i < argc; ++i) {
        if (!argv[i] || !argv[i][0]) {
            fputs("Error: arguments must not be empty.\n", stderr);
            return 1;
        }
    }

    /* The WASM module runs many commands in one instance: start each with a clean error queue. */
    ERR_clear_error();
    int result = dispatch(argc, argv);
    ERR_clear_error();
    /* -1 means a wrong command, argument count or algorithm name. */
    if (result < 0) {
        usage();
        return 1;
    }
    return result;
}
