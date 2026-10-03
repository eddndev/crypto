import { useEffect, useRef, useState } from 'react';

type Mode = 'keygen' | 'sign' | 'verify' | 'ecdh';
type ResultFile = { name: string; bytes: Uint8Array };
type Reply = { code: number; output: string; error: string; files: ResultFile[] };
const inputStyle = 'block w-full mt-2 min-w-0 border border-border bg-bg-primary p-3 font-mono text-sm focus:outline-accent';
const buttonStyle = 'bg-accent text-black px-5 py-3 font-semibold cursor-pointer disabled:opacity-50';
const panelStyle = 'border border-border bg-bg-card p-6 space-y-5 min-w-0';

export default function StandardEcWorkspace({ lang }: { lang: 'en' | 'es' }) {
  const es = lang === 'es';
  const t = (a: string, b: string) => es ? a : b;
  const [mode, setMode] = useState<Mode>('keygen');
  const [curve, setCurve] = useState('P-256');
  const [privateFile, setPrivateFile] = useState<File | null>(null);
  const [publicFile, setPublicFile] = useState<File | null>(null);
  const [messageFile, setMessageFile] = useState<File | null>(null);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [privateName, setPrivateName] = useState('private.pem');
  const [publicName, setPublicName] = useState('public.pem');
  const [signatureName, setSignatureName] = useState('signature.txt');
  const [aliceName, setAliceName] = useState('alice-public.pem');
  const [bobName, setBobName] = useState('bob-public.pem');
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<Reply | null>(null);
  const [error, setError] = useState('');
  const worker = useRef<Worker | null>(null);
  useEffect(() => () => worker.current?.terminate(), []);
  const clear = () => { setReply(null); setError(''); };
  const labels = {
    keygen: t('Generar claves', 'Generate keys'),
    sign: t('Firmar archivo', 'Sign file'),
    verify: t('Verificar firma', 'Verify signature'),
    ecdh: t('Simular ECDH', 'Simulate ECDH'),
  };

  async function run(parameters = false) {
    clear();
    const inputs: { name: string; bytes: ArrayBuffer }[] = [];
    let command = `parameters ${curve}`;
    let outputs: string[] = [];
    try {
      if (!parameters) {
        const selected = mode === 'sign' ? [[privateFile, 'private.pem'], [messageFile, 'message.bin']]
          : mode === 'verify' ? [[publicFile, 'public.pem'], [messageFile, 'message.bin'], [signatureFile, 'signature.txt']]
          : [];
        for (const [file, name] of selected as [File | null, string][]) {
          if (!file) throw new Error(t('Selecciona todos los archivos de esta operación.', 'Select all files for this operation.'));
          if (file.size > (name === 'message.bin' ? 16 * 1024 * 1024 : 16384)) {
            throw new Error(t('El mensaje admite hasta 16 MiB y las claves o firmas hasta 16 KiB.', 'Messages support up to 16 MiB; keys and signatures up to 16 KiB.'));
          }
          inputs.push({ name, bytes: await file.arrayBuffer() });
        }
        if (mode === 'keygen') {
          if (!privateName.trim() || !publicName.trim() || privateName === publicName) {
            throw new Error(t('Elige dos nombres de archivo diferentes.', 'Choose two different filenames.'));
          }
          command = `keygen ${curve} private.pem public.pem`;
          outputs = ['private.pem', 'public.pem'];
        } else if (mode === 'sign') {
          if (!signatureName.trim()) throw new Error(t('Indica el nombre de la firma.', 'Enter the signature filename.'));
          command = 'sign private.pem message.bin signature.txt'; outputs = ['signature.txt'];
        } else if (mode === 'verify') {
          command = 'verify public.pem message.bin signature.txt';
        } else {
          if (!aliceName.trim() || !bobName.trim() || aliceName === bobName) {
            throw new Error(t('Elige dos nombres de archivo diferentes.', 'Choose two different filenames.'));
          }
          command = `ecdh ${curve} alice.pem bob.pem`; outputs = ['alice.pem', 'bob.pem'];
        }
      }
      setBusy(true);
      const job = new Worker('/workers/standard-ec.js', { type: 'module' });
      worker.current = job;
      job.onmessage = ({ data }: MessageEvent<Reply>) => {
        setReply(data);
        if (data.code === 1) setError(data.error || t('No se pudo completar la operación.', 'Could not complete the operation.'));
        setBusy(false); job.terminate(); worker.current = null;
      };
      job.onerror = () => {
        setError(t('No se pudo cargar OpenSSL. Recarga la página e inténtalo otra vez.', 'Could not load OpenSSL. Reload the page and try again.'));
        setBusy(false); job.terminate(); worker.current = null;
      };
      job.postMessage({ command, inputs, outputs });
    } catch (reason) {
      setError(String(reason instanceof Error ? reason.message : reason));
      setBusy(false);
    }
  }

  function download(file: ResultFile) {
    const names: Record<string, string> = {
      'private.pem': privateName, 'public.pem': publicName, 'signature.txt': signatureName,
      'alice.pem': aliceName, 'bob.pem': bobName,
    };
    const copy = new Uint8Array(file.bytes);
    const url = URL.createObjectURL(new Blob([copy.buffer], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url; link.download = names[file.name] || file.name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function upload(label: string, update: (file: File | null) => void) {
    return <label className="block">{label}<input className={inputStyle} type="file"
      onChange={event => { update(event.target.files?.[0] ?? null); clear(); }} /></label>;
  }
  function filename(label: string, value: string, update: (name: string) => void) {
    return <label className="block">{label}<input className={inputStyle} value={value}
      maxLength={120} onChange={event => { update(event.target.value); clear(); }} /></label>;
  }
  return <div className="space-y-6" id="standard-ec-workspace">
    <fieldset disabled={busy} className={panelStyle}>
      <legend className="px-2 text-xl font-bold">{t('Operación', 'Operation')}</legend>
      <label className="block">{t('Qué deseas hacer', 'Choose an operation')}
        <select className={inputStyle} value={mode} onChange={event => { setMode(event.target.value as Mode); clear(); }}>
          {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      {(mode === 'keygen' || mode === 'ecdh') && <>
        <label className="block">{t('Curva NIST', 'NIST curve')}
          <select className={inputStyle} value={curve} onChange={event => { setCurve(event.target.value); clear(); }}>
            {['P-224', 'P-256', 'P-384', 'P-521'].map(value => <option key={value}>{value}</option>)}
          </select>
        </label>
        <button className="text-accent underline cursor-pointer" onClick={() => run(true)}>{t('Ver parámetros', 'Show parameters')}</button>
      </>}
      {mode === 'keygen' && <div className="grid md:grid-cols-2 gap-4">
        {filename(t('Nombre de la clave privada', 'Private key filename'), privateName, setPrivateName)}
        {filename(t('Nombre de la clave pública', 'Public key filename'), publicName, setPublicName)}
      </div>}
      {mode === 'sign' && <>
        {upload(t('Clave privada (.pem)', 'Private key (.pem)'), setPrivateFile)}
        {upload(t('Archivo que deseas firmar', 'File to sign'), setMessageFile)}
        {filename(t('Nombre del archivo de firma', 'Signature filename'), signatureName, setSignatureName)}
      </>}
      {mode === 'verify' && <>
        {upload(t('Clave pública (.pem)', 'Public key (.pem)'), setPublicFile)}
        {upload(t('Archivo que deseas verificar', 'File to verify'), setMessageFile)}
        {upload(t('Firma (r, s) (.txt)', 'Signature (r, s) (.txt)'), setSignatureFile)}
      </>}
      {mode === 'ecdh' && <>
        <p className="text-text-secondary">{t('Alice y Bob generan claves nuevas y calculan el mismo punto K = abG. La simulación muestra K, su coordenada x y la clave derivada para comparar los resultados.', 'Alice and Bob generate fresh keys and compute the same point K = abG. The simulation shows K, its x-coordinate and the derived key so you can compare their results.')}</p>
        <div className="grid md:grid-cols-2 gap-4">
          {filename(t('Archivo público de Alice', 'Alice public filename'), aliceName, setAliceName)}
          {filename(t('Archivo público de Bob', 'Bob public filename'), bobName, setBobName)}
        </div>
      </>}
      <p className="text-text-secondary text-sm">{t('Las claves se guardan como PEM con contenido Base64. Las firmas usan dos enteros hexadecimales: r y s. Para firmar o verificar, la curva y SHA-2 se seleccionan a partir de la clave.', 'Keys use PEM with Base64 contents. Signatures contain two hexadecimal integers: r and s. Signing and verification select the curve and SHA-2 hash from the key.')}</p>
      <button className={buttonStyle} onClick={() => run()}>{busy ? t('Calculando…', 'Working…') : labels[mode]}</button>
    </fieldset>
    {error && <p role="alert" className="border border-red-400 text-red-300 p-4 whitespace-pre-wrap break-words">{error}</p>}
    {reply && reply.code !== 1 && <section className={panelStyle} aria-label={t('Resultado', 'Result')} aria-live="polite">
      <h2 className="text-xl font-bold">{t('Resultado', 'Result')}</h2>
      {reply.output.includes('Valid = ') && <p className={reply.code === 0 ? 'text-accent font-bold' : 'text-red-300 font-bold'}>
        {reply.code === 0 ? t('Firma válida', 'Valid signature') : t('Firma inválida', 'Invalid signature')}
      </p>}
      <pre className="text-sm leading-relaxed whitespace-pre-wrap break-all font-mono" id="standard-ec-output">{reply.output}</pre>
      <div className="flex flex-wrap gap-3">{reply.files.map(file => <button key={file.name}
        className={buttonStyle} onClick={() => download(file)}>{t('Descargar', 'Download')} {({ 'private.pem': privateName, 'public.pem': publicName, 'signature.txt': signatureName, 'alice.pem': aliceName, 'bob.pem': bobName } as Record<string,string>)[file.name]}</button>)}</div>
    </section>}
  </div>;
}
