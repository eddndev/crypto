.PHONY: native wasm test clean
.DELETE_ON_ERROR:
CC ?= cc
REPO_ROOT ?= $(abspath ../..)
EMCC ?= $(REPO_ROOT)/.tools/emsdk/upstream/emscripten/emcc
OPENSSL_WASM := $(REPO_ROOT)/.tools/openssl-wasm-3.5.8
WASM_DIR := $(REPO_ROOT)/web/public/wasm/rsa-crt
# OpenSSL solo se usa en src/primes.c para generar p y q.
SOURCES := ../handcrafted/src/bigint.c src/primes.c src/euclid.c src/keys.c \
	src/square_multiply.c src/rsa.c src/cli.c
HEADERS := include/rsa_crt.h include/internal.h ../handcrafted/include/bigint.h
CFLAGS ?= -O2 -Wall -Wextra -Wpedantic -Werror
CPPFLAGS += -Iinclude -I../handcrafted/include

native: build/rsa-crt

build/rsa-crt: $(SOURCES) src/main.c $(HEADERS) Makefile
	mkdir -p build
	$(CC) $(CPPFLAGS) $(CFLAGS) -std=c17 $$(pkg-config --cflags libcrypto) \
		$(SOURCES) src/main.c $$(pkg-config --libs libcrypto) -o $@

wasm:
	bash $(REPO_ROOT)/scripts/setup-openssl-wasm.sh
	mkdir -p $(WASM_DIR)
	$(EMCC) $(CPPFLAGS) $(CFLAGS) -std=c17 -I$(OPENSSL_WASM)/include \
		$(SOURCES) $(OPENSSL_WASM)/lib/libcrypto.a --no-entry \
		-sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,node -sFORCE_FILESYSTEM=1 \
		-sALLOW_MEMORY_GROWTH=1 -sSTACK_SIZE=2097152 \
		-sEXPORTED_FUNCTIONS='["_rsa_crt_cli","_rsa_crt_seed","_malloc","_free"]' \
		-sEXPORTED_RUNTIME_METHODS='["ccall","FS","HEAPU8","HEAPU32","stringToUTF8","lengthBytesUTF8"]' \
		-o $(WASM_DIR)/rsa-crt.mjs

test: native wasm
	python3 tests/test_rsa_crt.py
	node $(REPO_ROOT)/scripts/test-rsa-crt.mjs

clean:
	rm -rf build
