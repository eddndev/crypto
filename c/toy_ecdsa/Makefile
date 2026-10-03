.PHONY: all native wasm test clean
.DELETE_ON_ERROR:
CC ?= cc
REPO_ROOT ?= $(abspath ../..)
EMCC ?= $(REPO_ROOT)/.tools/emsdk/upstream/emscripten/emcc
WASM_DIR ?= $(REPO_ROOT)/web/public/wasm/toy-ecdsa
CPPFLAGS += -Iinclude
CFLAGS ?= -O2 -Wall -Wextra -Wpedantic -Werror
SOURCES := ../handcrafted/src/bigint.c src/curve_arithmetic.c src/toy_ecdh.c src/toy_ecdsa.c src/cli.c
HEADERS := $(wildcard include/*.h) ../handcrafted/src/bigint.c ../handcrafted/include/bigint.h

all: native

native: build/toy_ecdsa

build/toy_ecdsa: $(SOURCES) src/main.c $(HEADERS) Makefile
	mkdir -p build
	$(CC) $(CPPFLAGS) $(CFLAGS) -std=c17 $(SOURCES) src/main.c -o $@

wasm:
	mkdir -p $(WASM_DIR)
	$(EMCC) $(CPPFLAGS) $(CFLAGS) -std=c17 $(SOURCES) --no-entry \
		-sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,node \
		-sALLOW_MEMORY_GROWTH=1 -sSTACK_SIZE=1048576 \
		-sEXPORTED_FUNCTIONS='["_run_toy_ecdsa"]' \
		-sEXPORTED_RUNTIME_METHODS='["ccall"]' \
		-o $(WASM_DIR)/toy-ecdsa.mjs

test: native wasm
	python3 tests/test_toy_ecdsa.py
	node $(REPO_ROOT)/scripts/test-toy-ecdsa.mjs

clean:
	rm -rf build
