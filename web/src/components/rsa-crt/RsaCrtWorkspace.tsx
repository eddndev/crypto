import { useEffect, useRef, useState } from 'react';
import { parseValues, startCli, type CliResult } from '../wasm-cli';

type Panel = 'keygen' | 'encrypt' | 'decrypt';
type Keys = Record<'e' | 'n' | 'p' | 'q' | 'd' | 'dp' | 'dq', string>;
type Private = Record<'p' | 'q' | 'n' | 'd' | 'dp' | 'dq', string>;
const crtNames = ['cp', 'cq', 'mp', 'mq', 'q_inv', 'h', 'm'] as const;
const formulas: Record<(typeof crtNames)[number], string> = {
  cp: 'c mod p', cq: 'c mod q', mp: 'cp^dp mod p', mq: 'cq^dq mod q',
  q_inv: 'q⁻¹ mod p', h: 'q_inv · (mp − mq) mod p', m: 'mq + h · q',
};
const emptyPrivate: Private = { p: '', q: '', n: '', d: '', dp: '', dq: '' };
const inputStyle = 'block mt-2 w-full min-w-0 border border-border bg-bg-primary px-3 py-2 font-mono text-sm break-all resize-y focus:outline-accent';
const buttonStyle = 'px-5 py-3 bg-accent text-black font-semibold cursor-pointer disabled:opacity-50';
const panelStyle = 'border border-border bg-bg-card p-6 space-y-4 min-w-0';
const digits = (value: string) => value.replace(/\s+/g, '');
const rejected: Record<Panel, string> = {
  keygen: 'El programa no pudo generar el par de claves.',
  encrypt: 'El programa rechazó la entrada: m, e y n deben cumplir 0 < m < n y 1 < e < n.',
  decrypt: 'El programa rechazó la entrada: revisa que 0 < c < n, n = pq, p y q sean primos distintos, dp = d mod (p − 1) y dq = d mod (q − 1).',
};

