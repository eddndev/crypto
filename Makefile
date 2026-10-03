.PHONY: dev build test c wasm test-c $(addprefix native-,elliptic-curve toy-ecdh toy_ecdsa) $(addprefix wasm-,elliptic-curve toy-ecdh toy_ecdsa) $(addprefix test-,elliptic-curve toy-ecdh toy_ecdsa)

PRACTICES := elliptic-curve toy-ecdh toy_ecdsa

dev:
	npm --prefix web run dev

build:
	npm --prefix web run build

test: test-c
	cargo test --workspace

c: $(addprefix native-,$(PRACTICES))
wasm: $(addprefix wasm-,$(PRACTICES))
test-c: $(addprefix test-,$(PRACTICES))

$(addprefix native-,$(PRACTICES)):
	$(MAKE) -C c/$(patsubst native-%,%,$@) native

$(addprefix wasm-,$(PRACTICES)):
	$(MAKE) -C c/$(patsubst wasm-%,%,$@) wasm

$(addprefix test-,$(PRACTICES)):
	$(MAKE) -C c/$(patsubst test-%,%,$@) test
