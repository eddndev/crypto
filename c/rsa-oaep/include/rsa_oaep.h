#ifndef RSA_OAEP_H
#define RSA_OAEP_H

/* Command-line entry point shared by the native binary and the WASM module.
 * argv[0] is the program name. Returns 0 on success and 1 on any error. */
int rsa_oaep_cli(int argc, char **argv);

/* Add at least 48 bytes of external entropy to OpenSSL. Returns 0 on success. */
int rsa_oaep_seed(const unsigned char *bytes, int length);

/* Individual operations. Every output file must not exist yet. */
int rsa_oaep_keygen(const char *private_path, const char *public_path);
int rsa_oaep_inspect(const char *private_path);
int rsa_oaep_aes_keygen(const char *key_path);
int rsa_oaep_aes_encrypt(const char *key_path, const char *input_path, const char *output_path);
int rsa_oaep_aes_decrypt(const char *key_path, const char *input_path, const char *output_path);
int rsa_oaep_wrap(const char *public_path, const char *key_path, const char *wrapped_path);
int rsa_oaep_unwrap(const char *private_path, const char *wrapped_path, const char *key_path);

#endif