export default function RsaCrtWorkspace({ lang = 'es' }: { lang?: 'es' | 'en' }) {
  const t = (spanish: string, english: string) => lang === 'es' ? spanish : english;
  const [bits, setBits] = useState('512');
  const [keys, setKeys] = useState<Keys | null>(null);
  const [m, setM] = useState('');
  const [e, setE] = useState('');
  const [n, setN] = useState('');
  const [c, setC] = useState('');
  const [ciphertext, setCiphertext] = useState('');
  const [decryptC, setDecryptC] = useState('');
  const [secret, setSecret] = useState<Private>(emptyPrivate);
  const [crt, setCrt] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState<Panel | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Panel, string>>>({});
  const [copied, setCopied] = useState('');
  const cancel = useRef<(() => void) | null>(null);
  useEffect(() => () => cancel.current?.(), []);
  const fail = (panel: Panel, message: string) => setErrors(previous => ({ ...previous, [panel]: message }));

  async function run(panel: Panel, args: string[]): Promise<CliResult | null> {
    setErrors(previous => ({ ...previous, [panel]: '' }));
    setBusy(panel);
    const job = startCli('/workers/rsa-crt.js', { args });
    cancel.current = job.cancel;
    const result = await job.result;
    cancel.current = null;
    setBusy(null);
    if (result.cancelled) { fail(panel, t('Cálculo cancelado.', 'Calculation cancelled.')); return null; }
    if (result.code !== 0) {
      // El programa en C escribe sus errores en inglés; en español se antepone una explicación.
      const detail = result.error && result.error !== 'module' ? result.error : '';
      fail(panel, result.error === 'module' ? t('No se pudo cargar el programa.', 'Could not load the program.')
        : lang === 'es' ? `${rejected[panel]}${detail ? '\n' + detail : ''}` : detail || 'Calculation failed.');
      return null;
    }
    return result;
  }

  async function generate() {
    const size = Number(bits);
    if (!Number.isInteger(size) || size < 4 || size > 1024) { fail('keygen', t('Elige un tamaño entre 4 y 1024 bits.', 'Choose a size from 4 to 1024 bits.')); return; }
    setKeys(null);
    const result = await run('keygen', ['keygen', String(size)]);
    if (!result) return;
    const values = parseValues(result.output);
    const names = ['e', 'n', 'p', 'q', 'd', 'dp', 'dq'] as const;
    if (names.some(name => !/^\d+$/.test(values[name] ?? ''))) { fail('keygen', t('Salida inesperada del programa.', 'Unexpected program output.')); return; }
    setKeys(Object.fromEntries(names.map(name => [name, values[name]])) as Keys);
  }

  async function encrypt() {
    const args = [digits(m), digits(e), digits(n)];
    if (args.some(value => !/^\d+$/.test(value) || value.length > 617)) { fail('encrypt', t('Introduce m, e y n como enteros decimales.', 'Enter m, e and n as decimal integers.')); return; }
    setCiphertext('');
    const result = await run('encrypt', ['encrypt', ...args]);
    const value = result && parseValues(result.output).c;
    if (result && !value) fail('encrypt', t('Salida inesperada del programa.', 'Unexpected program output.'));
    if (value) setCiphertext(value);
  }

  async function decrypt() {
    const args = [decryptC, secret.p, secret.q, secret.n, secret.d, secret.dp, secret.dq].map(digits);
    if (args.some(value => !/^\d+$/.test(value) || value.length > 617)) { fail('decrypt', t('Introduce c y la clave privada como enteros decimales.', 'Enter c and the private key as decimal integers.')); return; }
    setCrt(null);
    const result = await run('decrypt', ['decrypt', ...args]);
    if (!result) return;
    const values = parseValues(result.output);
    if (crtNames.some(name => !values[name])) { fail('decrypt', t('Salida inesperada del programa.', 'Unexpected program output.')); return; }
    setCrt(values);
  }

  function fillPanels() {
    if (!keys) return;
    setE(keys.e); setN(keys.n); setCiphertext('');
    setSecret({ p: keys.p, q: keys.q, n: keys.n, d: keys.d, dp: keys.dp, dq: keys.dq }); setCrt(null);
    setErrors({});
  }
  async function copy(label: string, value: string) {
    try { await navigator.clipboard.writeText(value); setCopied(label); setTimeout(() => setCopied(current => current === label ? '' : current), 1500); }
    catch { setCopied(''); }
  }
  function field(label: string, value: string, setter: (value: string) => void, onChange?: () => void) {
    return <label className="block">{label}<textarea className={inputStyle} rows={2} value={value} inputMode="numeric" spellCheck={false}
      autoComplete="off" onChange={event => { setter(event.target.value); onChange?.(); }} /></label>;
  }
  function value(label: string, text: string, id: string) {
    return <div className="border border-border bg-bg-primary p-3 min-w-0">
      <div className="flex items-center justify-between gap-3 mb-1">
        <span className="font-mono text-sm text-accent">{label}</span>
        <button type="button" className="font-mono text-xs text-text-secondary hover:text-accent cursor-pointer" onClick={() => copy(id, text)}>
          {copied === id ? t('Copiado', 'Copied') : t('Copiar', 'Copy')}
        </button>
      </div>
      <p className="font-mono text-sm break-all">{text}</p>
    </div>;
  }
  function status(panel: Panel) {
    return <>
      {busy === panel && <div role="status" className="flex flex-wrap gap-4 items-center">
        <span>{t('Calculando…', 'Computing…')}</span>
        <button type="button" className="text-accent underline cursor-pointer" onClick={() => cancel.current?.()}>{t('Cancelar', 'Cancel')}</button>
      </div>}
      {errors[panel] && <pre role="alert" className="p-4 border border-red-400 text-red-300 whitespace-pre-wrap break-words">{errors[panel]}</pre>}
    </>;
  }

  return <div className="space-y-6">
    <p className="text-text-secondary">{t('RSA de libro de texto con aritmética Handcrafted en C17. OpenSSL solo genera los primos p y q; e, d, dp, dq, el cifrado y el descifrado por TCR se calculan a mano. Square and Multiply (algoritmo 1) calcula cada potencia modular.',
      'Schoolbook RSA with Handcrafted C17 arithmetic. OpenSSL only generates the primes p and q; e, d, dp, dq, encryption and CRT decryption are computed by hand. Square and Multiply (Algorithm 1) computes every modular power.')}</p>
    <fieldset disabled={busy !== null} className={panelStyle}>
      <legend className="px-2 text-xl font-bold">{t('1. Generación del par de claves', '1. Key pair generation')}</legend>
      <p className="font-mono text-sm text-text-secondary">|p| = |q| · n = pq · e {t('aleatorio', 'random')}, gcd(e, φ(n)) = 1 · d = e⁻¹ mod φ(n)<br />dp = d mod (p − 1) · dq = d mod (q − 1)</p>
      <div className="flex flex-wrap gap-4 items-end">
        <label className="block">{t('Bits de cada primo (4 a 1024)', 'Bits per prime (4 to 1024)')}
          <input className={inputStyle} type="number" min={4} max={1024} value={bits} onChange={event => setBits(event.target.value)} /></label>
        <button type="button" className={buttonStyle} onClick={generate}>{t('Generar claves', 'Generate keys')}</button>
      </div>
      {status('keygen')}
      {keys && <div className="space-y-5" aria-live="polite">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold">{t('Clave pública', 'Public key')} <span className="normal-case">(e, n)</span></h2>
            <button type="button" className="font-mono text-sm text-accent underline cursor-pointer" onClick={() => copy('public', `e = ${keys.e}\nn = ${keys.n}`)}>{copied === 'public' ? t('Copiada', 'Copied') : t('Copiar clave pública', 'Copy public key')}</button>
          </div>
          <div className="grid gap-3">{value('e', keys.e, 'e')}{value('n', keys.n, 'n')}</div>
        </div>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold">{t('Clave privada', 'Private key')} <span className="normal-case">(p, q, n, d, dp, dq)</span></h2>
            <button type="button" className="font-mono text-sm text-accent underline cursor-pointer"
              onClick={() => copy('private', (['p', 'q', 'n', 'd', 'dp', 'dq'] as const).map(name => `${name} = ${keys[name]}`).join('\n'))}>{copied === 'private' ? t('Copiada', 'Copied') : t('Copiar clave privada', 'Copy private key')}</button>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {value('p', keys.p, 'p')}{value('q', keys.q, 'q')}
            <div className="md:col-span-2">{value('n', keys.n, 'n-private')}</div>
            <div className="md:col-span-2">{value('d', keys.d, 'd')}</div>
            {value('dp', keys.dp, 'dp')}{value('dq', keys.dq, 'dq')}
          </div>
        </div>
        <button type="button" className={buttonStyle} onClick={fillPanels}>{t('Usar en cifrado y descifrado', 'Use for encryption and decryption')}</button>
      </div>}
    </fieldset>
    <div className="grid grid-cols-2 max-lg:grid-cols-1 gap-6 items-start">
      <fieldset disabled={busy !== null} className={panelStyle}>
        <legend className="px-2 text-xl font-bold">{t('2. Cifrado', '2. Encryption')}</legend>
        <p className="font-mono text-sm text-text-secondary">c = m^e mod n · 0 &lt; m &lt; n</p>
        {field(t('Mensaje m', 'Message m'), m, setM, () => setCiphertext(''))}
        {field('e', e, setE, () => setCiphertext(''))}
        {field('n', n, setN, () => setCiphertext(''))}
        <button type="button" className={buttonStyle} onClick={encrypt}>{t('Cifrar', 'Encrypt')}</button>
        {status('encrypt')}
        {ciphertext && <div className="space-y-3" aria-live="polite">
          {value('c', ciphertext, 'c')}
          <button type="button" className="font-mono text-sm text-accent underline cursor-pointer" onClick={() => { setDecryptC(ciphertext); setCrt(null); }}>{t('Usar c en el descifrado', 'Use c for decryption')}</button>
        </div>}
      </fieldset>
      <fieldset disabled={busy !== null} className={panelStyle}>
        <legend className="px-2 text-xl font-bold">{t('3. Descifrado con TCR', '3. CRT decryption')}</legend>
        <p className="font-mono text-sm text-text-secondary">0 &lt; c &lt; n · n = pq · dp = d mod (p − 1) · dq = d mod (q − 1)</p>
        {field(t('Texto cifrado c', 'Ciphertext c'), decryptC, setDecryptC, () => setCrt(null))}
        <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-4">
          {(['p', 'q'] as const).map(name => <div key={name}>{field(name, secret[name], next => setSecret(previous => ({ ...previous, [name]: next })), () => setCrt(null))}</div>)}
        </div>
        {(['n', 'd'] as const).map(name => <div key={name}>{field(name, secret[name], next => setSecret(previous => ({ ...previous, [name]: next })), () => setCrt(null))}</div>)}
        <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-4">
          {(['dp', 'dq'] as const).map(name => <div key={name}>{field(name, secret[name], next => setSecret(previous => ({ ...previous, [name]: next })), () => setCrt(null))}</div>)}
        </div>
        <button type="button" className={buttonStyle} onClick={decrypt}>{t('Descifrar', 'Decrypt')}</button>
        {status('decrypt')}
      </fieldset>
    </div>
    {crt && <section aria-label={t('Valores del TCR', 'CRT values')} aria-live="polite" className="space-y-4">
      <h2 className="text-2xl font-bold">{t('Valores del TCR', 'CRT values')}</h2>
      <div className="relative overflow-x-auto border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-bg-card font-mono text-text-secondary">
            <tr><th className="p-3">{t('Valor', 'Value')}</th><th className="p-3">{t('Cálculo', 'Computation')}</th><th className="p-3">{t('Resultado', 'Result')}</th><th className="p-3"><span className="sr-only">{t('Copiar', 'Copy')}</span></th></tr>
          </thead>
          <tbody>
            {crtNames.map(name => <tr key={name} className="border-t border-border align-top">
              <td className={'p-3 font-mono ' + (name === 'm' ? 'text-accent font-bold' : 'text-accent')}>{name}</td>
              <td className="p-3 font-mono text-text-secondary whitespace-nowrap">{formulas[name]}</td>
              <td className="p-3 font-mono break-all min-w-[220px]">{crt[name]}</td>
              <td className="p-3"><button type="button" className="font-mono text-xs text-text-secondary hover:text-accent cursor-pointer" onClick={() => copy('crt-' + name, crt[name])}>{copied === 'crt-' + name ? t('Copiado', 'Copied') : t('Copiar', 'Copy')}</button></td>
            </tr>)}
          </tbody>
        </table>
      </div>
      {ciphertext && digits(decryptC) === ciphertext && digits(m).replace(/^0+(?=\d)/, '') === crt.m && <p className="text-green-400">{t('m coincide con el mensaje cifrado en el panel 2.', 'm matches the message encrypted in panel 2.')}</p>}
    </section>}
    <p className="text-sm text-text-secondary">{t('Práctica didáctica: RSA sin relleno y aritmética de tiempo variable. Los cálculos permanecen en este navegador; no uses estas claves para proteger información real.',
      'Educational practice: unpadded RSA and variable-time arithmetic. Calculations stay in this browser; do not use these keys to protect real data.')}</p>
  </div>;
}
