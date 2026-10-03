# Toy ECDSA: lab 03

ISO C17 key generation, integer signing, signature verification and bounded
discrete logarithms. The implementation uses only the standard library and
reuses the previous lab's handwritten big integers and point arithmetic.

```sh
make native
./build/toy_ecdsa keygen 131071 131068 1005 130841 20473 81394
./build/toy_ecdsa sign 131071 131068 1005 130841 20473 81394 <d> 20045
./build/toy_ecdsa verify 131071 131068 1005 130841 20473 81394 109322 95671 20045 73780 106591
./build/toy_ecdsa dlog 131071 131068 1005 130841 20473 81394 109322 95671
./build/toy_ecdsa demo 131071 131068 1005 130841 20473 81394 20045
make test
```

## Commands

All integers are decimal. Points use affine coordinates; the internal third
coordinate is 1 for finite points and 0 for infinity.

```text
keygen p a b q Ax Ay [seed]
public p a b q Ax Ay d
sign p a b q Ax Ay d m [seed]
verify p a b q Ax Ay Bx By m r s
dlog p a b q Ax Ay Bx By
demo p a b q Ax Ay m [seed]
```

The public key is `(p,a,b,q,A,B)` with `B=dA`. Signing computes `R=k_E A`,
`r=x_R mod q` and `s=(m+dr)/k_E mod q`, retrying zero components.
Verification computes `w=1/s mod q`, `u1=wm mod q`, `u2=wr mod q`, and
`P=u1 A+u2 B`. It accepts exactly when P is finite and `x_P mod q=r`.
This toy requires `0<m,r,s<q`. Rejected signatures print `INVALID` with exit
status 0; malformed domains or failed calculations return status 1.

Domain checks include probable primality, nonsingularity, finite points on the
curve, and `qA=qB=O`. Baby-step giant-step searches
`1 <= d <= min(q-1, 4294967295)` using at most 65536 stored points. Failure to
find d reports that interval; it does not establish security outside it.

`demo` simulates two signers in one process. The fixture contains 128-, 256-,
512- and 1024-bit moduli with `p=4q-1` and `E:y²=x³+x`. Its generator is
reproducible with `python3 ../../scripts/generate-ecdsa-domains.py`.
`make test` checks signatures using independent Python integer arithmetic,
invalid inputs, recovered scalars, all four large domains, tampered messages,
and native/WebAssembly parity. `build/large-results.json` records the runs.

## Browser

`make wasm` builds the same command interface for a Web Worker. Both language
routes provide editable parameters, key generation, signing, verification,
tampering, local Alice/Bob simulation and the bounded logarithm search. No
private value is sent to a server.

This is a classroom implementation. `rand()`, variable-time arithmetic and the
small or supersingular example curves are unsuitable for real ECDSA signatures.
The optional seed supports repeatable tests on the same C runtime; `rand()`
sequences need not match across native and WebAssembly runtimes.
