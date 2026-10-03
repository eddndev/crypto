import createModule from '/wasm/standard-ec/standard-ec.mjs';

self.onmessage = async ({ data }) => {
  const output = [];
  const errors = [];
  let module;
  let pointer = 0;
  try {
    module = await createModule({ print: line => output.push(line), printErr: line => errors.push(line) });
    const entropy = crypto.getRandomValues(new Uint8Array(48));
    pointer = module._malloc(entropy.length);
    if (!pointer) throw new Error('Insufficient memory.');
    module.HEAPU8.set(entropy, pointer);
    const seeded = module.ccall('standard_ec_seed', 'number', ['number', 'number'], [pointer, entropy.length]);
    module.HEAPU8.fill(0, pointer, pointer + entropy.length);
    entropy.fill(0);
    module._free(pointer);
    pointer = 0;
    if (seeded) throw new Error('OpenSSL could not initialize its random generator.');
    for (const file of data.inputs || []) {
      module.FS.writeFile(file.name, new Uint8Array(file.bytes));
    }
    const code = module.ccall('run_standard_ec', 'number', ['string'], [data.command]);
    const files = code === 0 ? (data.outputs || []).map(name => ({ name, bytes: module.FS.readFile(name) })) : [];
    self.postMessage({ code, output: output.join('\n'), error: errors.join('\n'), files });
  } catch (error) {
    self.postMessage({ code: 1, error: String(error), files: [] });
  } finally {
    if (pointer) {
      module.HEAPU8.fill(0, pointer, pointer + 48);
      module._free(pointer);
    }
    for (const name of [...(data.inputs || []).map(file => file.name), ...(data.outputs || [])]) {
      try { module?.FS.unlink(name); } catch { /* An output may not exist after an error. */ }
    }
  }
};
