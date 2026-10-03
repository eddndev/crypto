import { useEffect, useRef, useState } from 'react';

type Mode = 'keygen' | 'sign' | 'verify' | 'ecdh' | 'derive';
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
  const [saltFile, setSaltFile] = useState<File | null>(null);
  const [peerFile, setPeerFile] = useState<File | null>(null);
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
    derive: t('ECDH con archivos', 'ECDH with files'),
  };

  async function run(parameters = false) {
    if (busy) return;
    clear();
    setBusy(true);
    const inputs: { name: string; bytes: ArrayBuffer }[] = [];
    let command = `parameters ${curve}`;
    let outputs: string[] = [];
    try {
      if (!parameters) {
        const selected = mode === 'sign' ? [[privateFile, 'private.pem'], [messageFile, 'message.bin']]
          : mode === 'verify' ? [[publicFile, 'public.pem'], [messageFile, 'message.bin'], [signatureFile, 'signature.txt']]
          : mode === 'derive' ? [[privateFile, 'private.pem'], [peerFile, 'peer.pem']]
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
        } else if (mode === 'derive') {
          command = 'derive private.pem peer.pem';
          if (saltFile) {
            if (saltFile.size !== 32) throw new Error(t('La sal compartida debe contener exactamente 32 bytes.', 'The shared salt must contain exactly 32 bytes.'));
            inputs.push({ name: 'salt.bin', bytes: await saltFile.arrayBuffer() });
            command += ' salt.bin';
          }
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
        if (data.code === 0 && mode === 'derive') {
          const values = Object.fromEntries(data.output.split('\n').filter(line => line.includes(' = ')).map(line => line.split(' = ')));
          const salt = Uint8Array.from(atob(values.Salt), character => character.charCodeAt(0));
          const key = Uint8Array.from(atob(values['k (256 bits)']), character => character.charCodeAt(0));
          data.files = [{ name: 'salt.bin', bytes: salt }, { name: 'key.bin', bytes: key }];
          setSaltFile(new File([new Uint8Array(salt).buffer], 'salt.bin', { type: 'application/octet-stream' }));
        }
        setReply(data);
        if (data.code === 0) {
          const asFile = (file: ResultFile, name: string) => new File([new Uint8Array(file.bytes).buffer], name, { type: 'text/plain' });
          const generatedPrivate = data.files.find(file => file.name === 'private.pem');
          const generatedPublic = data.files.find(file => file.name === 'public.pem');
          const generatedSignature = data.files.find(file => file.name === 'signature.txt');
          if (generatedPrivate) setPrivateFile(asFile(generatedPrivate, privateName));
          if (generatedPublic) setPublicFile(asFile(generatedPublic, publicName));
          if (generatedSignature) setSignatureFile(asFile(generatedSignature, signatureName));
        }
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

  function saveBytes(bytes: Uint8Array, name: string, type = 'text/plain') {
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer], { type }));
    const link = document.createElement('a');
    link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const outputNames: Record<string, string> = {
    'private.pem': privateName, 'public.pem': publicName, 'signature.txt': signatureName,
    'alice.pem': aliceName, 'bob.pem': bobName, 'salt.bin': 'salt.bin', 'key.bin': 'key.bin',
  };
  function download(file: ResultFile) {
    saveBytes(file.bytes, outputNames[file.name] || file.name, file.name.endsWith('.bin') ? 'application/octet-stream' : 'text/plain');
  }
  async function downloadSelected(file: File) {
    try { saveBytes(new Uint8Array(await file.arrayBuffer()), file.name, file.type || 'application/octet-stream'); }
    catch { setError(t('No se pudo leer el archivo para descargarlo.', 'Could not read the file for download.')); }
  }
  function downloadResult() {
    if (!reply) return;
    saveBytes(new TextEncoder().encode(reply.output + '\n'), 'result.txt');
  }
  function chooseFile(file: File | null, update: (file: File | null) => void, message = false) {
    clear();
    if (file && file.size > (message ? 16 * 1024 * 1024 : 16384)) {
      setError(message
        ? t('El archivo admite hasta 16 MiB.', 'The file supports up to 16 MiB.')
        : t('Las claves y firmas admiten hasta 16 KiB.', 'Keys and signatures support up to 16 KiB.'));
      update(null); return;
    }
    update(file);
    if (update === setPrivateFile && file) setPublicFile(null);
  }
  function upload(id: string, label: string, file: File | null, update: (file: File | null) => void, message = false) {
    return <div className="space-y-2 min-w-0">
      <label htmlFor={id} className="block">{label}</label>
      <div className="border border-dashed border-border bg-bg-primary p-4 space-y-3 min-w-0 focus-within:border-accent"
        onDragOver={event => { event.preventDefault(); }}
        onDrop={event => {
          event.preventDefault(); if (busy) return;
          if (event.dataTransfer.files.length !== 1) {
            clear(); setError(t('Arrastra un solo archivo por campo.', 'Drop one file per field.')); return;
          }
          chooseFile(event.dataTransfer.files[0], update, message);
        }}>
        <p className="text-sm text-text-secondary">{t('Arrastra un archivo aquí o selecciónalo.', 'Drop a file here or select it.')}</p>
        <input id={id} aria-label={label} className="sr-only"
          type="file" accept={message ? undefined : id === 'salt-upload' ? '.bin' : id === 'signature-upload' ? '.txt' : '.pem,.txt'}
          onChange={event => { chooseFile(event.target.files?.[0] ?? null, update, message); event.target.value = ''; }} />
        <label htmlFor={id} className="inline-block cursor-pointer bg-accent text-black px-3 py-2 text-sm font-semibold">
          {t('Elegir archivo', 'Choose file')}
        </label>
        {file && <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm break-all min-w-0" role="status">{t('Archivo listo:', 'Ready file:')} {file.name} · {file.size.toLocaleString()} bytes</p>
          <button type="button" className="text-sm text-accent underline cursor-pointer" onClick={() => downloadSelected(file)}>
            {id === 'salt-upload' ? t('Guardar sal cargada', 'Save loaded salt') : t('Descargar', 'Download') + ' ' + file.name}
          </button>
          <button type="button" className="text-sm text-accent underline cursor-pointer" onClick={() => chooseFile(null, update, message)}>
            {t('Quitar', 'Remove')}
          </button>
        </div>}
      </div>
    </div>;
  }
  function filename(label: string, value: string, update: (name: string) => void) {
    return <label className="block">{label}<input className={inputStyle} value={value}
      maxLength={120} onChange={event => { update(event.target.value); clear(); }} /></label>;
  }
  return <div className="space-y-6" id="standard-ec-workspace">
    <p className="text-sm text-text-secondary">{t('Tus archivos se procesan en este navegador. Las claves generadas y la firma quedan disponibles durante esta sesión; descárgalas para conservarlas.', 'Your files are processed in this browser. Generated keys and signatures remain available during this session; download them to keep them.')}</p>
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
        {upload('private-upload', t('Clave privada (.pem)', 'Private key (.pem)'), privateFile, setPrivateFile)}
        {upload('message-upload', t('Archivo que deseas firmar', 'File to sign'), messageFile, setMessageFile, true)}
        {filename(t('Nombre del archivo de firma', 'Signature filename'), signatureName, setSignatureName)}
      </>}
      {mode === 'verify' && <>
        {upload('public-upload', t('Clave pública (.pem)', 'Public key (.pem)'), publicFile, setPublicFile)}
        {upload('message-upload', t('Archivo que deseas verificar', 'File to verify'), messageFile, setMessageFile, true)}
        {upload('signature-upload', t('Firma (r, s) (.txt)', 'Signature (r, s) (.txt)'), signatureFile, setSignatureFile)}
      </>}
      {mode === 'derive' && <>
        <p className="text-text-secondary">{t('Selecciona tu clave privada y la clave pública de la otra persona. Ambas deben usar la misma curva. Se obtiene K y se deriva una clave de 256 bits con HKDF-SHA-256. Comparte la sal con la otra persona para obtener la misma clave. Si no cargas una sal, se genera una nueva.', 'Select your private key and the other person’s public key. Both must use the same curve. This computes K and derives a 256-bit key with HKDF-SHA-256. Share the salt with the other person to obtain the same key. If you do not provide a salt, a new one is generated.')}</p>
        {upload('private-upload', t('Tu clave privada (.pem)', 'Your private key (.pem)'), privateFile, setPrivateFile)}
        {upload('peer-upload', t('Clave pública de la otra persona (.pem)', 'Peer public key (.pem)'), peerFile, setPeerFile)}
        {upload('salt-upload', t('Sal compartida (.bin, opcional)', 'Shared salt (.bin, optional)'), saltFile, setSaltFile)}
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
        className={buttonStyle} onClick={() => download(file)}>{t('Descargar', 'Download')} {outputNames[file.name]}</button>)}</div>
      <div className="flex flex-wrap gap-3">
        <button className={buttonStyle} onClick={downloadResult}>{t('Descargar resultado (.txt)', 'Download result (.txt)')}</button>
        {mode === 'keygen' && reply.files.some(file => file.name === 'private.pem') && <button className={buttonStyle}
          onClick={() => { setMode('sign'); clear(); }}>{t('Firmar con estas claves', 'Sign with these keys')}</button>}
        {mode === 'sign' && reply.files.some(file => file.name === 'signature.txt') && <button className={buttonStyle}
          onClick={() => { setMode('verify'); clear(); }}>{t('Verificar esta firma', 'Verify this signature')}</button>}
      </div>
    </section>}
  </div>;
}
