import { useEffect, useRef, useState } from 'react';
import { cleanName, download, parseValues, startCli } from '../wasm-cli';

type Action = 'keygen' | 'inspect' | 'aes-keygen' | 'aes-encrypt' | 'wrap' | 'unwrap' | 'aes-decrypt';
type Arg = string | { input: File; limit: number } | { output: string };
type Done = { values: Record<string, string>; files: Record<string, File> };
const MODULUS_BITS = 3072;
const KEY_LIMIT = 16 * 1024;
const FILE_LIMIT = 16 * 1024 * 1024;
// Base64 of IV || ciphertext || tag for a 16 MiB file, with the same room for line breaks as the C reader.
const CIPHER_TEXT = Math.ceil((FILE_LIMIT + 28) / 3) * 4;
const CIPHER_LIMIT = CIPHER_TEXT + Math.floor(CIPHER_TEXT / 32) + 64;
const crtNames = ['n', 'e', 'd', 'p', 'q', 'dP', 'dQ', 'qInv'] as const;
const inputClass = 'block w-full mt-2 bg-bg-primary border border-border p-3 text-text-primary';
const buttonClass = 'bg-accent text-black px-6 py-3 font-semibold cursor-pointer disabled:opacity-50';
const panelClass = 'border border-border bg-bg-card p-6 space-y-5 min-w-0';
const rejected: Record<Action, [string, string]> = {
  keygen: ['No se pudo generar el par de claves.', 'Could not generate the key pair.'],
  inspect: ['El archivo no es una clave privada RSA en PEM válida.', 'The file is not a valid RSA private key in PEM format.'],
  'aes-keygen': ['No se pudo generar la clave K.', 'Could not generate key K.'],
  'aes-encrypt': ['No se pudo cifrar el archivo. Revisa que K sea una clave AES de 128 bits en Base64.', 'Could not encrypt the file. Check that K is a 128-bit AES key in Base64.'],
  wrap: ['No se pudo cifrar K. Revisa la clave pública de Alice y el archivo de K.', "Could not wrap K. Check Alice's public key and the K file."],
  unwrap: ['La clave privada no corresponde a la clave K cifrada o el archivo no es válido.', 'The private key does not match the wrapped key K, or the file is not valid.'],
  'aes-decrypt': ['La etiqueta GCM no es válida: el archivo fue modificado o K no corresponde.', 'The GCM tag is not valid: the file was modified or K does not match.'],
};
const textType = (name: string) => /\.(pem|b64|txt)$/i.test(name) ? 'text/plain' : 'application/octet-stream';

