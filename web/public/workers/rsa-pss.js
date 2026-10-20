import createModule from '/wasm/rsa-pss/rsa-pss.mjs';
self.onmessage = async ({ data }) => {
  let module;
  let pointer = 0;
  const output = [], errors = [];
  try {
    module = await createModule({ print: line => output.push(line), printErr: line => errors.push(line) });
    const entropy = crypto.getRandomValues(new Uint8Array(48));
    pointer = module._malloc(entropy.length);
    if (!pointer) throw new Error('Insufficient memory.');
    module.HEAPU8.set(entropy, pointer);
    const seeded = module.ccall('rsa_pss_seed', 'number', ['number', 'number'], [pointer, entropy.length]);
    module.HEAPU8.fill(0, pointer, pointer + 48);
    entropy.fill(0);
    module._free(pointer);
    pointer = 0;
    if (seeded) throw new Error('Random generator initialization failed.');
    for (const file of data.inputs) module.FS.writeFile(file.name, new Uint8Array(file.bytes));
    const code = module.ccall('rsa_pss_run', 'number',
      ['string', 'number', 'string', 'string', 'string', 'string'],
      [data.operation, data.bits, 'private.pem', 'public.pem', 'message.bin', 'signature.b64']);
    const files = code === 0 ? data.outputs.map(name => ({ name, bytes: module.FS.readFile(name) })) : [];
    self.postMessage({ code, output: output.join('\n'), error: errors.join('\n'), files });
  } catch (error) {
    self.postMessage({ code: 1, output: '', error: String(error), files: [] });
  } finally {
    if (pointer) {
      module.HEAPU8.fill(0, pointer, pointer + 48);
      module._free(pointer);
    }
    for (const name of ['private.pem', 'public.pem', 'message.bin', 'signature.b64']) {
      try {
        const bytes = module.FS.readFile(name);
        bytes.fill(0);
        module.FS.writeFile(name, bytes);
        module.FS.unlink(name);
      } catch { /* The operation may not have created the file. */ }
    }
    self.close();
  }
};
