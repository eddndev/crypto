.PHONY: native test wasm sanitize clean
.DELETE_ON_ERROR:
CC ?= cc
CLANG ?= clang
REPO_ROOT ?= $(abspath ../..)
EMCC ?= $(REPO_ROOT)/.tools/emsdk/upstream/emscripten/emcc
CFLAGS ?= -O2 -Wall -Wextra -Wpedantic -Werror
CPPFLAGS += -Iinclude
native: build/probe build/contracts
build/probe: src/bigint.c include/bigint.h tests/probe.c
	mkdir -p build
	$(CC) $(CPPFLAGS) $(CFLAGS) -std=c17 src/bigint.c tests/probe.c -o $@
build/contracts: src/bigint.c include/bigint.h tests/contracts.c
	mkdir -p build
	$(CC) $(CPPFLAGS) $(CFLAGS) -std=c17 src/bigint.c tests/contracts.c -o $@
wasm:
	mkdir -p build/wasm
	$(EMCC) $(CPPFLAGS) $(CFLAGS) -std=c17 src/bigint.c tests/probe.c tests/contracts.c --no-entry \
		-sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=node -sSTACK_SIZE=2097152 \
		-sEXPORTED_FUNCTIONS='["_run_handcrafted_probe","_handcrafted_contracts"]' \
		-sEXPORTED_RUNTIME_METHODS='["ccall"]' -o build/wasm/handcrafted.mjs
test: native wasm
	./build/contracts
	python3 tests/test_bigint.py
	node $(REPO_ROOT)/scripts/test-handcrafted.mjs
sanitize:
	mkdir -p build
	$(CLANG) $(CPPFLAGS) -std=c17 -O1 -g -fsanitize=address,undefined -fno-omit-frame-pointer src/bigint.c tests/contracts.c -o build/contracts-asan
	./build/contracts-asan
	$(CLANG) $(CPPFLAGS) -std=c17 -O1 -g -fsanitize=address,undefined -fno-omit-frame-pointer src/bigint.c tests/probe.c -o build/probe-asan
	HANDCRAFTED_PROBE=$(CURDIR)/build/probe-asan python3 tests/test_bigint.py
clean:
	rm -rf build
