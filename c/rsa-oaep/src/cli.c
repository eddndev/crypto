#include "rsa_oaep.h"
#include <openssl/err.h>
#include <openssl/rand.h>
#include <stdio.h>
#include <string.h>

int rsa_oaep_seed(const unsigned char *bytes, int length) {
    if (!bytes || length < 48) return 1;
    RAND_seed(bytes, length);
    return RAND_status() != 1;
}

static void usage(void) {
    fputs("Usage:\n"
          "  rsa-oaep keygen <private.pem> <public.pem>\n"
          "  rsa-oaep inspect <private.pem>\n"
          "  rsa-oaep aes-keygen <key.b64>\n"
          "  rsa-oaep aes-encrypt <key.b64> <input> <output.b64>\n"
          "  rsa-oaep aes-decrypt <key.b64> <input.b64> <output>\n"
          "  rsa-oaep wrap <public.pem> <key.b64> <wrapped.b64>\n"
          "  rsa-oaep unwrap <private.pem> <wrapped.b64> <key.b64>\n",
          stderr);
}

/* Each command takes a fixed number of arguments after its name. */
static int dispatch(int argc, char **argv) {
    const char *command = argv[1];
    if (!strcmp(command, "keygen") && argc == 4) return rsa_oaep_keygen(argv[2], argv[3]);
    if (!strcmp(command, "inspect") && argc == 3) return rsa_oaep_inspect(argv[2]);
    if (!strcmp(command, "aes-keygen") && argc == 3) return rsa_oaep_aes_keygen(argv[2]);
    if (!strcmp(command, "aes-encrypt") && argc == 5) {
        return rsa_oaep_aes_encrypt(argv[2], argv[3], argv[4]);
    }
    if (!strcmp(command, "aes-decrypt") && argc == 5) {
        return rsa_oaep_aes_decrypt(argv[2], argv[3], argv[4]);
    }
    if (!strcmp(command, "wrap") && argc == 5) return rsa_oaep_wrap(argv[2], argv[3], argv[4]);
    if (!strcmp(command, "unwrap") && argc == 5) return rsa_oaep_unwrap(argv[2], argv[3], argv[4]);
    return -1;
}

int rsa_oaep_cli(int argc, char **argv) {
    if (argc < 2 || !argv || !argv[1]) {
        usage();
        return 1;
    }
    for (int i = 2; i < argc; ++i) {
        if (!argv[i] || !argv[i][0]) {
            fputs("Error: file names must not be empty.\n", stderr);
            return 1;
        }
    }

    /* The WASM module runs many commands in one instance: start each with a clean error queue. */
    ERR_clear_error();
    int result = dispatch(argc, argv);
    ERR_clear_error();
    if (result < 0) {
        usage();
        return 1;
    }
    if (result != 0) {
        fputs("Error: operation failed. Check the key files, Base64 inputs, file size limit "
              "and output paths; existing files are never overwritten.\n",
              stderr);
        return 1;
    }
    return 0;
}
