import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHmac, randomBytes, webcrypto } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import createModule from '../web/public/wasm/mac/mac.mjs';

const executable = fileURLToPath(new URL('../c/mac/build/mac', import.meta.url));
const directory = mkdtempSync(join(tmpdir(), 'mac-'));
let stdout = [];
let stderr = [];
const module = await createModule({ print: s => stdout.push(s), printErr: s => stderr.push(s) });

// Build argv in WASM memory; re-read HEAPU32 after malloc because memory can grow.
function wasm(...args) {
  const strings = ['mac', ...args];
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
  const code = module.ccall('mac_cli', 'number', ['number', 'number'], [strings.length, argv]);
  pointers.forEach(pointer => module._free(pointer));
  module._free(argv);
  return { code, out: stdout.join('\n') };
}

function native(code, ...args) {
  const result = spawnSync(executable, args, { cwd: directory });
  assert.equal(result.status, code, `${args.join(' ')}: ${result.stderr}`);
  return result.stdout.toString();
}

const field = (text, name) => text.match(new RegExp(`^${name} = (\\S+)$`, 'm'))[1];
const toNative = name => writeFileSync(join(directory, name), module.FS.readFile(name));
const toWasm = name => module.FS.writeFile(name, readFileSync(join(directory, name)));
const decoded = text => Buffer.from(text.trim(), 'base64');
const opensslMac = (algorithm, key, name) => {
  const option = algorithm === 'hmac' ? ['-digest', 'SHA256'] : ['-cipher', 'AES-128-CBC'];
  return execFileSync('openssl', ['mac', ...option, '-macopt', `hexkey:${key.toString('hex')}`,
    '-in', join(directory, name), algorithm.toUpperCase()]).toString().trim().toLowerCase();
};

try {
  const seed = webcrypto.getRandomValues(new Uint8Array(48));
  const seedPointer = module._malloc(seed.length);
  module.HEAPU8.set(seed, seedPointer);
  assert.equal(module._mac_seed(seedPointer, seed.length), 0);
  assert.equal(module._mac_seed(seedPointer, 47), 1);
  module._free(seedPointer);

  // Same files on both sides: a binary file that crosses the 64 KiB chunk size and an empty one.
  const file = new Uint8Array([...randomBytes(200000), 0, 255, 0]);
  for (const [name, bytes] of [['file.bin', file], ['empty', new Uint8Array()]]) {
    writeFileSync(join(directory, name), bytes);
    module.FS.writeFile(name, bytes);
  }

  for (const [algorithm, label, bits] of [['hmac', 'HMAC-SHA-256', 256], ['cmac', 'CMAC-AES-128', 128]]) {
    // WASM keygen and tag; native verify and an identical native tag.
    const keyName = `wasm ${algorithm}.key`;
    const keygen = wasm('keygen', algorithm, keyName);
    assert.equal(keygen.code, 0);
    assert.equal(field(keygen.out, 'Algorithm'), label);
    assert.equal(field(keygen.out, 'KeyBits'), String(bits));
    const key = decoded(field(keygen.out, 'Key'));
    assert.equal(key.length * 8, bits);
    toNative(keyName);
    for (const name of ['file.bin', 'empty']) {
      const tagName = `wasm ${name}.${algorithm}`;
      const tag = wasm('tag', algorithm, keyName, name, tagName);
      assert.equal(tag.code, 0);
      assert.equal(field(tag.out, 'TagBits'), String(bits));
      assert.equal(decoded(field(tag.out, 'Tag')).toString('hex'), opensslMac(algorithm, key, name));
      if (algorithm === 'hmac') {
        const data = name === 'empty' ? new Uint8Array() : file;
        assert.equal(field(tag.out, 'Tag'), createHmac('sha256', key).update(data).digest('base64'));
      }
      toNative(tagName);
      assert.equal(field(native(0, 'verify', algorithm, keyName, name, tagName), 'Result'), 'valid');
      const nativeTag = native(0, 'tag', algorithm, keyName, name, `native ${name}.${algorithm}`);
      assert.equal(field(nativeTag, 'Tag'), field(tag.out, 'Tag'));
    }

    // Native keygen and tag; WASM verify, then WASM rejects a tampered file and a wrong key.
    const nativeKey = `native ${algorithm}.key`;
    const nativeTag = `native ${algorithm}.tag`;
    const nativeKeyText = field(native(0, 'keygen', algorithm, nativeKey), 'Key');
    const tagged = native(0, 'tag', algorithm, nativeKey, 'file.bin', nativeTag);
    toWasm(nativeKey);
    toWasm(nativeTag);
    assert.equal(module.FS.readFile(nativeKey, { encoding: 'utf8' }).trim(), nativeKeyText);
    const verify = wasm('verify', algorithm, nativeKey, 'file.bin', nativeTag);
    assert.equal(verify.code, 0);
    assert.equal(field(verify.out, 'Result'), 'valid');
    assert.equal(field(verify.out, 'Expected'), field(tagged, 'Tag'));
    assert.equal(field(verify.out, 'Computed'), field(tagged, 'Tag'));
    const changed = file.slice();
    changed[100000] ^= 1;
    module.FS.writeFile('changed.bin', changed);
    const invalid = wasm('verify', algorithm, nativeKey, 'changed.bin', nativeTag);
    assert.equal(invalid.code, 2);
    assert.equal(field(invalid.out, 'Result'), 'invalid');
    assert.equal(wasm('verify', algorithm, keyName, 'file.bin', nativeTag).code, 2);
    assert.equal(wasm('tag', algorithm, keyName, 'file.bin', nativeTag).code, 1);
  }

  // WASM rejects keys of the other algorithm, overwrites and bad arguments.
  assert.equal(wasm('tag', 'hmac', 'wasm cmac.key', 'file.bin', 'x.tag').code, 1);
  assert.equal(wasm('tag', 'cmac', 'wasm hmac.key', 'file.bin', 'x.tag').code, 1);
  assert.equal(module.FS.analyzePath('x.tag').exists, false);
  assert.equal(wasm('verify', 'cmac', 'wasm cmac.key', 'file.bin', 'native hmac.tag').code, 1);
  assert.equal(wasm('keygen', 'hmac', 'wasm hmac.key').code, 1);
  assert.equal(wasm('keygen', 'kmac', 'k').code, 1);
  assert.equal(wasm('tag', 'hmac', 'a', 'b').code, 1);
  assert.equal(wasm().code, 1);
  assert.equal(stderr.length > 0, true);

  // The native CLI refuses to overwrite as well.
  native(1, 'keygen', 'cmac', 'native cmac.key');
  assert.equal(existsSync(join(directory, 'native cmac.key')), true);

  console.log('PASS: native/WASM parity for HMAC-SHA-256 and CMAC-AES-128 (WASM keygen/tag with native verify, native keygen/tag with WASM verify, identical tags, openssl mac cross-check); WASM rejects tampering, wrong keys and overwrites.');
} finally {
  rmSync(directory, { recursive: true, force: true });
}
