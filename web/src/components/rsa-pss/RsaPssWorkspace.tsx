import { useEffect, useRef, useState } from 'react';
type Mode = 'keygen' | 'sign' | 'verify';
type Result = { code: number; output: string; error: string; files: { name: string; bytes: Uint8Array }[] };
export default function RsaPssWorkspace({ lang = 'es' }: { lang?: 'es' | 'en' }) {
  const t = (es: string, en: string) => lang === 'es' ? es : en;
  const [mode, setMode] = useState<Mode>('keygen');
  const [bits, setBits] = useState(3072);
  const [privateKey, setPrivateKey] = useState<File | null>(null);
  const [publicKey, setPublicKey] = useState<File | null>(null);
  const [message, setMessage] = useState<File | null>(null);
  const [signature, setSignature] = useState<File | null>(null);
  const [privateName, setPrivateName] = useState('private.pem');
  const [publicName, setPublicName] = useState('public.pem');
  const [signatureName, setSignatureName] = useState('signature.b64');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const worker = useRef<Worker | null>(null);
  useEffect(() => () => worker.current?.terminate(), []);
  const clear = () => { setResult(null); setError(''); };
  function download(file: File) {
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url; link.download = file.name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function run() {
    if (busy) return;
    setBusy(true);
    clear();
    try {
      if (mode === 'keygen' && (!privateName.trim() || !publicName.trim() || privateName.trim() === publicName.trim())) {
        throw new Error(t('Elige dos nombres de archivo diferentes.', 'Choose two different filenames.'));
      }
      if (mode === 'sign' && !signatureName.trim()) throw new Error(t('Indica el nombre de la firma.', 'Enter the signature filename.'));
      const inputs: { name: string; bytes: ArrayBuffer }[] = [];
      const add = async (file: File | null, name: string) => {
        if (!file) throw new Error(t('Selecciona todos los archivos requeridos.', 'Select all required files.'));
        const limit = name === 'message.bin' ? 16 * 1024 * 1024 : 8192;
        if (file.size > limit) throw new Error(t('El archivo supera el límite permitido.', 'The file exceeds the size limit.'));
        inputs.push({ name, bytes: await file.arrayBuffer() });
      };
      if (mode === 'sign') { await add(privateKey, 'private.pem'); await add(message, 'message.bin'); }
      if (mode === 'verify') { await add(publicKey, 'public.pem'); await add(message, 'message.bin'); await add(signature, 'signature.b64'); }
      const outputs = mode === 'keygen' ? ['private.pem', 'public.pem'] : mode === 'sign' ? ['signature.b64'] : [];
      const job = new Worker('/workers/rsa-pss.js', { type: 'module' });
      worker.current = job;
      job.onmessage = ({ data }: MessageEvent<Result>) => {
        setResult(data);
        if (data.code === 1) setError(t('No se pudo completar la operación. Revisa los archivos y el perfil de la clave.', 'Operation failed. Check the files and key profile.'));
        if (data.code === 0) {
          for (const file of data.files) {
            const name = file.name === 'private.pem' ? privateName.trim() : file.name === 'public.pem' ? publicName.trim() : signatureName.trim();
            const value = new File([new Uint8Array(file.bytes).buffer], name, { type: 'text/plain' });
            if (file.name === 'private.pem') setPrivateKey(value);
            else if (file.name === 'public.pem') setPublicKey(value);
            else setSignature(value);
          }
        }
        setBusy(false); job.terminate(); worker.current = null;
      };
      job.onerror = () => {
        setError(t('No se pudo cargar el módulo criptográfico.', 'Could not load the cryptographic module.'));
        setBusy(false); job.terminate(); worker.current = null;
      };
      job.postMessage({ operation: mode, bits, inputs, outputs });
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setBusy(false); }
  }
  const inputClass = 'block w-full mt-2 bg-bg-primary border border-border p-3 text-text-primary';
  function fileInput(label: string, file: File | null, update: (file: File | null) => void, accept?: string) {
    return <label className="block border border-dashed border-border p-4"
      onDragOver={event => event.preventDefault()}
      onDrop={event => {
        event.preventDefault(); if (busy) return;
        if (event.dataTransfer.files.length !== 1) { setError(t('Selecciona un solo archivo.', 'Select one file.')); return; }
        clear(); update(event.dataTransfer.files[0]);
      }}>
      <span className="font-semibold">{label}</span>
      <input aria-label={label} type="file" accept={accept} className="block w-full mt-3 text-sm"
        onChange={event => { clear(); update(event.target.files?.[0] ?? null); event.target.value = ''; }} />
      {file && <span className="block mt-2 text-sm break-all">{file.name} · {file.size.toLocaleString()} bytes</span>}
    </label>;
  }
  return <div className="space-y-6">
    <p className="text-text-secondary">{t('SHA-256 · MGF1-SHA-256 · sal de 32 bytes. Los archivos se procesan en este navegador.', 'SHA-256 · MGF1-SHA-256 · 32-byte salt. Files are processed in this browser.')}</p>
    <fieldset disabled={busy} className="space-y-6 disabled:opacity-60">
      <legend className="sr-only">RSA-PSS</legend>
      <div className="flex flex-wrap gap-3">
        {(['keygen', 'sign', 'verify'] as Mode[]).map((value, index) => <button key={value} type="button" aria-pressed={mode === value}
          className={'px-4 py-3 border cursor-pointer ' + (mode === value ? 'border-accent text-accent' : 'border-border')}
          onClick={() => { setMode(value); clear(); }}>{[t('Generar claves', 'Generate keys'), t('Firmar', 'Sign'), t('Verificar', 'Verify')][index]}</button>)}
      </div>
      {mode === 'keygen' && <div className="grid md:grid-cols-2 gap-5">
        <label>{t('Tamaño de clave', 'Key size')}<select className={inputClass} value={bits} onChange={e => { setBits(Number(e.target.value)); clear(); }}>
          {[2048, 3072, 4096].map(size => <option key={size} value={size}>{size} bits</option>)}
        </select></label>
        <p className="text-sm text-text-secondary self-center">{t('Las claves se descargan en PEM (Base64). La clave privada se guarda sin contraseña; conserva ese archivo en privado.', 'Keys download as PEM (Base64). The private key is saved without a password; keep that file private.')}</p>
        <label>{t('Nombre de clave privada', 'Private key filename')}<input className={inputClass} value={privateName} maxLength={120} onChange={e => { setPrivateName(e.target.value); clear(); }} /></label>
        <label>{t('Nombre de clave pública', 'Public key filename')}<input className={inputClass} value={publicName} maxLength={120} onChange={e => { setPublicName(e.target.value); clear(); }} /></label>
      </div>}
      {mode === 'sign' && fileInput(t('Clave privada PEM', 'Private PEM key'), privateKey, setPrivateKey, '.pem,.txt')}
      {mode === 'verify' && fileInput(t('Clave pública PEM', 'Public PEM key'), publicKey, setPublicKey, '.pem,.txt')}
      {mode !== 'keygen' && fileInput(t('Archivo a firmar o verificar (máximo 16 MiB)', 'File to sign or verify (up to 16 MiB)'), message, setMessage)}
      {mode === 'sign' && <label className="block">{t('Nombre de la firma', 'Signature filename')}<input className={inputClass} value={signatureName} maxLength={120} onChange={e => { setSignatureName(e.target.value); clear(); }} /></label>}
      {mode === 'verify' && fileInput(t('Firma Base64', 'Base64 signature'), signature, setSignature, '.b64,.txt')}
      <button type="button" className="bg-accent text-black px-6 py-3 font-semibold cursor-pointer" onClick={run}>{t('Ejecutar', 'Run')}</button>
    </fieldset>
    {busy && <div role="status">{t('Procesando… La generación de claves puede tardar.', 'Processing… Key generation may take a while.')} <button className="text-accent underline ml-3" onClick={() => { worker.current?.terminate(); worker.current = null; setBusy(false); }}>{t('Cancelar', 'Cancel')}</button></div>}
    {error && <p role="alert" className="text-red-400 break-words">{error}</p>}
    {result && result.code !== 1 && <section className="border border-border p-5 space-y-4" aria-live="polite">
      <h2 className="font-semibold">{mode === 'verify' ? (result.code === 0 ? t('Firma válida · true', 'Valid signature · true') : t('Firma inválida · false', 'Invalid signature · false')) : t('Operación completada', 'Operation completed')}</h2>
      <pre className="whitespace-pre-wrap break-all text-sm max-h-64 overflow-auto">{result.output}</pre>
    </section>}
    {(privateKey || publicKey || signature) && <section className="border border-border p-5 space-y-3">
      <h2 className="font-semibold">{t('Archivos disponibles', 'Available files')}</h2>
      <p className="text-sm text-text-secondary">{t('Puedes reutilizarlos en las pestañas de firma y verificación.', 'Reuse these files in the signing and verification tabs.')}</p>
      <div className="flex flex-wrap gap-4">{[privateKey, publicKey, signature].filter((f): f is File => !!f).map((file, index) => <button key={index} className="text-accent underline break-all" onClick={() => download(file)}>{t('Descargar ', 'Download ')}{file.name}</button>)}</div>
    </section>}
  </div>;
}
