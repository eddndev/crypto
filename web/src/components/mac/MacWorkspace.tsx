import { useEffect, useRef, useState } from 'react';
import { cleanName, download, parseValues, startCli } from '../wasm-cli';

type Algorithm = 'hmac' | 'cmac';
type Action = 'keygen' | 'tag' | 'verify';
type Arg = string | { input: File; limit: number } | { output: string };
type Done = { code: number; values: Record<string, string>; files: Record<string, File> };
// The C reader accepts key and tag files of at most 4 KiB; the browser stops much larger files early.
const KEY_LIMIT = 16 * 1024;
const FILE_LIMIT = 64 * 1024 * 1024;
const algorithms: Record<Algorithm, { label: string; bits: number }> = {
  hmac: { label: 'HMAC-SHA-256', bits: 256 },
  cmac: { label: 'CMAC-AES-128', bits: 128 },
};
const inputClass = 'block w-full mt-2 bg-bg-primary border border-border p-3 text-text-primary';
const buttonClass = 'bg-accent text-black px-6 py-3 font-semibold cursor-pointer disabled:opacity-50';
const panelClass = 'border border-border bg-bg-card p-6 space-y-5 min-w-0';
const rejected: Record<Action, [string, string]> = {
  keygen: ['No se pudo generar la clave.', 'Could not generate the key.'],
  tag: ['No se pudo calcular la etiqueta. Revisa que la clave sea Base64 y corresponda al algoritmo seleccionado.', 'Could not compute the tag. Check that the key is Base64 and matches the selected algorithm.'],
  verify: ['No se pudo verificar. Revisa que la clave y la etiqueta sean Base64 y correspondan al algoritmo seleccionado.', 'Could not verify. Check that the key and the tag are Base64 and match the selected algorithm.'],
};
const textType = (name: string) => /\.(key|tag|b64|txt)$/i.test(name) ? 'text/plain' : 'application/octet-stream';

