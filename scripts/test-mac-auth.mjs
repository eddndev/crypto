import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes, webcrypto } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import createModule from '../web/public/wasm/mac-auth/mac-auth.mjs';

const executable = fileURLToPath(new URL('../c/mac-auth/build/mac-auth', import.meta.url));
const directory = mkdtempSync(join(tmpdir(), 'mac-auth-'));
let stdout = [];
let stderr = [];
const module = await createModule({ print: s => stdout.push(s), printErr: s => stderr.push(s) });

// Build argv in WASM memory; re-read HEAPU32 after malloc because memory can grow.
function wasm(...args) {
  const strings = ['mac-auth', ...args];
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
  const code = module.ccall('mac_auth_cli', 'number', ['number', 'number'], [strings.length, argv]);
  pointers.forEach(pointer => module._free(pointer));
  module._free(argv);
  return { code, out: stdout.join('\n') };
}

// The native side; check may exit with 2, so spawnSync is used there.
const native = (...args) => execFileSync(executable, args, { cwd: directory }).toString();
const nativeStatus = (...args) => spawnSync(executable, args, { cwd: directory });
const field = (text, name) => text.match(new RegExp(`^${name} = (\\S+)$`, 'm'))[1];
const toNative = name => writeFileSync(join(directory, name), module.FS.readFile(name));
const toWasm = name => module.FS.writeFile(name, readFileSync(join(directory, name)));
const decoded = text => Buffer.from(text.trim(), 'base64');

