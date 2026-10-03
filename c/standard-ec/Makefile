.PHONY: native wasm test clean
.DELETE_ON_ERROR:
CC ?= cc
REPO_ROOT ?= $(abspath ../..)
EMCC ?= $(REPO_ROOT)/.tools/emsdk/upstream/emscripten/emcc
OPENSSL_WASM := $(REPO_ROOT)/.tools/openssl-wasm-3.5.8
WASM_DIR := $(REPO_ROOT)/web/public/wasm/standard-ec
CFLAGS ?= -O2 -Wall -Wextra -Wpedantic -Werror
CPPFLAGS += -Iinclude

native: build/standard-ec

build/standard-ec: src/standard_ec.c src/main.c include/standard_ec.h Makefile
	mkdir -p build
	$(CC) $(CPPFLAGS) $(CFLAGS) -std=c17 $$(pkg-config --cflags openssl) \
		src/standard_ec.c src/main.c $$(pkg-config --libs openssl) -o $@

wasm:
	bash $(REPO_ROOT)/scripts/setup-openssl-wasm.sh
	mkdir -p $(WASM_DIR)
	$(EMCC) $(CPPFLAGS) $(CFLAGS) -std=c17 -I$(OPENSSL_WASM)/include \
		src/standard_ec.c $(OPENSSL_WASM)/lib/libcrypto.a --no-entry \
		-sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,node -sFORCE_FILESYSTEM=1 \
		-sALLOW_MEMORY_GROWTH=1 -sSTACK_SIZE=2097152 \
		-sEXPORTED_FUNCTIONS='["_run_standard_ec","_standard_ec_seed","_malloc","_free"]' \
		-sEXPORTED_RUNTIME_METHODS='["ccall","FS","HEAPU8"]' \
		-o $(WASM_DIR)/standard-ec.mjs

test: native wasm
	python3 tests/test_standard_ec.py
	node $(REPO_ROOT)/scripts/test-standard-ec.mjs

clean:
	rm -rf build
