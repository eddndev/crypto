import { useEffect, useRef, useState } from 'react';
import examples from '../../../../c/toy-ecdh/tests/fixtures/examples.json';
import large from '../../../../c/toy-ecdh/tests/fixtures/large.json';

type Parameters = { p: string; a: string; b: string; x1: string; y1: string; z1: string };
const defaults: Parameters = { p: '127', a: '1', b: '7', x1: '1', y1: '3', z1: '1' };
const inputClass = 'block mt-2 w-full min-w-0 border border-border bg-bg-primary px-3 py-2 font-mono focus:outline-accent';
const buttonClass = 'px-5 py-3 bg-accent text-black font-semibold cursor-pointer disabled:opacity-50';

export default function ToyEcdhWorkspace({ lang }: { lang: 'es' | 'en' }) {
  const es = lang === 'es';
  const [parameters, setParameters] = useState(defaults);
  const [k, setK] = useState('29');
  const [r, setR] = useState('13');
  const [s, setS] = useState('29');
  const [role, setRole] = useState('alice');
  const [method, setMethod] = useState('rtl');
  const [peer, setPeer] = useState({ x2: '', y2: '', z2: '1' });
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const worker = useRef<Worker | null>(null);
  useEffect(() => () => worker.current?.terminate(), []);
  const text = (spanish: string, english: string) => es ? spanish : english;
  const curve = [parameters.p, parameters.a, parameters.b].join(' ');
  const point = [parameters.x1, parameters.y1, parameters.z1].join(' ');

  function resetOutput() { setOutput(''); setError(''); }
  function run(commands: string[], values: string[], generated = false) {
    if (values.some(value => !/^\d+$/.test(value) || value.length > 617)) {
      setError(text('Completa los campos con enteros decimales no negativos (hasta 2048 bits).',
        'Fill in nonnegative decimal integers (up to 2048 bits).'));
      setOutput('');
      return;
    }
    resetOutput();
    setBusy(true);
    const job = new Worker('/workers/toy-ecdh.js', { type: 'module' });
    worker.current = job;
    job.onmessage = ({ data }) => {
      if (data.code) setError(data.error || text('Revisa los parámetros.', 'Check the parameters.'));
      else {
        setOutput(data.output);
        if (generated) {
          const secret = data.output.match(/^[rs] = (\d+)$/m)?.[1];
          if (secret) (role === 'alice' ? setR : setS)(secret);
        }
      }
      setBusy(false);
      job.terminate();
      worker.current = null;
    };
    job.onerror = () => {
      setError(text('No se pudo cargar el cálculo. Vuelve a intentarlo.', 'Could not load the calculation. Try again.'));
      setBusy(false);
      job.terminate();
      worker.current = null;
    };
    job.postMessage({ commands });
  }
  function cancel() {
    worker.current?.terminate();
    worker.current = null;
    setBusy(false);
    setError(text('Cálculo cancelado.', 'Calculation cancelled.'));
  }
  function preset(value: string) {
    if (value === '') return;
    resetOutput();
    setPeer({ x2: '', y2: '', z2: '1' });
    if (value === 'demo') {
      setParameters(defaults); setK('29'); setR('13'); setS('29');
    } else if (value.startsWith('example')) {
      const item = examples[Number(value.slice(7))];
      setParameters({ p: String(item.p), a: String(item.a), b: String(item.b),
        x1: String(item.P[0]), y1: String(item.P[1]), z1: String(item.P[2]) });
      setK(String(item.k));
    } else {
      const item = large.find(item => String(item.bits) === value)!;
      setParameters({ p: item.p, a: item.a, b: item.b, x1: item.G[0], y1: item.G[1], z1: item.G[2] });
      setK(item.r); setR(item.r); setS(item.s);
    }
  }
  const values = Object.values(parameters);
  const secret = role === 'alice' ? r : s;
  const publicLabel = role === 'alice' ? 'A = rG' : 'B = sG';
  const sharedLabel = role === 'alice' ? 'K_A = rB' : 'K_B = sA';

  return <div id="toy-ecdh-workspace" className="space-y-6">
    <fieldset disabled={busy} className="border border-border bg-bg-card p-6 space-y-5 min-w-0">
      <legend className="px-2 text-xl font-bold">{text('Parámetros públicos', 'Public parameters')}</legend>
      <p className="font-mono text-accent">y² = x³ + ax + b mod p</p>
      <label className="block">{text('Cargar ejemplo', 'Load example')}
        <select className={inputClass} value="" onChange={event => preset(event.target.value)}>
          <option value="">{text('Seleccionar…', 'Select…')}</option>
          <option value="demo">ECDH · p = 127</option>
          {examples.map((item, index) => <option key={index} value={`example${index}`}>kP · {index + 1} · p = {item.p}, k = {item.k}</option>)}
          {large.map(item => <option key={item.bits} value={item.bits}>ECDH · {item.bits} bits</option>)}
        </select>
      </label>
      <div className="grid grid-cols-3 max-sm:grid-cols-1 gap-4">
        {(['p', 'a', 'b'] as const).map(name => <label key={name}>{name}<input className={inputClass}
          value={parameters[name]} inputMode="numeric" maxLength={617} onChange={event => {
            setParameters({ ...parameters, [name]: event.target.value }); resetOutput();
          }} /></label>)}
      </div>
      <p>{text('P para kP; G para ECDH', 'P for kP; G for ECDH')} (x1, y1, z1)</p>
      <div className="grid grid-cols-[1fr_1fr_5rem] max-sm:grid-cols-1 gap-4">
        {(['x1', 'y1', 'z1'] as const).map(name => <label key={name}>{name}<input className={inputClass}
          value={parameters[name]} inputMode="numeric" maxLength={617} onChange={event => {
            setParameters({ ...parameters, [name]: event.target.value }); resetOutput();
          }} /></label>)}
      </div>
      <p className="text-sm text-text-secondary">{text(
        'Puntos normalizados (x1, y1, 1); infinito (0, 1, 0). ECDH exige p de al menos 7 bits y puntos finitos. La validación de p usa 32 rondas de Miller–Rabin.',
        'Normalized points (x1, y1, 1); infinity (0, 1, 0). ECDH requires at least 7-bit p and finite points. Prime validation uses 32 Miller–Rabin rounds.')}</p>
    </fieldset>

    <div className="grid grid-cols-2 max-lg:grid-cols-1 gap-6 items-start">
      <fieldset disabled={busy} className="border border-border bg-bg-card p-6 space-y-4 min-w-0">
        <legend className="px-2 text-xl font-bold">{text('Multiplicación escalar', 'Scalar multiplication')}</legend>
        <p className="text-text-secondary">{text('Compara todas las iteraciones: RTL recorre los bits desde el menos significativo y LTR desde el más significativo.',
          'Compare every iteration: RTL reads bits from least significant to most significant; LTR reads them in reverse.')}</p>
        <label className="block">k<input className={inputClass} value={k} inputMode="numeric" maxLength={617}
          onChange={event => { setK(event.target.value); resetOutput(); }} /></label>
        <button className={buttonClass} onClick={() => run(['rtl', 'ltr'].map(method =>
          `multiply ${method} ${curve} ${k} ${point} trace`), [...values, k])}>{text('Comparar RTL y LTR', 'Compare RTL and LTR')}</button>
        <p className="text-sm text-text-secondary">{text('Cada fila muestra Q y P al terminar la iteración. En RTL, P ya está duplicado; en LTR, P permanece fijo.',
          'Each row shows Q and P after the iteration. RTL shows the doubled working P; LTR keeps P fixed.')}</p>
      </fieldset>
      <fieldset disabled={busy} className="border border-border bg-bg-card p-6 space-y-4 min-w-0">
        <legend className="px-2 text-xl font-bold">{text('Simulación local de ECDH', 'Local ECDH simulation')}</legend>
        <p className="text-text-secondary">A = rG · B = sG<br />K_A = rB · K_B = sA</p>
        <div className="grid grid-cols-2 gap-4">
          <label>r · Alice<input className={inputClass} value={r} inputMode="numeric" maxLength={617}
            onChange={event => { setR(event.target.value); resetOutput(); }} /></label>
          <label>s · Bob<input className={inputClass} value={s} inputMode="numeric" maxLength={617}
            onChange={event => { setS(event.target.value); resetOutput(); }} /></label>
        </div>
        <button className={buttonClass} onClick={() => run([`demo ${curve} ${point} ${r} ${s}`], [...values, r, s])}>
          {text('Comparar K_A y K_B', 'Compare K_A and K_B')}</button>
        <p className="text-sm text-text-secondary">{text('Alice usa RTL y Bob usa LTR. Los secretos del ejemplo son públicos y sirven para repetir la prueba.',
          'Alice uses RTL and Bob uses LTR. Example secrets are public and intended for reproducible testing.')}</p>
      </fieldset>
    </div>

    <fieldset disabled={busy} className="border border-border bg-bg-card p-6 space-y-4 min-w-0">
      <legend className="px-2 text-xl font-bold">{text('Intercambio entre dos equipos', 'Exchange between two computers')}</legend>
      <p className="text-text-secondary">{text('Acuerden p, a, b y G. Cada persona genera su secreto en su equipo y comparte únicamente A o B. Introduce aquí la clave pública recibida y calcula tu K.',
        'Agree on p, a, b and G. Each person generates a secret on their own computer and shares only A or B. Enter the received public key here and compute your K.')}</p>
      <div className="grid grid-cols-3 max-sm:grid-cols-1 gap-4">
        <label>{text('Mi rol', 'My role')}<select className={inputClass} value={role} onChange={event => { setRole(event.target.value); resetOutput(); }}>
          <option value="alice">Alice · r</option><option value="bob">Bob · s</option></select></label>
        <label>{text('Algoritmo', 'Algorithm')}<select className={inputClass} value={method} onChange={event => { setMethod(event.target.value); resetOutput(); }}>
          <option value="rtl">RTL</option><option value="ltr">LTR</option></select></label>
        <label>{role === 'alice' ? 'r' : 's'} · {text('secreto local', 'local secret')}<input className={inputClass} value={secret} inputMode="numeric" maxLength={617}
          onChange={event => { (role === 'alice' ? setR : setS)(event.target.value); resetOutput(); }} /></label>
      </div>
      <div className="flex flex-wrap gap-3">
        <button className={buttonClass} onClick={() => {
          const seed = crypto.getRandomValues(new Uint32Array(1))[0];
          run([`keygen ${role} ${method} ${curve} ${point} ${seed}`], values, true);
        }}>{text('Generar secreto de práctica', 'Generate toy secret')}</button>
        <button className={buttonClass} onClick={() => run([`public ${role} ${method} ${curve} ${secret} ${point}`], [...values, secret])}>{publicLabel}</button>
      </div>
      <p>{role === 'alice' ? 'B' : 'A'} · {text('clave pública recibida', 'received public key')} (x2, y2, z2)</p>
      <div className="grid grid-cols-[1fr_1fr_5rem] max-sm:grid-cols-1 gap-4">
        {(['x2', 'y2', 'z2'] as const).map(name => <label key={name}>{name}<input className={inputClass} value={peer[name]}
          inputMode="numeric" maxLength={617} onChange={event => { setPeer({ ...peer, [name]: event.target.value }); resetOutput(); }} /></label>)}
      </div>
      <button className={buttonClass} onClick={() => run([`shared ${role} ${method} ${curve} ${secret} ${peer.x2} ${peer.y2} ${peer.z2}`],
        [parameters.p, parameters.a, parameters.b, secret, ...Object.values(peer)])}>{sharedLabel}</button>
    </fieldset>

    <p className="text-sm text-text-secondary">{text(
      'Implementación didáctica: rand() genera los secretos de práctica. No incluye autenticación, KDF, verificación del orden del subgrupo ni ejecución de tiempo constante. El resultado K es un punto, no una clave lista para cifrar.',
      'Educational implementation: rand() generates toy secrets. No authentication, KDF, subgroup-order verification or constant-time execution. K is a point, not an encryption-ready key.')}</p>
    {busy && <div role="status" className="flex flex-wrap items-center gap-4"><span>{text('Calculando… Los parámetros grandes pueden tardar.', 'Computing… Large parameters may take a while.')}</span>
      <button className={buttonClass} onClick={cancel}>{text('Cancelar', 'Cancel')}</button></div>}
    {error && <pre role="alert" className="border border-red-400 p-4 text-red-300 whitespace-pre-wrap break-words">{error}</pre>}
    {output && <section aria-label={text('Resultados', 'Results')} aria-live="polite">
      <h2 className="text-2xl font-bold mb-4">{text('Resultados', 'Results')}</h2>
      <pre id="toy-ecdh-output" tabIndex={0} className="bg-[#0c0c12] p-5 font-mono text-sm whitespace-pre-wrap break-all max-h-[720px] overflow-auto">{output}</pre>
    </section>}
  </div>;
}
