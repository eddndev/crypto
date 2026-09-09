import { useEffect, useRef, useState, type FormEvent } from 'react';

export default function CurveArithmeticWorkspace({ lang }: { lang: 'es' | 'en' }) {
  const es = lang === 'es';
  const [output, setOutput] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const worker = useRef<Worker | null>(null);
  useEffect(() => () => worker.current?.terminate(), []);
  const input = 'block mt-2 w-full min-w-0 border border-border bg-bg-primary px-3 py-2 font-mono focus:outline-accent';
  const button = 'mt-5 px-5 py-3 bg-accent text-black font-semibold cursor-pointer disabled:opacity-50';
  function run(event: FormEvent<HTMLFormElement>, operation: string) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const names = operation === 'generate' ? ['bits', 'seed'] : ['p', 'a', 'b', 'px', 'py', 'pz', ...(operation === 'add' ? ['qx', 'qy', 'qz'] : [])];
    const values = names.map(name => String(data.get(name) ?? '').trim());
    if (values.some(value => !/^\d+$/.test(value) || value.length > 617)) {
      setError(es ? 'Escribe enteros no negativos en decimal.' : 'Enter nonnegative decimal integers.'); return;
    }
    setError(''); setBusy(operation); setOutput(old => ({ ...old, [operation]: '' }));
    worker.current?.terminate();
    const job = new Worker('/workers/elliptic-arithmetic.js', { type: 'module' });
    worker.current = job;
    job.onmessage = ({ data }) => {
      if (data.code) setError(data.error || (es ? 'Revisa los parametros.' : 'Check the parameters.'));
      else setOutput(old => ({ ...old, [operation]: data.output }));
      setBusy(''); job.terminate(); worker.current = null;
    };
    job.onerror = () => {
      setError(es ? 'No se pudo cargar el calculo. Recarga la pagina.' : 'Could not load the calculation. Reload the page.');
      setBusy(''); job.terminate(); worker.current = null;
    };
    job.postMessage({ command: `${operation} ${values.join(' ')}` });
  }
  function result(operation: string) {
    return output[operation] && <pre id={`${operation}-output`} className="mt-6 p-4 bg-[#0c0c12] text-sm font-mono whitespace-pre-wrap break-all max-h-[640px] overflow-auto" tabIndex={0}>{output[operation]}</pre>;
  }
  return <div className="mt-12" id="arithmetic-workspace">
    <h2 className="text-3xl font-bold mb-4">{es ? 'Aritmética de curvas elípticas' : 'Elliptic curve arithmetic'}</h2>
    <p className="text-text-secondary mb-6">{es ? 'Enteros de hasta 2048 bits. Usa decimales y puntos (x, y, 1); el infinito es (0, 1, 0). En suma y duplicación se supone p primo y se verifica que los puntos pertenezcan a la curva.' : 'Integers up to 2048 bits. Use decimals and points (x, y, 1); infinity is (0, 1, 0). Addition and doubling assume prime p and check that points belong to the curve.'}</p>
    <section id="generate-section" className="border border-border bg-bg-card p-6 mb-6">
      <h3 className="text-2xl font-bold mb-3">{es ? 'Generar una curva' : 'Generate a curve'}</h3>
      <p className="text-text-secondary mb-4">{es ? 'Miller–Rabin: 32 rondas, primo probable. Aleatoriedad de práctica. La semilla permite repetir la corrida en el mismo entorno.' : 'Miller–Rabin: 32 rounds, probable prime. Classroom randomness. The seed repeats a run in the same environment.'}</p>
      <form onSubmit={event => run(event, 'generate')}>
        <div className="grid grid-cols-2 gap-4">
          <label>{es ? 'Bits de p' : 'Bits of p'}<select name="bits" className={input} defaultValue="16">{[16,32,64,512,1024,2048].map(bits => <option key={bits}>{bits}</option>)}</select></label>
          <label>{es ? 'Semilla' : 'Seed'}<input name="seed" type="number" min="0" max="4294967295" defaultValue="20260908" required className={input} /></label>
        </div>
        <button disabled={!!busy} className={button}>{es ? 'Generar curva' : 'Generate curve'}</button>
      </form>{result('generate')}
    </section>
    <div className="grid grid-cols-2 max-lg:grid-cols-1 gap-6 items-start">
      {['add','double'].map(operation => <section key={operation} id={`${operation}-section`} className="border border-border bg-bg-card p-6 min-w-0">
        <h3 className="text-2xl font-bold mb-4">{operation === 'add' ? 'P + Q' : '2P'}</h3>
        <form onSubmit={event => run(event, operation)}>
          <div className="grid grid-cols-3 gap-3">
            {[['p','65537'],['a','1'],['b','1']].map(([name,value]) => <label key={name}>{name}<input name={name} inputMode="numeric" pattern="[0-9]+" defaultValue={value} required className={input} /></label>)}
          </div>
          {(operation === 'add' ? ['p','q'] : ['p']).map(point => <fieldset key={point} className="mt-4">
            <legend>{point.toUpperCase()} (x, y, z)</legend>
            <div className="grid grid-cols-[1fr_1fr_70px] gap-3">
              {['x','y','z'].map((coord,i) => <label key={coord}>{coord}<input name={point+coord} aria-label={`${point.toUpperCase()} ${coord}`} inputMode="numeric" pattern="[0-9]+" defaultValue={(point === 'p' ? ['49606','64426','1'] : ['2565','62370','1'])[i]} required className={input} /></label>)}
            </div>
          </fieldset>)}
          <button disabled={!!busy} className={button}>{operation === 'add' ? (es ? 'Sumar puntos' : 'Add points') : (es ? 'Duplicar punto' : 'Double point')}</button>
        </form>{result(operation)}
      </section>)}
    </div>
    <p role="status" className="mt-4 text-text-secondary">{busy ? (es ? 'Calculando…' : 'Computing…') : ''}</p>
    {error && <p role="alert" className="mt-4 p-4 border border-red-400 text-red-300 whitespace-pre-wrap">{error}</p>}
  </div>;
}
