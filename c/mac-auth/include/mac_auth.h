#ifndef MAC_AUTH_H
#define MAC_AUTH_H

/* Command-line entry point shared by the native binary and the WASM module.
 * argv[0] is the program name. Returns 0 on success, 1 on any error and
 * 2 when check finds tau != tau'. */
int mac_auth_cli(int argc, char **argv);

/* Add at least 48 bytes of external entropy to OpenSSL. Returns 0 on success. */
int mac_auth_seed(const unsigned char *bytes, int length);

/* Individual operations. Every output file must not exist yet. */
int mac_auth_keygen(const char *private_path, const char *public_path);
int mac_auth_derive(const char *private_path, const char *peer_path, const char *key_path);
int mac_auth_challenge(const char *r_path);
int mac_auth_respond(const char *key_path, const char *r_path, const char *tau_path);
int mac_auth_check(const char *key_path, const char *r_path, const char *tau_path);
int mac_auth_session_key(const char *tau_path, const char *ke_path);
int mac_auth_encrypt(const char *ke_path, const char *input_path, const char *output_path);
int mac_auth_decrypt(const char *ke_path, const char *input_path, const char *output_path);

#endif
