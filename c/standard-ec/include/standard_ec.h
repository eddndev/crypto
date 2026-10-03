#ifndef STANDARD_EC_H
#define STANDARD_EC_H
/* CLI status: 0 success/valid, 2 invalid signature, 1 input or runtime error. */
int standard_ec_cli(int argc, char **argv);
/* Browser adapter uses fixed virtual filenames without spaces. */
int run_standard_ec(const char *command);
/* WASM callers must supply 48 fresh CSPRNG bytes before each operation. */
int standard_ec_seed(const unsigned char *entropy, unsigned length);
#endif
