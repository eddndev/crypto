import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import createModule from '../web/public/wasm/toy-ecdh/toy-ecdh.mjs';

const binary = fileURLToPath(new URL('../c/toy-ecdh/build/toy-ecdh', import.meta.url));
const wasmBinary = await readFile(new URL('../web/public/wasm/toy-ecdh/toy-ecdh.wasm', import.meta.url));
let lines = [];
const module = await createModule({ wasmBinary, print: line => lines.push(line), printErr: () => {} });
const examples = JSON.parse(await readFile(new URL('../c/toy-ecdh/tests/fixtures/examples.json', import.meta.url)));
const large = JSON.parse(await readFile(new URL('../c/toy-ecdh/tests/fixtures/large.json', import.meta.url)));
const commands = examples.flatMap(({ p, a, b, P, k }) =>
  ['rtl', 'ltr'].map(method => ['multiply', method, p, a, b, k, ...P, 'trace'].join(' ')));
commands.push('demo 127 1 7 1 3 1 13 29', 'multiply ltr 17 2 2 0 5 1 1');
for (const { p, a, b, G, r, s } of large) {
  commands.push(['demo', p, a, b, ...G, r, s].join(' '));
}
for (const command of commands) {
  lines = [];
  assert.equal(module.ccall('run_toy_ecdh', 'number', ['string'], [command]), 0, command);
  assert.equal(lines.join('\n') + '\n', execFileSync(binary, command.split(' '), { encoding: 'utf8' }));
}
for (const command of ['', 'unknown', 'demo 127 1 7 1 3 1 0 29',
  'multiply rtl 17 2 2 1 0 0 1', 'multiply rtl 17 2 2 1 5 1 1 extra', 'x'.repeat(8192)]) {
  assert.notEqual(module.ccall('run_toy_ecdh', 'number', ['string'], [command]), 0);
}
// libc rand sequences vary by platform; validate the generated key mathematically.
for (const role of ['alice', 'bob']) {
  lines = [];
  assert.equal(module.ccall('run_toy_ecdh', 'number', ['string'], [`keygen ${role} rtl 127 1 7 1 3 1 42`]), 0);
  const output = lines.join('\n');
  const secret = output.match(/^[rs] = (\d+)$/m)[1];
  const publicPoint = output.match(/^[AB] = (.+)$/m)[1];
  const native = execFileSync(binary, ['public', role, 'rtl', '127', '1', '7', secret, '1', '3', '1'], { encoding: 'utf8' });
  assert.ok(native.includes(publicPoint));
}
console.log('PASS: 10 complete traces, zero scalar, ECDH 7/128/256/512/1024 bits, invalid inputs and random keys in WebAssembly.');