export default function RsaOaepWorkspace({ lang = 'es' }: { lang?: 'es' | 'en' }) {
  const t = (spanish: string, english: string) => lang === 'es' ? spanish : english;
  const [privateName, setPrivateName] = useState('alice_private.pem');
  const [publicName, setPublicName] = useState('alice_public.pem');
  const [alicePrivate, setAlicePrivate] = useState<File | null>(null);
  const [alicePublic, setAlicePublic] = useState<File | null>(null);
  const [inspectKey, setInspectKey] = useState<File | null>(null);
  const [components, setComponents] = useState<Record<string, string> | null>(null);
  const [bobPublic, setBobPublic] = useState<File | null>(null);
  const [keyName, setKeyName] = useState('k.b64');
  const [bobKey, setBobKey] = useState<File | null>(null);
  const [bobK, setBobK] = useState('');
  const [plain, setPlain] = useState<File | null>(null);
  const [cipherName, setCipherName] = useState('');
  const [bobCipher, setBobCipher] = useState<File | null>(null);
  const [wrappedName, setWrappedName] = useState('k_wrapped.b64');
  const [bobWrapped, setBobWrapped] = useState<File | null>(null);
  const [wrappedC, setWrappedC] = useState('');
  const [aliceKey, setAliceKey] = useState<File | null>(null);
  const [aliceWrapped, setAliceWrapped] = useState<File | null>(null);
  const [aliceCipher, setAliceCipher] = useState<File | null>(null);
  const [recoveredName, setRecoveredName] = useState('k_recovered.b64');
  const [recoveredKey, setRecoveredKey] = useState<File | null>(null);
  const [recoveredK, setRecoveredK] = useState('');
  const [outputName, setOutputName] = useState('');
  const [decrypted, setDecrypted] = useState<File | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Action, string>>>({});
  const cancel = useRef<(() => void) | null>(null);
  useEffect(() => () => cancel.current?.(), []);
  const fail = (action: Action, message: string) => setErrors(previous => ({ ...previous, [action]: message }));
  const clear = (...actions: Action[]) => setErrors(previous => {
    const next = { ...previous };
    for (const action of actions) delete next[action];
    return next;
  });

  // Inputs go to /input/<i>/<name> and outputs to /output/<name>, always with the user's filenames.
  async function execute(action: Action, args: Arg[]): Promise<Done | null> {
    clear(action);
    try {
      const inputs: { path: string; bytes: ArrayBuffer }[] = [];
      const outputs: string[] = [];
      const argv: string[] = [action];
      for (const arg of args) {
        if (typeof arg === 'string') { argv.push(arg); continue; }
        if ('input' in arg) {
          if (arg.input.size > arg.limit) throw new Error(t(`${arg.input.name} supera el límite permitido.`, `${arg.input.name} exceeds the size limit.`));
          const path = `/input/${inputs.length}/${cleanName(arg.input.name) || 'input'}`;
          inputs.push({ path, bytes: await arg.input.arrayBuffer() });
          argv.push(path);
        } else {
          const name = cleanName(arg.output);
          if (!name) throw new Error(t('Indica un nombre de archivo válido.', 'Enter a valid filename.'));
          const path = `/output/${name}`;
          if (outputs.includes(path)) throw new Error(t('Elige nombres de archivo diferentes.', 'Choose different filenames.'));
          outputs.push(path);
          argv.push(path);
        }
      }
      setBusy(action);
      const job = startCli('/workers/rsa-oaep.js', { args: argv, inputs, outputs });
      cancel.current = job.cancel;
      const result = await job.result;
      cancel.current = null;
      setBusy(null);
      if (result.cancelled) { fail(action, t('Operación cancelada.', 'Operation cancelled.')); return null; }
      if (result.code !== 0) {
        // El mensaje del programa en C es general; primero se explica la causa probable de esta acción.
        const detail = result.error && result.error !== 'module' ? '\n' + result.error : '';
        fail(action, result.error === 'module' ? t('No se pudo cargar el módulo criptográfico.', 'Could not load the cryptographic module.')
          : t(...rejected[action]) + detail);
        return null;
      }
      const files: Record<string, File> = {};
      for (const file of result.files) {
        const name = file.path.slice('/output/'.length);
        files[name] = new File([new Uint8Array(file.bytes)], name, { type: textType(name) });
      }
      return { values: parseValues(result.output), files };
    } catch (reason) {
      setBusy(null);
      fail(action, reason instanceof Error ? reason.message : String(reason));
      return null;
    }
  }

  async function generateKeys() {
    if (cleanName(privateName) === cleanName(publicName)) { fail('keygen', t('Elige dos nombres de archivo diferentes.', 'Choose two different filenames.')); return; }
    const done = await execute('keygen', [{ output: privateName }, { output: publicName }]);
    if (!done) return;
    const secret = done.files[cleanName(privateName)], pub = done.files[cleanName(publicName)];
    setAlicePrivate(secret); setAlicePublic(pub);
    setInspectKey(secret); setComponents(null);
    setBobPublic(pub); setAliceKey(secret);
    setBobWrapped(null); setWrappedC(''); setAliceWrapped(null); setRecoveredKey(null); setRecoveredK(''); setDecrypted(null);
  }
  async function inspect() {
    if (!inspectKey) { fail('inspect', t('Selecciona la clave privada.', 'Select the private key.')); return; }
    setComponents(null);
    const done = await execute('inspect', [{ input: inspectKey, limit: KEY_LIMIT }]);
    if (done && crtNames.every(name => done.values[name])) setComponents(done.values);
    else if (done) fail('inspect', t('Salida inesperada del programa.', 'Unexpected program output.'));
  }
  async function generateK() {
    const done = await execute('aes-keygen', [{ output: keyName }]);
    if (!done) return;
    setBobKey(done.files[cleanName(keyName)]); setBobK(done.values.K ?? '');
    setBobCipher(null); setBobWrapped(null); setWrappedC('');
  }
  async function encryptFile() {
    if (!bobKey || !plain) { fail('aes-encrypt', t('Selecciona K y el archivo m.', 'Select K and file m.')); return; }
    const done = await execute('aes-encrypt', [{ input: bobKey, limit: KEY_LIMIT }, { input: plain, limit: FILE_LIMIT }, { output: cipherName }]);
    if (!done) return;
    const file = done.files[cleanName(cipherName)];
    setBobCipher(file); updateAliceCipher(file);
  }
  async function wrapKey() {
    if (!bobPublic || !bobKey) { fail('wrap', t('Selecciona la clave pública de Alice y K.', "Select Alice's public key and K.")); return; }
    const done = await execute('wrap', [{ input: bobPublic, limit: KEY_LIMIT }, { input: bobKey, limit: KEY_LIMIT }, { output: wrappedName }]);
    if (!done) return;
    const file = done.files[cleanName(wrappedName)];
    setBobWrapped(file); setWrappedC(done.values.C ?? ''); setAliceWrapped(file);
  }
  async function unwrapKey() {
    if (!aliceKey || !aliceWrapped) { fail('unwrap', t('Selecciona la clave privada y la clave K cifrada.', 'Select the private key and the wrapped key K.')); return; }
    const done = await execute('unwrap', [{ input: aliceKey, limit: KEY_LIMIT }, { input: aliceWrapped, limit: KEY_LIMIT }, { output: recoveredName }]);
    if (!done) return;
    setRecoveredKey(done.files[cleanName(recoveredName)]); setRecoveredK(done.values.K ?? ''); setDecrypted(null);
  }
  async function decryptFile() {
    if (!recoveredKey || !aliceCipher) { fail('aes-decrypt', t('Recupera K y selecciona el archivo cifrado.', 'Recover K and select the encrypted file.')); return; }
    setDecrypted(null);
    const done = await execute('aes-decrypt', [{ input: recoveredKey, limit: KEY_LIMIT }, { input: aliceCipher, limit: CIPHER_LIMIT }, { output: outputName }]);
    if (done) setDecrypted(done.files[cleanName(outputName)]);
  }
  function updatePlain(file: File | null) {
    setPlain(file); setBobCipher(null);
    if (file) setCipherName(`${cleanName(file.name) || 'file'}.b64`);
  }
  function updateAliceCipher(file: File | null) {
    setAliceCipher(file); setDecrypted(null);
    if (file) setOutputName(/\.b64$/i.test(file.name) && file.name.length > 4 ? cleanName(file.name.slice(0, -4)) : 'decrypted.bin');
  }

  function fileInput(label: string, file: File | null, update: (file: File | null) => void, actions: Action[], accept?: string, note?: string) {
    return <label className="block border border-dashed border-border p-4"
      onDragOver={event => event.preventDefault()}
      onDrop={event => {
        event.preventDefault(); if (busy) return;
        if (event.dataTransfer.files.length !== 1) { fail(actions[0], t('Selecciona un solo archivo.', 'Select one file.')); return; }
        clear(...actions); update(event.dataTransfer.files[0]);
      }}>
      <span className="font-semibold">{label}</span>
      {note && <span className="block text-sm text-text-secondary mt-1">{note}</span>}
      <input aria-label={label} type="file" accept={accept} className="block w-full mt-3 text-sm"
        onChange={event => { clear(...actions); update(event.target.files?.[0] ?? null); event.target.value = ''; }} />
      {file && <span className="block mt-2 text-sm break-all">{file.name} · {file.size.toLocaleString()} bytes</span>}
    </label>;
  }
  function nameInput(label: string, value: string, update: (value: string) => void, actions: Action[]) {
    return <label className="block">{label}<input className={inputClass} value={value} maxLength={120} spellCheck={false}
      onChange={event => { update(event.target.value); clear(...actions); }} /></label>;
  }
  function status(action: Action, label: string) {
    return <>
      {busy === action && <div role="status">{label} <button type="button" className="text-accent underline ml-3 cursor-pointer" onClick={() => cancel.current?.()}>{t('Cancelar', 'Cancel')}</button></div>}
      {errors[action] && <pre role="alert" className="p-4 border border-red-400 text-red-300 whitespace-pre-wrap break-words">{errors[action]}</pre>}
    </>;
  }
  function downloads(files: (File | null)[]) {
    const available = files.filter((file): file is File => !!file);
    if (!available.length) return null;
    return <div className="flex flex-wrap gap-4">{available.map(file => <button key={file.name} type="button" className="text-accent underline break-all cursor-pointer"
      onClick={() => download(file)}>{t('Descargar ', 'Download ')}{file.name}</button>)}</div>;
  }
  function base64(label: string, value: string) {
    return <div className="border border-border bg-bg-primary p-3 min-w-0">
      <span className="font-mono text-sm text-accent">{label}</span>
      <p className="font-mono text-sm break-all mt-1">{value}</p>
    </div>;
  }
  const working = t('Procesando…', 'Processing…');

  return <div className="space-y-8">
    <p className="text-text-secondary">{t(`RSA-OAEP de ${MODULUS_BITS} bits con SHA-256 y MGF1-SHA-256, y AES-128-GCM para el archivo. La clave privada usa el formato TCR. Los archivos se procesan en este navegador.`,
      `${MODULUS_BITS}-bit RSA-OAEP with SHA-256 and MGF1-SHA-256, and AES-128-GCM for the file. The private key uses the CRT format. Files are processed in this browser.`)}</p>

    <fieldset disabled={busy !== null} className={panelClass}>
      <legend className="px-2 text-xl font-bold">{t('Alice · 1. Par de claves RSA-OAEP', 'Alice · 1. RSA-OAEP key pair')}</legend>
      <p className="text-sm text-text-secondary">{t('La clave privada se guarda en PKCS#8 y la pública en SubjectPublicKeyInfo, cada una en PEM (Base64) y en archivos separados. La clave privada no tiene contraseña; consérvala en privado y comparte con Bob solo la pública.',
        'The private key is stored as PKCS#8 and the public key as SubjectPublicKeyInfo, each in PEM (Base64) and in separate files. The private key has no password; keep it private and share only the public key with Bob.')}</p>
      <div className="grid md:grid-cols-2 gap-5">
        {nameInput(t('Nombre de la clave privada', 'Private key filename'), privateName, setPrivateName, ['keygen'])}
        {nameInput(t('Nombre de la clave pública', 'Public key filename'), publicName, setPublicName, ['keygen'])}
      </div>
      <button type="button" className={buttonClass} onClick={generateKeys}>{t('Generar claves', 'Generate keys')}</button>
      {status('keygen', t('Generando claves… Puede tardar unos segundos.', 'Generating keys… This may take a few seconds.'))}
      {downloads([alicePrivate, alicePublic])}
      <details className="border border-border p-4">
        <summary className="cursor-pointer font-semibold">{t('Componentes TCR de la clave privada', 'CRT components of the private key')}</summary>
        <div className="space-y-4 mt-4">
          <p className="text-sm text-text-secondary">{t('Formato TCR (NIST SP 800-56B Rev. 2, sección 6.2.2): n, e, d, p, q, dP = d mod (p − 1), dQ = d mod (q − 1) y qInv = q⁻¹ mod p, en hexadecimal.',
            'CRT format (NIST SP 800-56B Rev. 2, Section 6.2.2): n, e, d, p, q, dP = d mod (p − 1), dQ = d mod (q − 1) and qInv = q⁻¹ mod p, in hexadecimal.')}</p>
          {fileInput(t('Clave privada PEM', 'Private PEM key'), inspectKey, file => { setInspectKey(file); setComponents(null); }, ['inspect'], '.pem,.txt')}
          <button type="button" className={buttonClass} onClick={inspect}>{t('Mostrar componentes', 'Show components')}</button>
          {status('inspect', working)}
          {components && <div className="grid gap-3" aria-live="polite">{crtNames.map(name => <div key={name}>{base64(name, components[name])}</div>)}</div>}
        </div>
      </details>
    </fieldset>

    <fieldset disabled={busy !== null} className={panelClass}>
      <legend className="px-2 text-xl font-bold">{t('Bob · 2. Clave K, cifrado del archivo y cifrado de K', 'Bob · 2. Key K, file encryption and key wrapping')}</legend>
      {fileInput(t('Clave pública de Alice (PEM)', "Alice's public key (PEM)"), bobPublic, file => { setBobPublic(file); setBobWrapped(null); setWrappedC(''); }, ['wrap'], '.pem,.txt',
        alicePublic && bobPublic === alicePublic ? t('Se cargó la clave pública generada en el paso 1. Puedes reemplazarla.', 'Loaded the public key from step 1. You can replace it.') : undefined)}
      <div className="space-y-4 border-t border-border pt-5">
        <h3 className="text-lg font-bold">{t('2.1 Clave AES de 128 bits', '2.1 128-bit AES key')}</h3>
        <div className="grid md:grid-cols-2 gap-5 items-end">
          {nameInput(t('Nombre del archivo de K', 'Filename for K'), keyName, setKeyName, ['aes-keygen'])}
          <button type="button" className={buttonClass} onClick={generateK}>{t('Generar K', 'Generate K')}</button>
        </div>
        {status('aes-keygen', working)}
        {fileInput(t('Clave K (Base64)', 'Key K (Base64)'), bobKey, file => { setBobKey(file); setBobK(''); setBobCipher(null); setBobWrapped(null); setWrappedC(''); }, ['aes-encrypt', 'wrap'], '.b64,.txt')}
        {bobK && bobKey && base64('K', bobK)}
        {downloads([bobKey])}
      </div>
      <div className="space-y-4 border-t border-border pt-5">
        <h3 className="text-lg font-bold">{t('2.2 Cifrado del archivo', '2.2 Encrypt file')} <span className="normal-case">m</span> {t('con AES-128-GCM', 'with AES-128-GCM')}</h3>
        {fileInput(t('Archivo m (cualquier formato, máximo 16 MiB)', 'File m (any format, up to 16 MiB)'), plain, updatePlain, ['aes-encrypt'])}
        {nameInput(t('Nombre del archivo cifrado', 'Encrypted filename'), cipherName, setCipherName, ['aes-encrypt'])}
        <p className="text-sm text-text-secondary">{t('El archivo contiene Base64 de IV (12 bytes) || texto cifrado || etiqueta (16 bytes).', 'The file holds Base64 of IV (12 bytes) || ciphertext || tag (16 bytes).')}</p>
        <button type="button" className={buttonClass} onClick={encryptFile}>{t('Cifrar archivo', 'Encrypt file')}</button>
        {status('aes-encrypt', working)}
        {downloads([bobCipher])}
      </div>
      <div className="space-y-4 border-t border-border pt-5">
        <h3 className="text-lg font-bold">{t('2.3 Cifrado de K con RSA-OAEP', '2.3 Wrap K with RSA-OAEP')}</h3>
        {nameInput(t('Nombre de la clave K cifrada', 'Wrapped key filename'), wrappedName, setWrappedName, ['wrap'])}
        <button type="button" className={buttonClass} onClick={wrapKey}>{t('Cifrar K', 'Wrap K')}</button>
        {status('wrap', working)}
        {wrappedC && bobWrapped && base64('C', wrappedC)}
        {downloads([bobWrapped])}
      </div>
    </fieldset>

    <fieldset disabled={busy !== null} className={panelClass}>
      <legend className="px-2 text-xl font-bold">{t('Alice · 3. Recuperación de K y descifrado', 'Alice · 3. Recover K and decrypt')}</legend>
      <p className="text-sm text-text-secondary">{t('Los archivos generados en esta sesión se cargan automáticamente; también puedes seleccionar los que recibiste de Bob.', 'Files generated in this session load automatically; you can also select the ones received from Bob.')}</p>
      {fileInput(t('Clave privada de Alice (PEM)', "Alice's private key (PEM)"), aliceKey, file => { setAliceKey(file); setRecoveredKey(null); setRecoveredK(''); }, ['unwrap'], '.pem,.txt')}
      {fileInput(t('Clave K cifrada (Base64)', 'Wrapped key K (Base64)'), aliceWrapped, file => { setAliceWrapped(file); setRecoveredKey(null); setRecoveredK(''); }, ['unwrap'], '.b64,.txt')}
      <div className="space-y-4 border-t border-border pt-5">
        <h3 className="text-lg font-bold">{t('3.1 Descifrado de K con RSA-OAEP y TCR', '3.1 Unwrap K with RSA-OAEP and CRT')}</h3>
        {nameInput(t('Nombre del archivo de K recuperada', 'Recovered key filename'), recoveredName, setRecoveredName, ['unwrap'])}
        <button type="button" className={buttonClass} onClick={unwrapKey}>{t('Descifrar K', 'Unwrap K')}</button>
        {status('unwrap', working)}
        {recoveredK && recoveredKey && base64('K', recoveredK)}
        {recoveredK && bobK && <p className={recoveredK === bobK ? 'text-green-400' : 'text-red-400'}>{recoveredK === bobK ? t('K coincide con la clave generada por Bob.', "K matches the key generated by Bob.") : t('K no coincide con la clave generada por Bob en esta sesión.', 'K does not match the key Bob generated in this session.')}</p>}
        {downloads([recoveredKey])}
      </div>
      <div className="space-y-4 border-t border-border pt-5">
        <h3 className="text-lg font-bold">{t('3.2 Descifrado del archivo con AES-128-GCM', '3.2 Decrypt the file with AES-128-GCM')}</h3>
        {fileInput(t('Archivo cifrado (Base64)', 'Encrypted file (Base64)'), aliceCipher, updateAliceCipher, ['aes-decrypt'], '.b64,.txt')}
        {nameInput(t('Nombre del archivo descifrado', 'Decrypted filename'), outputName, setOutputName, ['aes-decrypt'])}
        <button type="button" className={buttonClass} onClick={decryptFile}>{t('Descifrar archivo', 'Decrypt file')}</button>
        {status('aes-decrypt', working)}
        {decrypted && <p className="text-green-400">{t('Etiqueta GCM válida. Archivo recuperado: ', 'Valid GCM tag. Recovered file: ')}{decrypted.name} · {decrypted.size.toLocaleString()} bytes</p>}
        {downloads([decrypted])}
      </div>
    </fieldset>
  </div>;
}
