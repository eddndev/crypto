#ifndef MAC_H
#define MAC_H

/* Command-line entry point shared by the native binary and the WASM module.
 * argv[0] is the program name. Returns 0 on success, 1 on any error and 2 when
 * verify finds an invalid tag. */
int mac_cli(int argc, char **argv);

/* Add at least 48 bytes of external entropy to OpenSSL. Returns 0 on success. */
int mac_seed(const unsigned char *bytes, int length);

/* Individual operations; algorithm is "hmac" or "cmac". Output files must not exist yet. */
int mac_keygen(const char *algorithm, const char *key_path);
int mac_tag(const char *algorithm, const char *key_path, const char *file_path,
            const char *tag_path);
int mac_verify(const char *algorithm, const char *key_path, const char *file_path,
               const char *tag_path);

#endif
