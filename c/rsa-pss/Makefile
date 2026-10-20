.PHONY: native wasm test clean
.DELETE_ON_ERROR:
CC ?= cc
REPO_ROOT ?= $(abspath ../..)
EMCC ?= $(REPO_ROOT)/.tools/emsdk/upstream/emscripten/emcc
OPENSSL_WASM := $(REPO_ROOT)/.tools/openssl-wasm-3.5.8
WASM_DIR := $(REPO_ROOT)/web/public/wasm/rsa-pss
SOURCES := src/keys.c src/base64.c src/signature.c src/cli.c
CFLAGS ?= -O2 -Wall -Wextra -Wpedantic -Werror
CPPFLAGS += -Iinclude

native: build/rsa-pss

build/rsa-pss: $(SOURCES) src/main.c include/rsa_pss.h include/internal.h Makefile
	mkdir -p build
	$(CC) $(CPPFLAGS) $(CFLAGS) -std=c17 $$(pkg-config --cflags openssl) \
		$(SOURCES) src/main.c $$(pkg-config --libs openssl) -o $@

wasm:
	bash $(REPO_ROOT)/scripts/setup-openssl-wasm.sh
	mkdir -p $(WASM_DIR)
	$(EMCC) $(CPPFLAGS) $(CFLAGS) -std=c17 -I$(OPENSSL_WASM)/include \
		$(SOURCES) $(OPENSSL_WASM)/lib/libcrypto.a --no-entry \
		-sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,node -sFORCE_FILESYSTEM=1 \
		-sALLOW_MEMORY_GROWTH=1 -sSTACK_SIZE=2097152 \
		-sEXPORTED_FUNCTIONS='["_rsa_pss_run","_rsa_pss_seed","_malloc","_free"]' \
		-sEXPORTED_RUNTIME_METHODS='["ccall","FS","HEAPU8"]' \
		-o $(WASM_DIR)/rsa-pss.mjs

test: native wasm
	python3 tests/test_rsa_pss.py
	node $(REPO_ROOT)/scripts/test-rsa-pss.mjs

clean:
	rm -rf build
