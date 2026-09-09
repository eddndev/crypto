// El calculo se ejecuta fuera de la interfaz; todos los decimales llegan como texto.
import createModule from '/wasm/elliptic-curve/elliptic-curve.mjs';
self.onmessage = async ({ data }) => {
  const lines = [], errors = [];
  try {
    const module = await createModule({ print: line => lines.push(line), printErr: line => errors.push(line) });
    const code = module.ccall('run_arithmetic', 'number', ['string'], [data.command]);
    self.postMessage({ code, output: lines.join('\n'), error: errors.join('\n') });
  } catch (error) {
    self.postMessage({ code: 1, error: String(error) });
  }
};
