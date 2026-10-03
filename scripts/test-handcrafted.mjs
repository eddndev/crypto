import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import createModule from '../c/handcrafted/build/wasm/handcrafted.mjs';
const wasmBinary=await readFile(new URL('../c/handcrafted/build/wasm/handcrafted.wasm',import.meta.url));
let output=[];
const module=await createModule({wasmBinary,print:line=>output.push(line)});
assert.equal(module.ccall('handcrafted_contracts','number',[],[]),0);
const vectors=JSON.parse(await readFile(new URL('../c/handcrafted/build/vectors.json',import.meta.url)));
for (let i=0;i<vectors.cases.length;i++) {
  output=[];
  assert.equal(module.ccall('run_handcrafted_probe','number',['string'],[vectors.cases[i]]),0);
  assert.equal(output.join('\n'),vectors.expected[i].map(String).join(' '),vectors.cases[i]);
}
assert.notEqual(module.ccall('run_handcrafted_probe','number',['string'],['mul 17 2 3 extra']),0);
console.log(`PASS: ${vectors.cases.length} Handcrafted vectors and boundary contracts in WebAssembly.`);
