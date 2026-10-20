import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import createModule from '../web/public/wasm/rsa-pss/rsa-pss.mjs';
const executable = fileURLToPath(new URL('../c/rsa-pss/build/rsa-pss', import.meta.url));
const directory = mkdtempSync(join(tmpdir(), 'rsa-pss-'));
const output = [];
const module = await createModule({ print: s => output.push(s), printErr: () => {} });
const run = (operation, bits = 0) => module.ccall('rsa_pss_run', 'number', ['string', 'number', 'string', 'string', 'string', 'string'], [operation, bits, 'private.pem', 'public.pem', 'message.bin', 'signature.b64']);
const native = (...args) => execFileSync(executable, args, { cwd: directory });
try {
  module.FS.writeFile('message.bin', new Uint8Array([0, 1, 255, 128, 0]));
  writeFileSync(join(directory, 'message.bin'), module.FS.readFile('message.bin'));
  for (const bits of [2048, 3072, 4096]) {
    assert.equal(run('keygen', bits), 0);
    assert.equal(run('sign'), 0);
    assert.equal(run('verify'), 0);
    for (const name of ['private.pem', 'public.pem', 'signature.b64']) writeFileSync(join(directory, name), module.FS.readFile(name));
    assert.equal(native('verify', 'public.pem', 'message.bin', 'signature.b64').toString().trim(), 'true');
    native('sign', 'private.pem', 'message.bin', 'native.b64');
    module.FS.writeFile('signature.b64', readFileSync(join(directory, 'native.b64')));
    assert.equal(run('verify'), 0);
    module.FS.writeFile('message.bin', new Uint8Array([9]));
    assert.equal(run('verify'), 2);
    module.FS.writeFile('message.bin', readFileSync(join(directory, 'message.bin')));
    for (const name of ['private.pem', 'public.pem', 'signature.b64']) module.FS.unlink(name);
    rmSync(join(directory, 'native.b64'));
  }
  console.log('PASS: native/WASM interoperability in both directions for all three key sizes; altered messages rejected.');
} finally { rmSync(directory, { recursive: true, force: true }); }