export default function MacWorkspace({ lang = 'es' }: { lang?: 'es' | 'en' }) {
  const t = (spanish: string, english: string) => lang === 'es' ? spanish : english;
  const [algorithm, setAlgorithm] = useState<Algorithm>('hmac');
  const [keyName, setKeyName] = useState('hmac.key');
  const [key, setKey] = useState<File | null>(null);
  const [keyValues, setKeyValues] = useState<Record<string, string> | null>(null);
  const [tagFile, setTagFile] = useState<File | null>(null);
  const [tagKey, setTagKey] = useState<File | null>(null);
  const [tagName, setTagName] = useState('');
  const [tag, setTag] = useState<File | null>(null);
  const [tagValues, setTagValues] = useState<Record<string, string> | null>(null);
  const [verifyFile, setVerifyFile] = useState<File | null>(null);
  const [verifyKey, setVerifyKey] = useState<File | null>(null);
  const [verifyTag, setVerifyTag] = useState<File | null>(null);
  const [verdict, setVerdict] = useState<Record<string, string> | null>(null);
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
  const selected = algorithms[algorithm];

  // Inputs go to /input/<i>/<name> and outputs to /output/<name>, always with the user's filenames.
  async function execute(action: Action, args: Arg[]): Promise<Done | null> {
    clear(action);
    try {
      const inputs: { path: string; bytes: ArrayBuffer }[] = [];
      const outputs: string[] = [];
      const argv: string[] = [action, algorithm];
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
          outputs.push(path);
          argv.push(path);
        }
      }
      setBusy(action);
      const job = startCli('/workers/mac.js', { args: argv, inputs, outputs });
      cancel.current = job.cancel;
      const result = await job.result;
      cancel.current = null;
      setBusy(null);
      if (result.cancelled) { fail(action, t('Operación cancelada.', 'Operation cancelled.')); return null; }
      // verify exits with 2 for an invalid tag; that is a result, not an error.
      if (result.code !== 0 && !(action === 'verify' && result.code === 2)) {
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
      return { code: result.code, values: parseValues(result.output), files };
    } catch (reason) {
      setBusy(null);
      fail(action, reason instanceof Error ? reason.message : String(reason));
      return null;
    }
  }

  // A key of one algorithm is rejected by the other, so changing it starts over.
  function changeAlgorithm(next: Algorithm) {
    if (next === algorithm) return;
    if (keyName === `${algorithm}.key`) setKeyName(`${next}.key`);
    setAlgorithm(next);
    setKey(null); setKeyValues(null); setTagKey(null); setTag(null); setTagValues(null);
    setVerifyKey(null); setVerifyTag(null); setVerdict(null); setErrors({});
  }
  async function generateKey() {
    const done = await execute('keygen', [{ output: keyName }]);
    if (!done) return;
    const file = done.files[cleanName(keyName)];
    setKey(file); setKeyValues(done.values);
    setTagKey(file); setVerifyKey(file);
    setTag(null); setTagValues(null); setVerdict(null);
  }
  async function computeTag() {
    if (!tagFile || !tagKey) { fail('tag', t('Selecciona el archivo y la clave.', 'Select the file and the key.')); return; }
    setTag(null); setTagValues(null);
    const done = await execute('tag', [{ input: tagKey, limit: KEY_LIMIT }, { input: tagFile, limit: FILE_LIMIT }, { output: tagName }]);
    if (!done) return;
    const file = done.files[cleanName(tagName)];
    setTag(file); setTagValues(done.values);
    setVerifyFile(tagFile); setVerifyKey(tagKey); setVerifyTag(file); setVerdict(null);
  }
  async function verifyTagFile() {
    if (!verifyFile || !verifyKey || !verifyTag) { fail('verify', t('Selecciona el archivo, la clave y la etiqueta.', 'Select the file, the key and the tag.')); return; }
    setVerdict(null);
    const done = await execute('verify', [{ input: verifyKey, limit: KEY_LIMIT }, { input: verifyFile, limit: FILE_LIMIT }, { input: verifyTag, limit: KEY_LIMIT }]);
    if (!done) return;
    if (done.values.Expected && done.values.Computed && done.values.Result) setVerdict(done.values);
    else fail('verify', t('Salida inesperada del programa.', 'Unexpected program output.'));
  }
  function updateTagFile(file: File | null) {
    setTagFile(file); setTag(null); setTagValues(null);
    if (file) setTagName(`${cleanName(file.name) || 'file'}.tag`);
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
  function value(label: string, text: string) {
    return <div className="border border-border bg-bg-primary p-3 min-w-0">
      <span className="font-mono text-sm text-accent">{label}</span>
      <p className="font-mono text-sm break-all mt-1">{text}</p>
    </div>;
  }
  const working = t('Procesando…', 'Processing…');
  const loaded = t('Se cargó el archivo del paso anterior. Puedes reemplazarlo.', 'Loaded the file from the previous step. You can replace it.');
  const valid = verdict?.Result === 'valid';

  return <div className="space-y-8">
    <p className="text-text-secondary">{t('HMAC-SHA-256 (FIPS 198-1) usa una clave de 256 bits y produce etiquetas de 256 bits; CMAC-AES-128 (NIST SP 800-38B) usa una clave de 128 bits y produce etiquetas de 128 bits. Las claves y etiquetas se guardan en Base64. Los archivos se procesan en este navegador.',
      'HMAC-SHA-256 (FIPS 198-1) uses a 256-bit key and gives 256-bit tags; CMAC-AES-128 (NIST SP 800-38B) uses a 128-bit key and gives 128-bit tags. Keys and tags are stored in Base64. Files are processed in this browser.')}</p>

    <label className="block max-w-[420px]">{t('Algoritmo', 'Algorithm')}
      <select className={inputClass} value={algorithm} disabled={busy !== null} onChange={event => changeAlgorithm(event.target.value as Algorithm)}>
        <option value="hmac">HMAC-SHA-256</option>
        <option value="cmac">CMAC-AES-128</option>
      </select>
    </label>

    <fieldset disabled={busy !== null} className={panelClass}>
      <legend className="px-2 text-xl font-bold">{t('1. Generación de la clave', '1. Key generation')} · {selected.label}</legend>
      <p className="text-sm text-text-secondary">{t(`La clave son ${selected.bits / 8} bytes aleatorios (${selected.bits} bits) del generador de OpenSSL, escritos en Base64. Consérvala en privado.`,
        `The key is ${selected.bits / 8} random bytes (${selected.bits} bits) from the OpenSSL generator, written in Base64. Keep it private.`)}</p>
      <div className="grid md:grid-cols-2 gap-5 items-end">
        {nameInput(t('Nombre del archivo de la clave', 'Key filename'), keyName, setKeyName, ['keygen'])}
        <button type="button" className={buttonClass} onClick={generateKey}>{t('Generar clave', 'Generate key')}</button>
      </div>
      {status('keygen', working)}
      {keyValues && key && <div className="grid gap-3" aria-live="polite">
        {value('Key', keyValues.Key ?? '')}
        {value('KeyBits', keyValues.KeyBits ?? '')}
      </div>}
      {downloads([key])}
    </fieldset>

    <fieldset disabled={busy !== null} className={panelClass}>
      <legend className="px-2 text-xl font-bold">{t('2. Etiqueta de un archivo', '2. Tag a file')} · {selected.label}</legend>
      {fileInput(t('Archivo (cualquier formato, máximo 64 MiB)', 'File (any format, up to 64 MiB)'), tagFile, updateTagFile, ['tag'])}
      {fileInput(t('Clave (Base64)', 'Key (Base64)'), tagKey, file => { setTagKey(file); setTag(null); setTagValues(null); }, ['tag'], '.key,.b64,.txt',
        key && tagKey === key ? loaded : undefined)}
      {nameInput(t('Nombre del archivo de la etiqueta', 'Tag filename'), tagName, setTagName, ['tag'])}
      <button type="button" className={buttonClass} onClick={computeTag}>{t('Calcular etiqueta', 'Compute tag')}</button>
      {status('tag', working)}
      {tagValues && tag && <div className="grid gap-3" aria-live="polite">
        {value('Tag', tagValues.Tag ?? '')}
        <div className="grid md:grid-cols-2 gap-3">
          {value('TagBits', tagValues.TagBits ?? '')}
          {value('Bytes', tagValues.Bytes ?? '')}
        </div>
      </div>}
      {downloads([tag])}
    </fieldset>

    <fieldset disabled={busy !== null} className={panelClass}>
      <legend className="px-2 text-xl font-bold">{t('3. Verificación de la etiqueta', '3. Tag verification')} · {selected.label}</legend>
      <p className="text-sm text-text-secondary">{t('Se recalcula la etiqueta con la clave y el archivo, y se compara con la etiqueta recibida en tiempo constante (CRYPTO_memcmp). Los archivos del paso 2 se cargan automáticamente; también puedes seleccionar otros.',
        'The tag is recomputed with the key and the file, and compared with the received tag in constant time (CRYPTO_memcmp). Files from step 2 load automatically; you can also select others.')}</p>
      {fileInput(t('Archivo', 'File'), verifyFile, file => { setVerifyFile(file); setVerdict(null); }, ['verify'], undefined,
        tagFile && verifyFile === tagFile ? loaded : undefined)}
      {fileInput(t('Clave (Base64)', 'Key (Base64)'), verifyKey, file => { setVerifyKey(file); setVerdict(null); }, ['verify'], '.key,.b64,.txt',
        tagKey && verifyKey === tagKey ? loaded : undefined)}
      {fileInput(t('Etiqueta (Base64)', 'Tag (Base64)'), verifyTag, file => { setVerifyTag(file); setVerdict(null); }, ['verify'], '.tag,.b64,.txt',
        tag && verifyTag === tag ? loaded : undefined)}
      <button type="button" className={buttonClass} onClick={verifyTagFile}>{t('Verificar etiqueta', 'Verify tag')}</button>
      {status('verify', working)}
      {verdict && <div className="grid gap-3" aria-live="polite">
        {value('Expected', verdict.Expected)}
        {value('Computed', verdict.Computed)}
        <p role="status" className={`p-4 border font-semibold ${valid ? 'border-green-400 text-green-400' : 'border-red-400 text-red-400'}`}>
          {valid ? t('Etiqueta válida · valid', 'Valid tag · valid')
            : t('Etiqueta inválida · invalid: el archivo, la clave o la etiqueta no corresponden.', 'Invalid tag · invalid: the file, the key or the tag do not match.')}
        </p>
      </div>}
    </fieldset>
  </div>;
}
