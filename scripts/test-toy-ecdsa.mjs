import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import createModule from '../web/public/wasm/toy-ecdsa/toy-ecdsa.mjs';

const binary = new URL('../c/toy_ecdsa/build/toy_ecdsa', import.meta.url).pathname;
const wasmBinary = await readFile(new URL('../web/public/wasm/toy-ecdsa/toy-ecdsa.wasm', import.meta.url));
let lines = [];
const module = await createModule({ wasmBinary, print: line => lines.push(line), printErr: () => {} });
const execute = command => {
  lines = [];
  const code = module.ccall('run_toy_ecdsa', 'number', ['string'], [command]);
  return { code, output: lines.join('\n') + '\n' };
};
const domain = '131071 131068 1005 130841 20473 81394';
const commands = [
  `public ${domain} 7317`,
  `verify ${domain} 109322 95671 20045 73780 106591`,
  `verify ${domain} 109322 95671 20046 73780 106591`,
  `verify ${domain} 109322 95671 20045 0 106591`,
  `dlog ${domain} 109322 95671`,
];
const large = JSON.parse(await readFile(new URL('../c/toy_ecdsa/build/large-results.json', import.meta.url)));
for (const item of large) {
  const params = ['p','a','b','q'].map(k => item[k]).concat(item.A.slice(0,2));
  const sig = item.signatures[0];
  commands.push(['verify', ...params, ...sig.B, sig.m, sig.r, sig.s].join(' '));
}
for (const command of commands) {
  const result = execute(command);
  assert.equal(result.code, 0, command);
  assert.equal(result.output, execFileSync(binary, command.split(' '), {encoding:'utf8'}));
}
for (const command of ['', 'unknown', `verify ${domain} 1 1 20045 1 1`, `sign ${domain} 0 20045`, 'x'.repeat(8192), `public ${domain} 7317 extra`]) {
  assert.notEqual(execute(command).code, 0, command);
}
const generated = execute(`keygen ${domain} 20260928`);
assert.equal(generated.code, 0);
const d = generated.output.match(/^Private key d = (\d+)$/m)[1];
const B = generated.output.match(/^B = \((\d+), (\d+), 1\)$/m).slice(1);
const signed = execute(`sign ${domain} ${d} 20045 20260929`);
assert.equal(signed.code, 0);
const r = signed.output.match(/^r = (\d+)$/m)[1];
const s = signed.output.match(/^s = (\d+)$/m)[1];
assert.match(execFileSync(binary, ['verify',...domain.split(' '),...B,'20045',r,s],{encoding:'utf8'}), /signature = VALID/);
const demo = execute(`demo ${domain} 20045 20260930`);
assert.equal(demo.code,0);
assert.equal((demo.output.match(/^signature = VALID$/gm) || []).length,2);
assert.equal((demo.output.match(/^modified signature = INVALID$/gm) || []).length,2);
console.log('PASS: native/WASM parity including 128/256/512/1024-bit verification, generated keys, signatures and Alice/Bob.');
