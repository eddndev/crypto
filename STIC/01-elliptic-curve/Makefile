.PHONY: all native run wasm test report clean clean-report
.DELETE_ON_ERROR:

REPO_ROOT ?= $(abspath ../..)
EMSDK_EMCC ?= $(REPO_ROOT)/.tools/emsdk/upstream/emscripten/emcc

CC ?= cc
ifeq ($(shell command -v emcc 2>/dev/null),)
  ifneq ($(wildcard $(EMSDK_EMCC)),)
    EMCC ?= $(EMSDK_EMCC)
  endif
endif
EMCC ?= emcc
CPPFLAGS += -Iinclude
CFLAGS ?= -O2 -Wall -Wextra -Wpedantic
ARITHMETIC := src/bigint.c src/curve_arithmetic.c src/arithmetic_cli.c
JOB := stic-01-elliptic-curve
WASM_DIR := ../../web/public/wasm/elliptic-curve

all: native

native: build/elliptic-curve

build/elliptic-curve: src/main.c src/quadratic_residues.c src/elliptic_curve.c include/elliptic_curve.h include/bigint.h include/curve_arithmetic.h $(ARITHMETIC) Makefile
	mkdir -p build
	$(CC) $(CPPFLAGS) $(CFLAGS) -std=c17 src/main.c src/quadratic_residues.c src/elliptic_curve.c $(ARITHMETIC) -o $@

run: native
	./build/elliptic-curve qr 7

# Always emit the JS/WASM pair together so deleting either is recoverable.
wasm:
	@if command -v "$(EMCC)" >/dev/null 2>&1; then \
		mkdir -p $(WASM_DIR) && \
		$(EMCC) $(CPPFLAGS) $(CFLAGS) -std=c17 src/quadratic_residues.c src/elliptic_curve.c $(ARITHMETIC) --no-entry \
			-sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,node \
			-sALLOW_MEMORY_GROWTH=1 -sABORTING_MALLOC=0 \
			-sEXPORTED_FUNCTIONS='["_print_quadratic_residues","_print_rational_points","_run_arithmetic"]' \
			-sEXPORTED_RUNTIME_METHODS='["FS","ccall"]' \
			-o $(WASM_DIR)/elliptic-curve.mjs; \
	elif [ -f "$(WASM_DIR)/elliptic-curve.mjs" ] && [ -f "$(WASM_DIR)/elliptic-curve.wasm" ]; then \
		echo "Notice: Emscripten missing, using existing WebAssembly artifacts in $(WASM_DIR)."; \
	else \
		echo "Emscripten missing. Run bash scripts/setup-emsdk.sh from the repository root, then source .tools/emsdk/emsdk_env.sh." >&2; \
		exit 1; \
	fi

build/arithmetic-probe: tests/arithmetic_probe.c src/bigint.c include/bigint.h
	mkdir -p build
	$(CC) $(CPPFLAGS) $(CFLAGS) -std=c17 tests/arithmetic_probe.c src/bigint.c -o $@

test: native wasm build/arithmetic-probe
	python3 tests/test_native.py
	python3 tests/test_arithmetic.py
	node ../../scripts/test-elliptic-curve.mjs

report:
	mkdir -p build
	latexmk -xelatex -interaction=nonstopmode -halt-on-error -file-line-error \
		-outdir=build -jobname=$(JOB) main.tex

# Preserve the final PDF; only disposable compiler outputs are removed.
clean:
	rm -f build/elliptic-curve $(WASM_DIR)/elliptic-curve.mjs $(WASM_DIR)/elliptic-curve.wasm

clean-report:
	latexmk -c -outdir=build -jobname=$(JOB) main.tex
