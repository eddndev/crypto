import createModule from '/wasm/toy-ecdh/toy-ecdh.mjs';

self.onmessage = async ({ data }) => {
  const output = [];
  const errors = [];
  try {
    const module = await createModule({
      print: line => output.push(line),
      printErr: line => errors.push(line),
    });
    for (const command of data.commands) {
      const code = module.ccall('run_toy_ecdh', 'number', ['string'], [command]);
      if (code) {
        self.postMessage({ code, error: errors.join('\n') });
        return;
      }
      output.push('');
    }
    self.postMessage({ code: 0, output: output.join('\n').trim() });
  } catch (error) {
    self.postMessage({ code: 1, error: String(error) });
  }
};
