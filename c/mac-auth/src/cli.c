#include "mac_auth.h"
#include <openssl/err.h>
#include <openssl/rand.h>
#include <stdio.h>
#include <string.h>

int mac_auth_seed(const unsigned char *bytes, int length) {
    if (!bytes || length < 48) return 1;
    RAND_seed(bytes, length);
    return RAND_status() != 1;
}

static void usage(void) {
    fputs("Usage:\n"
          "  mac-auth keygen <private.pem> <public.pem>\n"
          "  mac-auth derive <private.pem> <peer-public.pem> <K.b64>\n"
          "  mac-auth challenge <r.b64>\n"
          "  mac-auth respond <K.b64> <r.b64> <tau.b64>\n"
          "  mac-auth check <K.b64> <r.b64> <tau.b64>\n"
          "  mac-auth session-key <tau.b64> <KE.b64>\n"
          "  mac-auth encrypt <KE.b64> <input> <output.b64>\n"
          "  mac-auth decrypt <KE.b64> <input.b64> <output>\n",
          stderr);
}

/* Each command takes a fixed number of arguments after its name. */
static int dispatch(int argc, char **argv) {
    const char *command = argv[1];
    if (!strcmp(command, "keygen") && argc == 4) return mac_auth_keygen(argv[2], argv[3]);
    if (!strcmp(command, "derive") && argc == 5) return mac_auth_derive(argv[2], argv[3], argv[4]);
    if (!strcmp(command, "challenge") && argc == 3) return mac_auth_challenge(argv[2]);
    if (!strcmp(command, "respond") && argc == 5) {
        return mac_auth_respond(argv[2], argv[3], argv[4]);
    }
    if (!strcmp(command, "check") && argc == 5) return mac_auth_check(argv[2], argv[3], argv[4]);
    if (!strcmp(command, "session-key") && argc == 4) {
        return mac_auth_session_key(argv[2], argv[3]);
    }
    if (!strcmp(command, "encrypt") && argc == 5) {
        return mac_auth_encrypt(argv[2], argv[3], argv[4]);
    }
    if (!strcmp(command, "decrypt") && argc == 5) {
        return mac_auth_decrypt(argv[2], argv[3], argv[4]);
    }
    return -1;
}

int mac_auth_cli(int argc, char **argv) {
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
    /* Commands without output files (check) still report a failed stdout write. */
    if (result >= 0 && (fflush(stdout) != 0 || ferror(stdout))) result = 1;
    if (result < 0) {
        usage();
        return 1;
    }
    if (result == 2) {
        fputs("tau != tau_prime: Bob is not authenticated. Alice stops the communication.\n",
              stderr);
        return 2;
    }
    if (result != 0) {
        fputs("Error: operation failed. Check the key files (EC P-256 PEM), Base64 inputs "
              "and their lengths, the file size limit and output paths; existing files are "
              "never overwritten.\n",
              stderr);
        return 1;
    }
    return 0;
}
