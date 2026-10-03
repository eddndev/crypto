import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, hkdfSync } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import createModule from '../web/public/wasm/standard-ec/standard-ec.mjs';

const native = new URL('../c/standard-ec/build/standard-ec', import.meta.url).pathname;
const wasmBinary = await readFile(new URL('../web/public/wasm/standard-ec/standard-ec.wasm', import.meta.url));
let output = [];
let errors = [];
const module = await createModule({ wasmBinary, print: line => output.push(line), printErr: line => errors.push(line) });
const pointer = module._malloc(48);
module.HEAPU8.set(randomBytes(48), pointer);
assert.equal(module.ccall('standard_ec_seed', 'number', ['number','number'], [pointer,48]),0);
module.HEAPU8.fill(0,pointer,pointer+48);module._free(pointer);
const run = (command, code = 0) => {
  output = [];errors = [];
  assert.equal(module.ccall('run_standard_ec','number',['string'],[command]),code,errors.join('\n'));
  return output.join('\n')+'\n';
};
const fields = text => Object.fromEntries(text.trim().split('\n').map(line => line.split(' = ')));
const root = await mkdtemp(join(tmpdir(),'standard-ec-'));
try {
  module.FS.writeFile('message.bin',new Uint8Array([0,1,2,255,65,66]));
  await writeFile(join(root,'message.bin'),module.FS.readFile('message.bin'));
  for (const curve of ['P-224','P-256','P-384','P-521']) {
    assert.equal(run(`parameters ${curve}`),execFileSync(native,['parameters',curve],{encoding:'utf8'}));
    run(`keygen ${curve} private.pem public.pem`);
    run('sign private.pem message.bin signature.txt');
    assert.match(run('verify public.pem message.bin signature.txt'),/Valid = true/);
    for (const name of ['private.pem','public.pem','signature.txt']) {
      await writeFile(join(root,name),module.FS.readFile(name));
    }
    assert.match(execFileSync(native,['verify',join(root,'public.pem'),join(root,'message.bin'),
      join(root,'signature.txt')],{encoding:'utf8'}),/Valid = true/);
    execFileSync(native,['sign',join(root,'private.pem'),join(root,'message.bin'),join(root,'native-signature.txt')]);
    module.FS.writeFile('native-signature.txt',await readFile(join(root,'native-signature.txt')));
    assert.match(run('verify public.pem message.bin native-signature.txt'),/Valid = true/);
    module.FS.writeFile('altered.bin',new Uint8Array([0,1,2,255,65,67]));
    assert.match(run('verify public.pem altered.bin signature.txt',2),/Valid = false/);
    const result=fields(run(`ecdh ${curve} alice.pem bob.pem`));
    assert.equal(result['K_A (SEC1)'],result['K_B (SEC1)']);
    assert.equal(result['Z_A (x)'],result['Z_B (x)']);
    assert.equal(result['k_A (256 bits)'],result['k_B (256 bits)']);
    const key=Buffer.from(hkdfSync('sha256',Buffer.from(result['Z_A (x)'],'base64'),
      Buffer.from(result.Salt,'base64'),Buffer.from(result.Info),32));
    assert.equal(key.toString('base64'),result['k_A (256 bits)']);
    const peerPrivate=join(root,curve+'-peer-private.pem');
    const peerPublic=join(root,curve+'-peer-public.pem');
    execFileSync(native,['keygen',curve,peerPrivate,peerPublic]);
    module.FS.writeFile('peer-private.pem',await readFile(peerPrivate));
    module.FS.writeFile('peer-public.pem',await readFile(peerPublic));
    const imported=fields(run('derive private.pem peer-public.pem'));
    const salt=Buffer.from(imported.Salt,'base64');
    module.FS.writeFile('salt.bin',salt);
    await writeFile(join(root,'salt.bin'),salt);
    assert.deepEqual(fields(run('derive peer-private.pem public.pem salt.bin')),imported);
    assert.deepEqual(fields(execFileSync(native,['derive',join(root,'private.pem'),peerPublic,
      join(root,'salt.bin')],{encoding:'utf8'})),imported);
    assert.equal(Buffer.from(hkdfSync('sha256',Buffer.from(imported['Z (x)'],'base64'),
      salt,Buffer.from(imported.Info),32)).toString('base64'),imported['k (256 bits)']);
    module.FS.writeFile('salt.bin',new Uint8Array(31));
    run('derive private.pem peer-public.pem salt.bin',1);
    for (const name of ['private.pem','public.pem','signature.txt','native-signature.txt','alice.pem','bob.pem','peer-private.pem','peer-public.pem','salt.bin']) {
      module.FS.unlink(name);
    }
    await rm(join(root,'native-signature.txt'));
    console.log(`PASS: ${curve}, native/WASM ECDSA and both ECDH flows, tampering and shared-salt HKDF.`);
  }
  run('parameters P-192',1);
  run('keygen P-256 same.pem same.pem',1);
  assert.notEqual(module.ccall('standard_ec_seed','number',['number','number'],[0,48]),0);
} finally { await rm(root,{recursive:true,force:true}); }
