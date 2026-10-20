.PHONY: dev build test c wasm test-c $(addprefix native-,elliptic-curve toy-ecdh toy_ecdsa standard-ec rsa-pss) $(addprefix wasm-,elliptic-curve toy-ecdh toy_ecdsa standard-ec rsa-pss) $(addprefix test-,elliptic-curve toy-ecdh toy_ecdsa standard-ec rsa-pss)

PRACTICES := elliptic-curve toy-ecdh toy_ecdsa standard-ec rsa-pss

dev:
	npm --prefix web run dev

build:
	npm --prefix web run build

test: test-c
	cargo test --workspace

c: $(addprefix native-,$(PRACTICES))
wasm: $(addprefix wasm-,$(PRACTICES))
test-c: test-handcrafted $(addprefix test-,$(PRACTICES))

.PHONY: test-handcrafted
test-handcrafted:
	$(MAKE) -C c/handcrafted test

$(addprefix native-,$(PRACTICES)):
	$(MAKE) -C c/$(patsubst native-%,%,$@) native

$(addprefix wasm-,$(PRACTICES)):
	$(MAKE) -C c/$(patsubst wasm-%,%,$@) wasm

$(addprefix test-,$(PRACTICES)):
	$(MAKE) -C c/$(patsubst test-%,%,$@) test
