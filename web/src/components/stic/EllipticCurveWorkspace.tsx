import CurveArithmeticWorkspace from './CurveArithmeticWorkspace';
import { useState, type FormEvent } from 'react';

type Module = {
  _print_quadratic_residues(p: number): number;
  _print_rational_points(p: number, a: number, b: number): number;
  FS: { readFile(path: string, options: { encoding: 'utf8' }): string };
};

export default function EllipticCurveWorkspace({ lang }: { lang: 'en' | 'es' }) {
  const es = lang === 'es';
  const [qr, setQr] = useState('');
  const [curve, setCurve] = useState('');
  const [download, setDownload] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function calculate(event: FormEvent<HTMLFormElement>, operation: 'qr' | 'curve') {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const p = Number(form.get('p'));
    const a = Number(form.get('a'));
    const b = Number(form.get('b'));
    setError('');
    if (operation === 'curve') { setDownload(''); setCurve(''); }
    else setQr('');
    if (!Number.isInteger(p) || p <= 3 || p > 10000 || p % 2 === 0 ||
        (operation === 'curve' && (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= p || b >= p))) {
      setError(es ? 'Usa un primo 3 < p ≤ 10000 y coeficientes enteros 0 ≤ a,b < p.' : 'Use a prime 3 < p ≤ 10000 and integer coefficients 0 ≤ a,b < p.');
      return;
    }
    setBusy(true);
    try {
      const lines: string[] = [];
      const errors: string[] = [];
      const url = '/wasm/elliptic-curve/elliptic-curve.mjs';
      const { default: createModule } = await import(/* @vite-ignore */ url);
      const module: Module = await createModule({ print: (line: string) => lines.push(line), printErr: (line: string) => errors.push(line) });
      const code = operation === 'qr' ? module._print_quadratic_residues(p) : module._print_rational_points(p, a, b);
      if (code !== 0) {
        setError(errors.join('\n') || (es ? 'No se pudo completar el cálculo.' : 'The calculation failed.'));
        return;
      }
      if (operation === 'qr') setQr(lines.join('\n'));
      else {
        setCurve(lines.join('\n'));
        setDownload(module.FS.readFile('elliptic-curve-points.txt', { encoding: 'utf8' }));
      }
    } catch (error) {
      console.error(error);
      setError(es ? 'No se pudo cargar el programa. Recarga la página e inténtalo de nuevo.' : 'The program could not load. Reload the page and try again.');
    } finally {
      setBusy(false);
    }
  }

  function save() {
    const url = URL.createObjectURL(new Blob([download], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'elliptic-curve-points.txt';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const inputClass = 'block mt-2 w-full border border-border bg-bg-primary px-3 py-2 font-mono focus:outline-accent';
  const buttonClass = 'mt-6 px-5 py-3 bg-accent text-black font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-wait focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent';
  return <div id="ec-workspace">
    <p className="text-text-secondary leading-relaxed mb-8">{es
      ? 'Se asume que p es primo; no se comprueba primalidad. El navegador admite p ≤ 10000 para mantener legible la salida. QRₚ contiene los cuadrados no nulos; el cero y su raíz se muestran por separado.'
      : 'p is assumed prime; primality is not tested. The browser accepts p ≤ 10000 to keep output manageable. QRₚ contains nonzero squares; zero and its root are listed separately.'}</p>
    <div className="grid grid-cols-2 max-lg:grid-cols-1 gap-6 items-start">
      <section className="border border-border bg-bg-card p-6 min-w-0" aria-labelledby="qr-title">
        <p className="text-accent font-mono text-xs mb-3">01 / QRₚ</p>
        <h2 id="qr-title" className="text-2xl font-bold mb-3">{es ? 'Residuos cuadráticos' : 'Quadratic residues'}</h2>
        <p className="text-text-secondary mb-6">{es ? 'Encuentra cada residuo y todas sus raíces módulo p.' : 'Find each residue and all its roots modulo p.'}</p>
        <form onSubmit={event => calculate(event, 'qr')}>
          <label htmlFor="qr-p">{es ? 'Primo p' : 'Prime p'}<input id="qr-p" name="p" type="number" min="5" max="10000" step="1" defaultValue="7" required className={inputClass} /></label>
          <button disabled={busy} className={buttonClass}>{es ? 'Calcular residuos' : 'Calculate residues'}</button>
        </form>
        {qr && <pre id="qr-output" aria-label={es ? 'Resultado de residuos' : 'Residue results'} className="mt-6 p-4 bg-[#0c0c12] text-sm leading-relaxed overflow-auto max-h-[640px] font-mono" tabIndex={0}>{qr}</pre>}
      </section>
      <section className="border border-border bg-bg-card p-6 min-w-0" aria-labelledby="curve-title">
        <p className="text-accent font-mono text-xs mb-3">02 / E(𝔽ₚ)</p>
        <h2 id="curve-title" className="text-2xl font-bold mb-3">{es ? 'Puntos racionales' : 'Rational points'}</h2>
        <p className="text-text-secondary mb-6">y² ≡ x³ + ax + b (mod p). {es ? 'El conteo incluye (0, 1, 0).' : 'The count includes (0, 1, 0).'}</p>
        <form onSubmit={event => calculate(event, 'curve')}>
          <div className="grid grid-cols-3 gap-3">
            <label htmlFor="curve-p">{es ? 'Primo p' : 'Prime p'}<input id="curve-p" name="p" type="number" min="5" max="10000" step="1" defaultValue="7" required className={inputClass} /></label>
            <label htmlFor="curve-a">a<input id="curve-a" name="a" type="number" min="0" step="1" defaultValue="2" required className={inputClass} /></label>
            <label htmlFor="curve-b">b<input id="curve-b" name="b" type="number" min="0" step="1" defaultValue="3" required className={inputClass} /></label>
          </div>
          <button disabled={busy} className={buttonClass}>{es ? 'Enumerar puntos' : 'Enumerate points'}</button>
        </form>
        {curve && <pre id="curve-output" aria-label={es ? 'Resultado de puntos' : 'Point results'} className="mt-6 p-4 bg-[#0c0c12] text-sm leading-relaxed overflow-auto max-h-[640px] font-mono" tabIndex={0}>{curve}</pre>}
        {download && <button onClick={save} className="mt-5 font-mono text-accent underline cursor-pointer">{es ? 'Descargar puntos (.txt)' : 'Download points (.txt)'}</button>}
      </section>
    </div>
    <p role="status" className="mt-4 text-text-secondary">{busy ? (es ? 'Calculando…' : 'Computing…') : (qr || curve) ? (es ? 'Cálculo completado.' : 'Calculation complete.') : ''}</p>
    {error && <p role="alert" className="mt-4 p-4 border border-red-400 text-red-300 whitespace-pre-wrap">{error}</p>}
    <CurveArithmeticWorkspace lang={lang} />
  </div>;
}
