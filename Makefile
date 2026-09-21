.PHONY: dev build test c wasm test-c

PRACTICE := c/elliptic-curve

dev:
	npm --prefix web run dev

build:
	npm --prefix web run build

test: test-c
	cargo test --workspace

c:
	$(MAKE) -C $(PRACTICE) native

wasm:
	$(MAKE) -C $(PRACTICE) wasm

test-c:
	$(MAKE) -C $(PRACTICE) test
