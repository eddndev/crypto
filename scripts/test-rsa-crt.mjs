import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import createModule from '../web/public/wasm/rsa-crt/rsa-crt.mjs';

const executable = fileURLToPath(new URL('../c/rsa-crt/build/rsa-crt', import.meta.url));
let stdout = [];
let stderr = [];
const module = await createModule({ print: s => stdout.push(s), printErr: s => stderr.push(s) });

/* Run the CLI inside WASM with argv built in the module heap (argv[0] is the program name). */
const wasm = (...args) => {
  stdout = [];
  stderr = [];
  const argv = ['rsa-crt', ...args.map(String)];
  const pointers = argv.map(text => {
    const size = module.lengthBytesUTF8(text) + 1;
    const pointer = module._malloc(size);
    module.stringToUTF8(text, pointer, size);
    return pointer;
  });
  const table = module._malloc(4 * (pointers.length + 1));
  pointers.forEach((pointer, i) => { module.HEAPU32[(table >> 2) + i] = pointer; });
  module.HEAPU32[(table >> 2) + pointers.length] = 0;
  const code = module._rsa_crt_cli(argv.length, table);
  pointers.forEach(pointer => module._free(pointer));
  module._free(table);
  return { code, out: stdout.join('\n'), err: stderr.join('\n') };
};
const native = (...args) => {
  const result = spawnSync(executable, args.map(String), { encoding: 'utf8' });
  return { code: result.status, out: result.stdout.trimEnd(), err: result.stderr.trimEnd() };
};
const ok = result => {
  assert.equal(result.code, 0, result.err);
  assert.equal(result.err, '');
  return result.out;
};
const values = text => Object.fromEntries(text.split('\n').filter(line => line.includes(' = '))
  .map(line => line.split(' = ')).map(([name, value]) => [name, BigInt(value)]));
const power = (base, exponent, modulus) => {
  let result = 1n;
  base %= modulus;
  for (; exponent > 0n; exponent >>= 1n) {
    if (exponent & 1n) result = result * base % modulus;
    base = base * base % modulus;
  }
  return result;
};
const bitLength = x => x.toString(2).length;
const parseKey = text => {
  const lines = text.split('\n');
  assert.equal(lines.length, 10);
  assert.equal(lines[0], 'Public key (e, n)');
  assert.equal(lines[3], 'Private key (p, q, n, d, dp, dq)');
  const pub = values(lines.slice(1, 3).join('\n'));
  const key = values(lines.slice(4).join('\n'));
  return { e: pub.e, n: pub.n, key: [key.p, key.q, key.n, key.d, key.dp, key.dq] };
};
const checkKey = ({ e, n, key: [p, q, n2, d, dp, dq] }, bits) => {
  const phi = (p - 1n) * (q - 1n);
  assert.equal(n, n2);
  assert.equal(n, p * q);
  assert.notEqual(p, q);
  assert.equal(bitLength(p), bits);
  assert.equal(bitLength(q), bits);
  assert.ok(e % 2n === 1n && e > 1n && e < phi && e !== 3n && e !== 65537n);
  assert.equal(e * d % phi, 1n);
  assert.equal(dp, d % (p - 1n));
  assert.equal(dq, d % (q - 1n));
};
const randomBelow = n => {
  const bytes = randomBytes(Math.ceil(bitLength(n) / 8) + 8);
  return BigInt('0x' + bytes.toString('hex')) % (n - 1n) + 1n;
};

assert.equal(module.ccall('rsa_crt_seed', 'number', ['array', 'number'], [randomBytes(48), 48]), 0);
assert.equal(module.ccall('rsa_crt_seed', 'number', ['array', 'number'], [randomBytes(47), 47]), 1);

let roundTrips = 0;
for (const bits of [4, 4, 5, 8, 16, 32, 64, 128, 512, 1024]) {
  /* One key from WASM and one from the native CLI; each side decrypts the other's ciphertexts. */
  const keys = [parseKey(ok(wasm('keygen', bits))), parseKey(ok(native('keygen', bits)))];
  for (const pair of keys) {
    checkKey(pair, bits);
    for (const m of [1n, pair.n - 1n, randomBelow(pair.n), randomBelow(pair.n)]) {
      const fromWasm = ok(wasm('encrypt', m, pair.e, pair.n));
      const fromNative = ok(native('encrypt', m, pair.e, pair.n));
      assert.equal(fromWasm, fromNative);
      const { c } = values(fromWasm);
      assert.equal(c, power(m, pair.e, pair.n));
      const traceWasm = ok(wasm('decrypt', c, ...pair.key));
      const traceNative = ok(native('decrypt', c, ...pair.key));
      assert.equal(traceWasm, traceNative);
      assert.equal(values(traceWasm).m, m);
      roundTrips += 1;
    }
  }
}

for (const args of [[], ['keygen', 3], ['keygen', 1025], ['encrypt', 0, 7, 143], ['encrypt', 5, 7, 142],
  ['encrypt', 'x', 7, 143], ['decrypt', 47, 13, 11, 143, 103, 7, 4], ['decrypt', 47, 13, 13, 169, 103, 7, 3],
  ['decrypt', 143, 13, 11, 143, 103, 7, 3]]) {
  const fromWasm = wasm(...args);
  const fromNative = native(...args);
  assert.equal(fromWasm.code, 1);
  assert.equal(fromNative.code, 1);
  assert.equal(fromWasm.out, '');
  assert.equal(fromWasm.err.trim(), fromNative.err);
}
assert.equal(ok(wasm('decrypt', 47, 13, 11, 143, 103, 7, 3)),
  execFileSync(executable, ['decrypt', '47', '13', '11', '143', '103', '7', '3']).toString().trimEnd());
console.log(`PASS: native/WASM parity for 4..1024-bit primes; ${roundTrips} cross round trips; identical encryption, CRT traces and errors.`);
