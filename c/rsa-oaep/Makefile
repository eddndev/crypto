.PHONY: native wasm test sanitize clean
.DELETE_ON_ERROR:
CC ?= cc
CLANG ?= clang
REPO_ROOT ?= $(abspath ../..)
EMCC ?= $(REPO_ROOT)/.tools/emsdk/upstream/emscripten/emcc
OPENSSL_WASM := $(REPO_ROOT)/.tools/openssl-wasm-3.5.8
WASM_DIR := $(REPO_ROOT)/web/public/wasm/rsa-oaep
SOURCES := src/keys.c src/base64.c src/aes.c src/oaep.c src/cli.c
HEADERS := include/rsa_oaep.h include/internal.h
CFLAGS ?= -O2 -Wall -Wextra -Wpedantic -Werror
CPPFLAGS += -Iinclude

native: build/rsa-oaep

build/rsa-oaep: $(SOURCES) src/main.c $(HEADERS) Makefile
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
		-sEXPORTED_FUNCTIONS='["_rsa_oaep_cli","_rsa_oaep_seed","_malloc","_free"]' \
		-sEXPORTED_RUNTIME_METHODS='["ccall","FS","HEAPU8","HEAPU32","stringToUTF8","lengthBytesUTF8"]' \
		-o $(WASM_DIR)/rsa-oaep.mjs

test: native wasm
	python3 tests/test_rsa_oaep.py
	node $(REPO_ROOT)/scripts/test-rsa-oaep.mjs

sanitize:
	mkdir -p build
	$(CLANG) $(CPPFLAGS) -std=c17 -O1 -g -Wall -Wextra -Wpedantic -Werror \
		-fsanitize=address,undefined -fno-sanitize-recover=undefined -fno-omit-frame-pointer \
		$$(pkg-config --cflags openssl) $(SOURCES) src/main.c $$(pkg-config --libs openssl) \
		-o build/rsa-oaep-asan
	# Distinct exit codes so a sanitizer report never looks like an expected exit 1.
	ASAN_OPTIONS=exitcode=86:detect_leaks=1 UBSAN_OPTIONS=halt_on_error=1:exitcode=87 \
		RSA_OAEP_EXE=$(CURDIR)/build/rsa-oaep-asan python3 tests/test_rsa_oaep.py

clean:
	rm -rf build
