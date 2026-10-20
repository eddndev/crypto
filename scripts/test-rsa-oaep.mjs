import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes, webcrypto } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import createModule from '../web/public/wasm/rsa-oaep/rsa-oaep.mjs';

const executable = fileURLToPath(new URL('../c/rsa-oaep/build/rsa-oaep', import.meta.url));
const directory = mkdtempSync(join(tmpdir(), 'rsa-oaep-'));
let stdout = [];
let stderr = [];
const module = await createModule({ print: s => stdout.push(s), printErr: s => stderr.push(s) });

// Build argv in WASM memory; re-read HEAPU32 after malloc because memory can grow.
function wasm(...args) {
  const strings = ['rsa-oaep', ...args];
  const pointers = strings.map(text => {
    const size = module.lengthBytesUTF8(text) + 1;
    const pointer = module._malloc(size);
    module.stringToUTF8(text, pointer, size);
    return pointer;
  });
  const argv = module._malloc(4 * pointers.length);
  pointers.forEach((pointer, index) => { module.HEAPU32[(argv >> 2) + index] = pointer; });
  stdout = [];
  stderr = [];
  const code = module.ccall('rsa_oaep_cli', 'number', ['number', 'number'], [strings.length, argv]);
  pointers.forEach(pointer => module._free(pointer));
  module._free(argv);
  return { code, out: stdout.join('\n') };
}

const native = (...args) => execFileSync(executable, args, { cwd: directory }).toString();
const field = (text, name) => text.match(new RegExp(`^${name} = (\\S+)$`, 'm'))[1];
const toNative = name => writeFileSync(join(directory, name), module.FS.readFile(name));
const toWasm = name => module.FS.writeFile(name, readFileSync(join(directory, name)));
const decoded = text => Buffer.from(text.trim(), 'base64');

try {
  const seed = webcrypto.getRandomValues(new Uint8Array(48));
  const seedPointer = module._malloc(seed.length);
  module.HEAPU8.set(seed, seedPointer);
  assert.equal(module._rsa_oaep_seed(seedPointer, seed.length), 0);
  assert.equal(module._rsa_oaep_seed(seedPointer, 47), 1);
  module._free(seedPointer);

  const file = new Uint8Array([...randomBytes(5000), 0, 255, 0]);

  // WASM Alice and Bob; native Alice unwraps and decrypts.
  assert.equal(wasm('keygen', 'wasm private.pem', 'wasm public.pem').code, 0);
  const inspect = wasm('inspect', 'wasm private.pem');
  assert.equal(inspect.code, 0);
  assert.deepEqual(inspect.out.split('\n').map(line => line.split(' = ')[0]),
    ['n', 'e', 'd', 'p', 'q', 'dP', 'dQ', 'qInv']);
  assert.equal(BigInt(`0x${field(inspect.out, 'n')}`).toString(2).length, 3072);
  const nativeInspect = (toNative('wasm private.pem'), native('inspect', 'wasm private.pem'));
  assert.equal(nativeInspect.trim(), inspect.out.trim());
  module.FS.writeFile('file.bin', file);
  module.FS.writeFile('empty', new Uint8Array());
  const keygen = wasm('aes-keygen', 'wasm K.b64');
  assert.equal(keygen.code, 0);
  const wasmK = field(keygen.out, 'K');
  assert.equal(decoded(wasmK).length, 16);
  assert.equal(wasm('aes-encrypt', 'wasm K.b64', 'file.bin', 'wasm file.b64').code, 0);
  assert.equal(wasm('aes-encrypt', 'wasm K.b64', 'empty', 'wasm empty.b64').code, 0);
  const wrap = wasm('wrap', 'wasm public.pem', 'wasm K.b64', 'wasm wrapped.b64');
  assert.equal(wrap.code, 0);
  assert.equal(decoded(field(wrap.out, 'C')).length, 384);
  for (const name of ['wasm wrapped.b64', 'wasm file.b64', 'wasm empty.b64']) toNative(name);
  assert.equal(field(native('unwrap', 'wasm private.pem', 'wasm wrapped.b64', 'native K.b64'), 'K'), wasmK);
  native('aes-decrypt', 'native K.b64', 'wasm file.b64', 'native file.bin');
  native('aes-decrypt', 'native K.b64', 'wasm empty.b64', 'native empty');
  assert.deepEqual(new Uint8Array(readFileSync(join(directory, 'native file.bin'))), file);
  assert.equal(readFileSync(join(directory, 'native empty')).length, 0);

  // Native Alice and Bob; WASM Alice unwraps and decrypts.
  native('keygen', 'native private.pem', 'native public.pem');
  writeFileSync(join(directory, 'plain.bin'), file);
  const nativeK = field(native('aes-keygen', 'bob K.b64'), 'K');
  native('aes-encrypt', 'bob K.b64', 'plain.bin', 'bob file.b64');
  native('wrap', 'native public.pem', 'bob K.b64', 'bob wrapped.b64');
  for (const name of ['native private.pem', 'bob wrapped.b64', 'bob file.b64']) toWasm(name);
  const unwrap = wasm('unwrap', 'native private.pem', 'bob wrapped.b64', 'alice K.b64');
  assert.equal(unwrap.code, 0);
  assert.equal(field(unwrap.out, 'K'), nativeK);
  assert.equal(wasm('aes-decrypt', 'alice K.b64', 'bob file.b64', 'alice file.bin').code, 0);
  assert.deepEqual(module.FS.readFile('alice file.bin'), file);

  // AES files cross-decrypt with the same K in both directions.
  toNative('wasm K.b64');
  native('aes-encrypt', 'wasm K.b64', 'plain.bin', 'cross.b64');
  toWasm('cross.b64');
  assert.equal(wasm('aes-decrypt', 'wasm K.b64', 'cross.b64', 'cross.bin').code, 0);
  assert.deepEqual(module.FS.readFile('cross.bin'), file);

  // WASM rejects tampering, wrong keys and overwrites, leaving no output behind.
  const tampered = decoded(readFileSync(join(directory, 'bob file.b64'), 'utf8'));
  tampered[20] ^= 1;
  module.FS.writeFile('tampered.b64', tampered.toString('base64'));
  assert.equal(wasm('aes-decrypt', 'alice K.b64', 'tampered.b64', 'tampered.bin').code, 1);
  assert.equal(module.FS.analyzePath('tampered.bin').exists, false);
  assert.equal(wasm('unwrap', 'wasm private.pem', 'bob wrapped.b64', 'eve K.b64').code, 1);
  assert.equal(module.FS.analyzePath('eve K.b64').exists, false);
  assert.equal(wasm('aes-keygen', 'wasm K.b64').code, 1);
  assert.equal(field(wasm('unwrap', 'native private.pem', 'bob wrapped.b64', 'again.b64').out, 'K'), nativeK);
  assert.equal(wasm('wrap', 'a', 'b').code, 1);
  assert.equal(wasm().code, 1);
  assert.equal(stderr.length > 0, true);

  // The native CLI refuses to overwrite as well.
  const status = spawnSync(executable, ['aes-keygen', 'bob K.b64'], { cwd: directory });
  assert.equal(status.status, 1);
  assert.equal(existsSync(join(directory, 'bob K.b64')), true);

  console.log('PASS: native/WASM parity in both directions (keygen, inspect, wrap/unwrap, AES-128-GCM files); WASM rejects tampering, wrong keys and overwrites.');
} finally {
  rmSync(directory, { recursive: true, force: true });
}
