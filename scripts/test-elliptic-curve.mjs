import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import createModule from '../web/public/wasm/elliptic-curve/elliptic-curve.mjs';

const binary = fileURLToPath(new URL('../STIC/01-elliptic-curve/build/elliptic-curve', import.meta.url));
const wasmBinary = await readFile(new URL('../web/public/wasm/elliptic-curve/elliptic-curve.wasm', import.meta.url));
let lines = [];
const module = await createModule({ wasmBinary, print: line => lines.push(line), printErr: () => {} });
const temp = await mkdtemp(join(tmpdir(), 'elliptic-curve-'));
try {
  for (const p of [5, 7, 17, 97]) {
    lines = [];
    assert.equal(module._print_quadratic_residues(p), 0);
    assert.equal(lines.join('\n') + '\n', execFileSync(binary, ['qr', String(p)], { encoding: 'utf8' }));
  }
  for (const [p, a, b] of [[7, 2, 3], [17, 2, 2], [5, 1, 0]]) {
    lines = [];
    assert.equal(module._print_rational_points(p, a, b), 0);
    const native = execFileSync(binary, ['curve', p, a, b].map(String), { cwd: temp, encoding: 'utf8' });
    assert.equal(lines.join('\n') + '\n', native);
    assert.equal(module.FS.readFile('elliptic-curve-points.txt', { encoding: 'utf8' }),
      await readFile(join(temp, 'elliptic-curve-points.txt'), 'utf8'));
  }
  assert.equal(module._print_quadratic_residues(3), 1);
  assert.equal(module._print_rational_points(7, 0, 0), 1);
  console.log('PASS: C and WebAssembly outputs and exported files match; invalid inputs rejected.');
} finally {
  await rm(temp, { recursive: true });
}

// Las entradas grandes viajan como cadenas; los resultados coinciden con C nativo.
for (const command of [
  'add 4294967311 30 97 433318550 1866632789 1 408186704 4022951807 1',
  'double 2305843009213693951 1 1300 1317571598731990128 494998261481053431 1',
  'add 7 2 3 0 1 0 2 1 1',
]) {
  lines = [];
  assert.equal(module.ccall('run_arithmetic', 'number', ['string'], [command]), 0);
  assert.equal(lines.join('\n')+'\n', execFileSync(binary, command.split(' '), {encoding:'utf8'}));
}
for (const command of ['double 7 2 3 0 0 1', 'generate 2049', 'generate 16 extra'])
  assert.equal(module.ccall('run_arithmetic', 'number', ['string'], [command]), 1);
for (const bits of [16,32,64,512,1024,2048]) {
  lines = [];
  assert.equal(module.ccall('run_arithmetic','number',['string'],[`generate ${bits} 42`]),0);
  const text = lines.join('\n');
  const p = BigInt(text.match(/^p = (\d+)$/m)[1]);
  const a = BigInt(text.match(/^a = (\d+)$/m)[1]);
  const b = BigInt(text.match(/^b = (\d+)$/m)[1]);
  assert.equal(p.toString(2).length,bits);
  assert.ok(a<p && b<p && (4n*a*a*a+27n*b*b)%p!==0n);
}
console.log('PASS: suma, duplicacion, errores y generacion WASM hasta 2048 bits.');
