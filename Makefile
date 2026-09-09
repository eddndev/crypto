.PHONY: dev build test c wasm test-c report

PRACTICE := STIC/01-elliptic-curve

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

report:
	$(MAKE) -C $(PRACTICE) report