try {
  const seed = webcrypto.getRandomValues(new Uint8Array(48));
  const seedPointer = module._malloc(seed.length);
  module.HEAPU8.set(seed, seedPointer);
  assert.equal(module._mac_auth_seed(seedPointer, seed.length), 0);
  assert.equal(module._mac_auth_seed(seedPointer, 47), 1);
  module._free(seedPointer);

  const photo = new Uint8Array([...randomBytes(5000), 0, 255, 0]);
  const pdf = new Uint8Array([...Buffer.from('%PDF-1.7\n'), ...randomBytes(1200)]);

  // Round 1: WASM Alice (challenger) with native Bob (responder).
  const aliceKeys = wasm('keygen', 'alice private.pem', 'alice public.pem');
  assert.equal(aliceKeys.code, 0);
  assert.equal(decoded(field(aliceKeys.out, 'Public')).length, 65);
  native('keygen', 'bob private.pem', 'bob public.pem');
  toNative('alice public.pem');
  toWasm('bob public.pem');
  const aliceK = wasm('derive', 'alice private.pem', 'bob public.pem', 'alice K.b64');
  assert.equal(aliceK.code, 0);
  const bobK = native('derive', 'bob private.pem', 'alice public.pem', 'bob K.b64');
  assert.equal(field(aliceK.out, 's'), field(bobK, 's'));
  assert.equal(field(aliceK.out, 'K'), field(bobK, 'K'));
  assert.equal(decoded(field(aliceK.out, 'K')).length, 32);

  const challenge = wasm('challenge', 'r.b64');
  assert.equal(challenge.code, 0);
  assert.equal(field(challenge.out, 'rBits'), '256');
  toNative('r.b64');
  const tau = field(native('respond', 'bob K.b64', 'r.b64', 'tau.b64'), 'tau');
  toWasm('tau.b64');
  const check = wasm('check', 'alice K.b64', 'r.b64', 'tau.b64');
  assert.equal(check.code, 0);
  assert.equal(field(check.out, 'tau_prime'), tau);
  assert.equal(field(check.out, 'Result'), 'authenticated');

  const aliceKE = wasm('session-key', 'tau.b64', 'alice KE.b64');
  assert.equal(aliceKE.code, 0);
  assert.equal(field(aliceKE.out, 'KE'), field(native('session-key', 'tau.b64', 'bob KE.b64'), 'KE'));
  assert.equal(decoded(field(aliceKE.out, 'KE')).length, 16);

  // Files in both directions, including an empty one.
  module.FS.writeFile('photo.png', photo);
  module.FS.writeFile('empty', new Uint8Array());
  assert.equal(wasm('encrypt', 'alice KE.b64', 'photo.png', 'photo.b64').code, 0);
  assert.equal(wasm('encrypt', 'alice KE.b64', 'empty', 'empty.b64').code, 0);
  toNative('photo.b64');
  toNative('empty.b64');
  native('decrypt', 'bob KE.b64', 'photo.b64', 'bob photo.png');
  native('decrypt', 'bob KE.b64', 'empty.b64', 'bob empty');
  assert.deepEqual(new Uint8Array(readFileSync(join(directory, 'bob photo.png'))), photo);
  assert.equal(readFileSync(join(directory, 'bob empty')).length, 0);
  writeFileSync(join(directory, 'document.pdf'), pdf);
  native('encrypt', 'bob KE.b64', 'document.pdf', 'document.b64');
  toWasm('document.b64');
  const decrypt = wasm('decrypt', 'alice KE.b64', 'document.b64', 'alice document.pdf');
  assert.equal(decrypt.code, 0);
  assert.equal(field(decrypt.out, 'Bytes'), String(pdf.length));
  assert.deepEqual(module.FS.readFile('alice document.pdf'), pdf);

  // Round 2: native Bob (challenger) with WASM Carol (responder).
  assert.equal(wasm('keygen', 'carol private.pem', 'carol public.pem').code, 0);
  native('keygen', 'bob2 private.pem', 'bob2 public.pem');
  toNative('carol public.pem');
  toWasm('bob2 public.pem');
  const bob2K = native('derive', 'bob2 private.pem', 'carol public.pem', 'bob2 K.b64');
  const carolK = wasm('derive', 'carol private.pem', 'bob2 public.pem', 'carol K.b64');
  assert.equal(carolK.code, 0);
  assert.equal(field(carolK.out, 's'), field(bob2K, 's'));
  assert.equal(field(carolK.out, 'K'), field(bob2K, 'K'));
  assert.notEqual(field(carolK.out, 'K'), field(aliceK.out, 'K'));
  native('challenge', 'r2.b64');
  toWasm('r2.b64');
  const respond = wasm('respond', 'carol K.b64', 'r2.b64', 'tau2.b64');
  assert.equal(respond.code, 0);
  toNative('tau2.b64');
  const nativeCheck = native('check', 'bob2 K.b64', 'r2.b64', 'tau2.b64');
  assert.equal(field(nativeCheck, 'Result'), 'authenticated');
  assert.equal(field(nativeCheck, 'tau_prime'), field(respond.out, 'tau'));
  const bob2KE = field(native('session-key', 'tau2.b64', 'bob2 KE.b64'), 'KE');
  const carolKE = wasm('session-key', 'tau2.b64', 'carol KE.b64');
  assert.equal(field(carolKE.out, 'KE'), bob2KE);
  assert.equal(wasm('encrypt', 'carol KE.b64', 'photo.png', 'carol photo.b64').code, 0);
  toNative('carol photo.b64');
  native('decrypt', 'bob2 KE.b64', 'carol photo.b64', 'bob2 photo.png');
  assert.deepEqual(new Uint8Array(readFileSync(join(directory, 'bob2 photo.png'))), photo);
  native('encrypt', 'bob2 KE.b64', 'document.pdf', 'bob2 document.b64');
  toWasm('bob2 document.b64');
  assert.equal(wasm('decrypt', 'carol KE.b64', 'bob2 document.b64', 'carol document.pdf').code, 0);
  assert.deepEqual(module.FS.readFile('carol document.pdf'), pdf);

  // Rejections: a tau from another session gives exit 2 on both sides.
  const wrong = wasm('check', 'alice K.b64', 'r.b64', 'tau2.b64');
  assert.equal(wrong.code, 2);
  assert.equal(field(wrong.out, 'Result'), 'rejected');
  assert.equal(stderr.join('\n').includes('stops the communication'), true);
  toNative('tau.b64');
  assert.equal(nativeStatus('check', 'bob2 K.b64', 'r2.b64', 'tau.b64').status, 2);

  // WASM rejects tampering, the wrong KE and overwrites, leaving no output behind.
  const tampered = decoded(readFileSync(join(directory, 'document.b64'), 'utf8'));
  tampered[20] ^= 1;
  module.FS.writeFile('tampered.b64', tampered.toString('base64'));
  assert.equal(wasm('decrypt', 'alice KE.b64', 'tampered.b64', 'tampered.pdf').code, 1);
  assert.equal(module.FS.analyzePath('tampered.pdf').exists, false);
  assert.equal(wasm('decrypt', 'carol KE.b64', 'document.b64', 'eve.pdf').code, 1);
  assert.equal(module.FS.analyzePath('eve.pdf').exists, false);
  assert.equal(wasm('challenge', 'r.b64').code, 1);
  assert.equal(wasm('derive', 'alice private.pem', 'alice private.pem', 'x.b64').code, 1);
  assert.equal(wasm('respond', 'alice KE.b64', 'r.b64', 'y.b64').code, 1);
  assert.equal(wasm('check', 'a', 'b').code, 1);
  assert.equal(wasm().code, 1);
  assert.equal(stderr.length > 0, true);

  // The native CLI refuses to overwrite as well.
  const status = nativeStatus('challenge', 'r.b64');
  assert.equal(status.status, 1);
  assert.equal(existsSync(join(directory, 'r.b64')), true);

  console.log('PASS: WASM Alice with native Bob and native Bob with WASM Carol (same s, K, tau, KE; AES-128-GCM files both ways); rejected tau exits 2; WASM rejects tampering, wrong KE and overwrites.');
} finally {
  rmSync(directory, { recursive: true, force: true });
}
