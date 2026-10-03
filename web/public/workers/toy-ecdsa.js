import createModule from '/wasm/toy-ecdsa/toy-ecdsa.mjs';

self.onmessage = async ({ data }) => {
  const output = [];
  const errors = [];
  try {
    const module = await createModule({
      print: line => output.push(line),
      printErr: line => errors.push(line),
    });
    const code = module.ccall('run_toy_ecdsa', 'number', ['string'], [data.command]);
    self.postMessage({ code, output: output.join('\n'), error: errors.join('\n') });
  } catch (error) {
    self.postMessage({ code: 1, error: String(error) });
  }
};
