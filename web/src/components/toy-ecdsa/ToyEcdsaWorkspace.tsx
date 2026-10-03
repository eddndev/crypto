import { useEffect, useRef, useState } from 'react';
import large from '../../../../c/toy_ecdsa/tests/fixtures/large.json';

type Domain = { p: string; a: string; b: string; q: string; ax: string; ay: string };
type Job = 'keygen' | 'public' | 'sign' | 'verify' | 'dlog' | 'demo';
const initial: Domain = { p: '131071', a: '131068', b: '1005', q: '130841', ax: '20473', ay: '81394' };
const inputStyle = 'block mt-2 w-full min-w-0 border border-border bg-bg-primary px-3 py-2 font-mono text-sm focus:outline-accent';
const buttonStyle = 'px-5 py-3 bg-accent text-black font-semibold cursor-pointer disabled:opacity-50';
const panelStyle = 'border border-border bg-bg-card p-6 space-y-4 min-w-0';

export default function ToyEcdsaWorkspace({ lang }: { lang: 'es' | 'en' }) {
  const es = lang === 'es';
  const t = (spanish: string, english: string) => es ? spanish : english;
  const [domain, setDomain] = useState<Domain>(initial);
  const [d, setD] = useState('');
  const [bx, setBx] = useState('109322');
  const [by, setBy] = useState('95671');
  const [message, setMessage] = useState('20045');
  const [r, setR] = useState('73780');
  const [s, setS] = useState('106591');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const worker = useRef<Worker | null>(null);
  const result = useRef<HTMLElement | null>(null);
  useEffect(() => () => worker.current?.terminate(), []);
  const clear = () => { setOutput(''); setError(''); };
  const seed = () => String(crypto.getRandomValues(new Uint32Array(1))[0]);
  const parameters = [domain.p, domain.a, domain.b, domain.q, domain.ax, domain.ay];

  function run(job: Job, overrideMessage?: string) {
    const m = overrideMessage ?? message;
    const extra = job === 'keygen' ? [seed()] : job === 'public' ? [d] : job === 'sign' ? [d, m, seed()]
      : job === 'verify' ? [bx, by, m, r, s] : job === 'dlog' ? [bx, by] : [m, seed()];
    const values = [...parameters, ...extra];
    if (values.some(value => !/^\d+$/.test(value) || value.length > 617)) {
      setError(t('Completa los campos con enteros decimales no negativos.', 'Fill in nonnegative decimal integers.'));
      setOutput('');
      return;
    }
    clear(); setBusy(true);
    const jobWorker = new Worker('/workers/toy-ecdsa.js', { type: 'module' });
    worker.current = jobWorker;
    const finish = () => { setBusy(false); jobWorker.terminate(); worker.current = null; };
    jobWorker.onmessage = ({ data }) => {
      if (data.code) setError(data.error || t('No se pudo completar el cálculo.', 'Calculation failed.'));
      else {
        setOutput(data.output);
        if (job === 'keygen' || job === 'public' || job === 'sign') {
          const point = data.output.match(/^B = \((\d+), (\d+), 1\)$/m);
          if (point) { setBx(point[1]); setBy(point[2]); }
          if (job === 'keygen') {
            setD(data.output.match(/^Private key d = (\d+)$/m)?.[1] ?? '');
            setR(''); setS('');
          } else if (job === 'sign') {
            setR(data.output.match(/^r = (\d+)$/m)?.[1] ?? '');
            setS(data.output.match(/^s = (\d+)$/m)?.[1] ?? '');
          }
        }
        requestAnimationFrame(() => result.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      }
      finish();
    };
    jobWorker.onerror = () => { setError(t('No se pudo cargar el programa.', 'Could not load the program.')); finish(); };
    jobWorker.postMessage({ command: [job, ...values].join(' ') });
  }

  function preset(value: string) {
    if (!value) return;
    clear(); setD('');
    if (value === 'registered') {
      setDomain(initial); setBx('109322'); setBy('95671');
      setMessage('20045'); setR('73780'); setS('106591');
    } else {
      const item = large.find(item => String(item.bits) === value)!;
      setDomain({ p: item.p, a: item.a, b: item.b, q: item.q, ax: item.A[0], ay: item.A[1] });
      setBx(''); setBy(''); setR(''); setS('');
    }
  }
  function input(label: string, value: string, setter: (value: string) => void) {
    return <label className="block">{label}<input className={inputStyle} value={value} inputMode="numeric"
      maxLength={617} autoComplete="off" onChange={event => { setter(event.target.value); clear(); }} /></label>;
  }
  const valid = /^signature = VALID$/m.test(output);
  const invalid = /^signature = INVALID$/m.test(output);
  return <div className="space-y-6">
    <fieldset disabled={busy} className={panelStyle}>
      <legend className="px-2 text-xl font-bold">{t('Parámetros públicos', 'Public parameters')}</legend>
      <p className="font-mono text-accent">E: y² = x³ + ax + b mod p · B = dA</p>
      <label className="block">{t('Cargar ejemplo', 'Load example')}
        <select className={inputStyle} value="" onChange={event => preset(event.target.value)}>
          <option value="">{t('Seleccionar…', 'Select…')}</option>
          <option value="registered">{t('Firma registrada · m = 20045', 'Registered signature · m = 20045')}</option>
          {large.map(item => <option key={item.bits} value={item.bits}>{item.bits} bits · y² = x³ + x</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-4">
        {(['p', 'a', 'b', 'q'] as const).map(name => <div key={name}>{input(name, domain[name], value => setDomain({ ...domain, [name]: value }))}</div>)}
      </div>
      <p className="text-text-secondary">{t('Punto generador A = (x, y, 1)', 'Generator A = (x, y, 1)')}</p>
      <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-4">
        {input('A.x', domain.ax, value => setDomain({ ...domain, ax: value }))}
        {input('A.y', domain.ay, value => setDomain({ ...domain, ay: value }))}
      </div>
      <p className="text-sm text-text-secondary">{t('Se comprueba que p y q sean primos probables, que la curva sea no singular y que qA = O. Los ejemplos grandes tienen orden 4q; A genera el subgrupo de orden q.',
        'Checks probable primes p and q, a nonsingular curve and qA = O. Large examples have order 4q; A generates the order-q subgroup.')}</p>
    </fieldset>
    <div className="grid grid-cols-2 max-lg:grid-cols-1 gap-6 items-start">
      <fieldset disabled={busy} className={panelStyle}>
        <legend className="px-2 text-xl font-bold">{t('1. Claves y firma', '1. Keys and signing')}</legend>
        {input(t('Clave privada d', 'Private key d'), d, setD)}
        <div className="flex flex-wrap gap-3">
          <button className={buttonStyle} onClick={() => run('keygen')}>{t('Generar claves', 'Generate keys')}</button>
          <button className={buttonStyle} onClick={() => { setR(''); setS(''); run('public'); }}>{t('Calcular B = dA', 'Compute B = dA')}</button>
        </div>
        {input(t('Mensaje m', 'Message m'), message, setMessage)}
        <p className="font-mono text-sm text-text-secondary">0 &lt; m, d &lt; q<br />R = k_E A · r = x_R mod q<br />s = (m + dr) k_E⁻¹ mod q</p>
        <button className={buttonStyle} onClick={() => run('sign')}>{t('Firmar mensaje', 'Sign message')}</button>
      </fieldset>
      <fieldset disabled={busy} className={panelStyle}>
        <legend className="px-2 text-xl font-bold">{t('2. Verificación', '2. Verification')}</legend>
        <p className="text-text-secondary">{t('Introduce la clave pública B y la firma recibida. Se usa el mensaje m del panel anterior.', 'Enter the received public key B and signature. Uses message m from the previous panel.')}</p>
        <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-4">
          {input('B.x', bx, setBx)}{input('B.y', by, setBy)}
          {input('r', r, setR)}{input('s', s, setS)}
        </div>
        <div className="flex flex-wrap gap-3">
          <button className={buttonStyle} onClick={() => run('verify')}>{t('Verificar firma', 'Verify signature')}</button>
          <button className={buttonStyle} onClick={() => {
            if (!/^\d+$/.test(message) || !/^\d+$/.test(domain.q) || BigInt(domain.q) <= 2n) {
              setError(t('Revisa m y q.', 'Check m and q.')); return;
            }
            const next = BigInt(message) + 1n < BigInt(domain.q) ? String(BigInt(message) + 1n) : '1';
            setMessage(next); run('verify', next);
          }}>{t('Cambiar m y verificar', 'Change m and verify')}</button>
        </div>
      </fieldset>
    </div>
    <fieldset disabled={busy} className={panelStyle}>
      <legend className="px-2 text-xl font-bold">{t('3. Experimentos', '3. Experiments')}</legend>
      <p className="text-text-secondary">{t('Alice y Bob generan claves independientes, firman m y verifican las firmas y un mensaje modificado. Todo el intercambio se simula en este navegador.',
        'Alice and Bob generate independent keys, sign m and verify both signatures and a modified message. The exchange is simulated in this browser.')}</p>
      <div className="flex flex-wrap gap-3">
        <button className={buttonStyle} onClick={() => run('demo')}>{t('Probar Alice y Bob', 'Test Alice and Bob')}</button>
        <button className={buttonStyle} onClick={() => run('dlog')}>{t('Recuperar d en curva pequeña', 'Recover d on a small curve')}</button>
      </div>
      <p className="text-sm text-text-secondary">{t('La búsqueda de d usa baby-step giant-step y busca 1 ≤ d ≤ min(q−1, 2³²−1). Los ejemplos de 128 a 1024 bits sirven para probar la aritmética; sus curvas supersingulares no son parámetros de producción.',
        'The search for d uses baby-step giant-step and searches 1 ≤ d ≤ min(q−1, 2³²−1). The 128–1024-bit examples exercise the arithmetic; these supersingular curves are not production parameters.')}</p>
    </fieldset>
    {busy && <div role="status" className="flex flex-wrap gap-4 items-center">
      <span>{t('Calculando… Las curvas grandes pueden tardar.', 'Computing… Large curves may take a while.')}</span>
      <button className={buttonStyle} onClick={() => { worker.current?.terminate(); worker.current = null; setBusy(false); setError(t('Cálculo cancelado.', 'Calculation cancelled.')); }}>{t('Cancelar', 'Cancel')}</button>
    </div>}
    {error && <pre role="alert" className="p-4 border border-red-400 text-red-300 whitespace-pre-wrap break-words">{error}</pre>}
    {output && <section ref={result} aria-label={t('Resultados', 'Results')} aria-live="polite" className="scroll-mt-24">
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <h2 className="text-2xl font-bold">{t('Resultados', 'Results')}</h2>
        {(valid || invalid) && <strong className={valid ? 'text-green-400' : 'text-red-400'}>{valid ? t('Firma válida', 'Valid signature') : t('Firma inválida', 'Invalid signature')}</strong>}
      </div>
      <pre id="toy-ecdsa-output" tabIndex={0} className="bg-[#0c0c12] border border-border p-5 font-mono text-sm whitespace-pre-wrap break-all max-h-[720px] overflow-auto">{output}</pre>
    </section>}
    <p className="text-sm text-text-secondary">{t('Práctica didáctica en C17 y WebAssembly. Los cálculos y la clave privada permanecen en este navegador. rand() y la aritmética sin tiempo constante no son adecuados para firmas reales.',
      'Educational C17 and WebAssembly implementation. Calculations and the private key stay in this browser. rand() and non-constant-time arithmetic are unsuitable for real signatures.')}</p>
  </div>;
}
