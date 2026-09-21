.PHONY: all native wasm test clean
.DELETE_ON_ERROR:
CC ?= cc
REPO_ROOT ?= $(abspath ../..)
EMCC ?= $(REPO_ROOT)/.tools/emsdk/upstream/emscripten/emcc
CPPFLAGS += -Iinclude
CFLAGS ?= -O2 -Wall -Wextra -Wpedantic -Werror
SOURCES := src/bigint.c src/curve_arithmetic.c src/toy_ecdh.c src/cli.c
HEADERS := $(wildcard include/*.h)
WASM_DIR ?= $(REPO_ROOT)/web/public/wasm/toy-ecdh

all: native

native: build/toy-ecdh

build/toy-ecdh: $(SOURCES) src/main.c $(HEADERS) Makefile
	mkdir -p build
	$(CC) $(CPPFLAGS) $(CFLAGS) -std=c17 $(SOURCES) src/main.c -o $@

wasm:
	mkdir -p $(WASM_DIR)
	$(EMCC) $(CPPFLAGS) $(CFLAGS) -std=c17 $(SOURCES) --no-entry \
		-sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,node \
		-sALLOW_MEMORY_GROWTH=1 -sSTACK_SIZE=1048576 \
		-sEXPORTED_FUNCTIONS='["_run_toy_ecdh"]' \
		-sEXPORTED_RUNTIME_METHODS='["ccall"]' \
		-o $(WASM_DIR)/toy-ecdh.mjs

test: native wasm
	python3 tests/test_toy_ecdh.py
	node $(REPO_ROOT)/scripts/test-toy-ecdh.mjs

clean:
	rm -rf build
