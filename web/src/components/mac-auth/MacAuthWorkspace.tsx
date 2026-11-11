import { useEffect, useRef, useState } from 'react';
import { cleanName, download, parseValues, startCli } from '../wasm-cli';

type Role = 'a' | 'b';
type Command = 'keygen' | 'derive' | 'challenge' | 'respond' | 'check' | 'session-key' | 'encrypt' | 'decrypt';
type Action = `${Command}:${Role}`;
type Arg = string | { input: File; limit: number } | { output: string };
type Done = { code: number; values: Record<string, string>; files: Record<string, File> };
type Side = {
  privateName: string; publicName: string; privateKey: File | null; publicKey: File | null; point: string;
  ownPrivate: File | null; peerPublic: File | null; kName: string; kFile: File | null; s: string; K: string;
  keName: string; keFile: File | null; KE: string;
  plain: File | null; cipherName: string; cipher: File | null; iv: string;
  received: File | null; outName: string; decrypted: File | null;
};
type Check = { tau: string; tauPrime: string; authenticated: boolean };
const KEY_LIMIT = 16 * 1024;
const FILE_LIMIT = 16 * 1024 * 1024;
// Base64 of IV || ciphertext || tag for a 16 MiB file, with the same room for line breaks as the C reader.
const CIPHER_TEXT = Math.ceil((FILE_LIMIT + 28) / 3) * 4;
const CIPHER_LIMIT = CIPHER_TEXT + Math.floor(CIPHER_TEXT / 32) + 64;
const pairs = [['Alice', 'Bob'], ['Bob', 'Carol']] as const;
const inputClass = 'block w-full mt-2 bg-bg-primary border border-border p-3 text-text-primary';
const buttonClass = 'bg-accent text-black px-6 py-3 font-semibold cursor-pointer disabled:opacity-50';
const panelClass = 'border border-border bg-bg-card p-6 space-y-5 min-w-0';
const rejected: Record<Command, [string, string]> = {
  keygen: ['No se pudo generar el par de claves.', 'Could not generate the key pair.'],
  derive: ['No se pudo calcular s. Revisa que las dos claves sean EC P-256 en PEM: la privada propia y la pública del otro lado.', "Could not compute s. Check that both keys are EC P-256 in PEM: your own private key and the other side's public key."],
  challenge: ['No se pudo generar r.', 'Could not generate r.'],
  respond: ['No se pudo calcular τ. Revisa que K y r sean archivos Base64 de 32 bytes.', 'Could not compute τ. Check that K and r are 32-byte Base64 files.'],
  check: ['No se pudo verificar τ. Revisa que K, r y τ sean archivos Base64 de 32 bytes.', 'Could not verify τ. Check that K, r and τ are 32-byte Base64 files.'],
  'session-key': ['No se pudo derivar KE. Revisa que τ sea un archivo Base64 de 32 bytes.', 'Could not derive KE. Check that τ is a 32-byte Base64 file.'],
  encrypt: ['No se pudo cifrar el archivo. Revisa que KE sea una clave AES de 128 bits en Base64.', 'Could not encrypt the file. Check that KE is a 128-bit AES key in Base64.'],
  decrypt: ['La etiqueta GCM no es válida: el archivo fue modificado o KE no corresponde.', 'The GCM tag is not valid: the file was modified or KE does not match.'],
};
const textType = (name: string) => /\.(pem|b64|txt)$/i.test(name) ? 'text/plain' : 'application/octet-stream';
const other = (role: Role): Role => role === 'a' ? 'b' : 'a';
const newSide = (name: string): Side => ({
  privateName: `${name}_private.pem`, publicName: `${name}_public.pem`, privateKey: null, publicKey: null, point: '',
  ownPrivate: null, peerPublic: null, kName: `${name}_k.b64`, kFile: null, s: '', K: '',
  keName: `${name}_ke.b64`, keFile: null, KE: '',
  plain: null, cipherName: '', cipher: null, iv: '',
  received: null, outName: '', decrypted: null,
});
// photo.png.b64 received from Alice -> photo-from-alice.png
function receivedName(file: File, peer: string) {
  const base = /\.b64$/i.test(file.name) && file.name.length > 4 ? cleanName(file.name.slice(0, -4)) : 'decrypted.bin';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? `${base.slice(0, dot)}-from-${peer}${base.slice(dot)}` : `${base}-from-${peer}`;
}

export default function MacAuthWorkspace({ lang = 'es' }: { lang?: 'es' | 'en' }) {
  const t = (spanish: string, english: string) => lang === 'es' ? spanish : english;
  const [pair, setPair] = useState(0);
  return <div className="space-y-8">
    <p className="text-text-secondary">{t('ECDH en la curva P-256, K = HKDF-SHA-256(s), τ = HMAC-SHA-256 con K sobre r, KE = HKDF-SHA-256(τ) de 128 bits y AES-128-GCM para los archivos. Solo las claves públicas, r, τ y los archivos cifrados pasan de un lado al otro. Los archivos se procesan en este navegador.',
      'ECDH on curve P-256, K = HKDF-SHA-256(s), τ = HMAC-SHA-256 with K over r, a 128-bit KE = HKDF-SHA-256(τ) and AES-128-GCM for the files. Only the public keys, r, τ and the encrypted files travel between the two sides. Files are processed in this browser.')}</p>
    <div className="flex flex-wrap items-end gap-5">
      <label className="block">{t('Pareja', 'Pair')}
        <select className={inputClass} value={pair} onChange={event => setPair(Number(event.target.value))}>
          {pairs.map((names, index) => <option key={index} value={index}>{names[0]} ↔ {names[1]}</option>)}
        </select>
      </label>
      <p className="text-sm text-text-secondary max-w-[640px]">{t('En el equipo de tres, los pasos se repiten entre Bob (retador) y Carol (responde), con pares de claves nuevos. Cambiar de pareja borra los resultados de la pareja anterior.',
        'In the team of three, the steps run again between Bob (challenger) and Carol (responder), with new key pairs. Changing the pair clears the results of the previous pair.')}</p>
    </div>
    <Protocol key={pair} lang={lang} names={pairs[pair]} />
  </div>;
}

function Protocol({ lang, names }: { lang: 'es' | 'en'; names: readonly [string, string] }) {
  const t = (spanish: string, english: string) => lang === 'es' ? spanish : english;
  const who = (role: Role) => role === 'a' ? names[0] : names[1];
  const lower = (role: Role) => who(role).toLowerCase();
  const [sides, setSides] = useState<Record<Role, Side>>(() => ({ a: newSide(names[0].toLowerCase()), b: newSide(names[1].toLowerCase()) }));
  // Challenge (Alice), response (Bob) and check (Alice).
  const [rName, setRName] = useState('r.b64');
  const [rFile, setRFile] = useState<File | null>(null);
  const [rValues, setRValues] = useState<Record<string, string> | null>(null);
  const [bobR, setBobR] = useState<File | null>(null);
  const [tauName, setTauName] = useState('tau.b64');
  const [tauFile, setTauFile] = useState<File | null>(null);
  const [tau, setTau] = useState('');
  const [aliceR, setAliceR] = useState<File | null>(null);
  const [aliceTau, setAliceTau] = useState<File | null>(null);
  const [check, setCheck] = useState<Check | null>(null);
  const [bobKeTau, setBobKeTau] = useState<File | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Action, string>>>({});
  const cancel = useRef<(() => void) | null>(null);
  useEffect(() => () => cancel.current?.(), []);
  const patch = (role: Role, change: Partial<Side>) => setSides(previous => ({ ...previous, [role]: { ...previous[role], ...change } }));
  const fail = (action: Action, message: string) => setErrors(previous => ({ ...previous, [action]: message }));
  const clear = (...actions: Action[]) => setErrors(previous => {
    const next = { ...previous };
    for (const action of actions) delete next[action];
    return next;
  });

  // Inputs go to /input/<i>/<name> and outputs to /output/<name>, always with the user's filenames.
  async function execute(action: Action, args: Arg[], accepted = [0]): Promise<Done | null> {
    clear(action);
    const command = action.slice(0, action.indexOf(':')) as Command;
    try {
      const inputs: { path: string; bytes: ArrayBuffer }[] = [];
      const outputs: string[] = [];
      const argv: string[] = [command];
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
      const job = startCli('/workers/mac-auth.js', { args: argv, inputs, outputs });
      cancel.current = job.cancel;
      const result = await job.result;
      cancel.current = null;
      setBusy(null);
      if (result.cancelled) { fail(action, t('Operación cancelada.', 'Operation cancelled.')); return null; }
      if (!accepted.includes(result.code)) {
        // The C message is general, so the likely cause for this step goes first.
        const detail = result.error && result.error !== 'module' ? '\n' + result.error : '';
        fail(action, result.error === 'module' ? t('No se pudo cargar el módulo criptográfico.', 'Could not load the cryptographic module.')
          : t(...rejected[command]) + detail);
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

  // K feeds step 4 (Bob) or step 5 (Alice); a new K invalidates what was computed with the old one.
  function setK(role: Role, file: File | null, values?: { s: string; K: string }) {
    patch(role, { kFile: file, s: values?.s ?? '', K: values?.K ?? '' });
    if (role === 'a') setCheck(null); else setTau('');
  }
  function setKE(role: Role, file: File | null, KE = '') {
    patch(role, { keFile: file, KE, cipher: null, iv: '', decrypted: null });
  }

  async function generateKeys(role: Role) {
    const side = sides[role];
    if (cleanName(side.privateName) === cleanName(side.publicName)) { fail(`keygen:${role}`, t('Elige dos nombres de archivo diferentes.', 'Choose two different filenames.')); return; }
    const done = await execute(`keygen:${role}`, [{ output: side.privateName }, { output: side.publicName }]);
    if (!done) return;
    const secret = done.files[cleanName(side.privateName)], pub = done.files[cleanName(side.publicName)];
    patch(role, { privateKey: secret, publicKey: pub, point: done.values.Public ?? '', ownPrivate: secret, s: '', K: '' });
    patch(other(role), { peerPublic: pub, s: '', K: '' });
  }
  async function derive(role: Role) {
    const side = sides[role];
    if (!side.ownPrivate || !side.peerPublic) { fail(`derive:${role}`, t('Selecciona la clave privada propia y la clave pública del otro lado.', "Select your own private key and the other side's public key.")); return; }
    const done = await execute(`derive:${role}`, [{ input: side.ownPrivate, limit: KEY_LIMIT }, { input: side.peerPublic, limit: KEY_LIMIT }, { output: side.kName }]);
    if (!done) return;
    setK(role, done.files[cleanName(side.kName)], { s: done.values.s ?? '', K: done.values.K ?? '' });
  }
  async function challenge() {
    const done = await execute('challenge:a', [{ output: rName }]);
    if (!done) return;
    const file = done.files[cleanName(rName)];
    setRFile(file); setRValues(done.values);
    setAliceR(file); setCheck(null);
    setBobR(file); setTau('');
  }
  async function respond() {
    const kFile = sides.b.kFile;
    if (!kFile || !bobR) { fail('respond:b', t(`Selecciona la clave K de ${who('b')} y el reto r.`, `Select ${who('b')}'s key K and the challenge r.`)); return; }
    const done = await execute('respond:b', [{ input: kFile, limit: KEY_LIMIT }, { input: bobR, limit: KEY_LIMIT }, { output: tauName }]);
    if (!done) return;
    const file = done.files[cleanName(tauName)];
    setTauFile(file); setTau(done.values.tau ?? '');
    setAliceTau(file); setCheck(null);
    setBobKeTau(file); setKE('b', null);
  }
  async function verify() {
    const kFile = sides.a.kFile;
    if (!kFile || !aliceR || !aliceTau) { fail('check:a', t('Selecciona K, r y τ.', 'Select K, r and τ.')); return; }
    setCheck(null);
    // Exit 2 means tau != tau_prime: the program still prints both values.
    const done = await execute('check:a', [{ input: kFile, limit: KEY_LIMIT }, { input: aliceR, limit: KEY_LIMIT }, { input: aliceTau, limit: KEY_LIMIT }], [0, 2]);
    if (!done) return;
    const authenticated = done.code === 0 && done.values.Result === 'authenticated';
    setCheck({ tau: done.values.tau ?? '', tauPrime: done.values.tau_prime ?? '', authenticated });
    setKE('a', null);
  }
  async function sessionKey(role: Role) {
    const side = sides[role];
    const source = role === 'a' ? aliceTau : bobKeTau;
    if (role === 'a' && !check?.authenticated) { fail('session-key:a', t(`${who('a')} solo continúa cuando τ = τ′ en el paso 5.`, `${who('a')} only continues when τ = τ′ in step 5.`)); return; }
    if (!source) { fail(`session-key:${role}`, t('Selecciona τ.', 'Select τ.')); return; }
    const done = await execute(`session-key:${role}`, [{ input: source, limit: KEY_LIMIT }, { output: side.keName }]);
    if (done) setKE(role, done.files[cleanName(side.keName)], done.values.KE ?? '');
  }
  async function encryptFile(role: Role) {
    const side = sides[role];
    if (!side.keFile || !side.plain) { fail(`encrypt:${role}`, t('Selecciona KE y el archivo.', 'Select KE and the file.')); return; }
    const done = await execute(`encrypt:${role}`, [{ input: side.keFile, limit: KEY_LIMIT }, { input: side.plain, limit: FILE_LIMIT }, { output: side.cipherName }]);
    if (!done) return;
    const file = done.files[cleanName(side.cipherName)];
    patch(role, { cipher: file, iv: done.values.IV ?? '' });
    updateReceived(other(role), file);
  }
  async function decryptFile(role: Role) {
    const side = sides[role];
    if (!side.keFile || !side.received) { fail(`decrypt:${role}`, t('Deriva KE y selecciona el archivo cifrado.', 'Derive KE and select the encrypted file.')); return; }
    patch(role, { decrypted: null });
    const done = await execute(`decrypt:${role}`, [{ input: side.keFile, limit: KEY_LIMIT }, { input: side.received, limit: CIPHER_LIMIT }, { output: side.outName }]);
    if (done) patch(role, { decrypted: done.files[cleanName(side.outName)] });
  }
  function updatePlain(role: Role, file: File | null) {
    patch(role, { plain: file, cipher: null, iv: '', ...(file ? { cipherName: `${cleanName(file.name) || 'file'}.b64` } : {}) });
  }
  function updateReceived(role: Role, file: File | null) {
    patch(role, { received: file, decrypted: null, ...(file ? { outName: receivedName(file, lower(other(role))) } : {}) });
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
  function match(same: boolean, yes: string, no: string) {
    return <p className={same ? 'text-green-400' : 'text-red-400'}>{same ? yes : no}</p>;
  }
  const loaded = (note: boolean) => note ? t('Se cargó el archivo generado en esta sesión. Puedes reemplazarlo.', 'Loaded the file generated in this session. You can replace it.') : undefined;
  const working = t('Procesando…', 'Processing…');
  const roles: Role[] = ['a', 'b'];
  const legend = (role: Role, step: string) => <legend className="px-2 text-xl font-bold">{who(role)} · {step}</legend>;
  const { a, b } = sides;

  return <div className="space-y-8">
    <div className="grid lg:grid-cols-2 gap-8">
      {roles.map(role => { const side = sides[role]; return <fieldset key={role} disabled={busy !== null} className={panelClass}>
        {legend(role, t('1. Par de claves ECDH P-256', '1. ECDH P-256 key pair'))}
        <p className="text-sm text-text-secondary">{t(`La clave privada se guarda en PKCS#8 y la pública en SubjectPublicKeyInfo, ambas en PEM y en archivos separados. ${who(role)} comparte solo la clave pública.`,
          `The private key is stored as PKCS#8 and the public key as SubjectPublicKeyInfo, both in PEM and in separate files. ${who(role)} shares only the public key.`)}</p>
        {nameInput(t('Nombre de la clave privada', 'Private key filename'), side.privateName, value => patch(role, { privateName: value }), [`keygen:${role}`])}
        {nameInput(t('Nombre de la clave pública', 'Public key filename'), side.publicName, value => patch(role, { publicName: value }), [`keygen:${role}`])}
        <button type="button" className={buttonClass} onClick={() => generateKeys(role)}>{t('Generar claves', 'Generate keys')}</button>
        {status(`keygen:${role}`, working)}
        {side.point && side.publicKey && base64('Public', side.point)}
        {downloads([side.privateKey, side.publicKey])}
      </fieldset>; })}
    </div>

    <div className="space-y-4">
      <div className="grid lg:grid-cols-2 gap-8">
        {roles.map(role => { const side = sides[role], peer = other(role); return <fieldset key={role} disabled={busy !== null} className={panelClass}>
          {legend(role, t('2. ECDH y HKDF', '2. ECDH and HKDF'))}
          <p className="text-sm text-text-secondary">{t('s es la coordenada x del punto compartido (32 bytes) y K = HKDF-SHA-256(s) de 32 bytes.', 's is the x coordinate of the shared point (32 bytes) and K = HKDF-SHA-256(s), 32 bytes long.')}</p>
          {fileInput(t(`Clave privada de ${who(role)} (PEM)`, `${who(role)}'s private key (PEM)`), side.ownPrivate, file => patch(role, { ownPrivate: file, s: '', K: '' }), [`derive:${role}`], '.pem,.txt',
            loaded(!!side.privateKey && side.ownPrivate === side.privateKey))}
          {fileInput(t(`Clave pública de ${who(peer)} (PEM)`, `${who(peer)}'s public key (PEM)`), side.peerPublic, file => patch(role, { peerPublic: file, s: '', K: '' }), [`derive:${role}`], '.pem,.txt',
            loaded(!!sides[peer].publicKey && side.peerPublic === sides[peer].publicKey))}
          {nameInput(t('Nombre del archivo de K', 'Filename for K'), side.kName, value => patch(role, { kName: value }), [`derive:${role}`])}
          <button type="button" className={buttonClass} onClick={() => derive(role)}>{t('Calcular s y K', 'Compute s and K')}</button>
          {status(`derive:${role}`, working)}
          {side.K && side.kFile && <>{base64('s', side.s)}{base64('K', side.K)}</>}
          {downloads([side.kFile])}
        </fieldset>; })}
      </div>
      {a.K && b.K && match(a.s === b.s && a.K === b.K, t(`s y K coinciden en ${who('a')} y ${who('b')}.`, `s and K match for ${who('a')} and ${who('b')}.`),
        t(`s y K no coinciden: revisa las claves públicas que recibió cada lado.`, 's and K do not match: check the public keys each side received.'))}
    </div>

    <div className="grid lg:grid-cols-2 gap-8">
      <fieldset disabled={busy !== null} className={panelClass}>
        {legend('a', t('3. Reto r', '3. Challenge r'))}
        <p className="text-sm text-text-secondary">{t(`r tiene 32 bytes aleatorios (RAND_bytes). ${who('a')} envía el archivo de r a ${who('b')}.`, `r holds 32 random bytes (RAND_bytes). ${who('a')} sends the r file to ${who('b')}.`)}</p>
        {nameInput(t('Nombre del archivo de r', 'Filename for r'), rName, setRName, ['challenge:a'])}
        <button type="button" className={buttonClass} onClick={challenge}>{t('Generar r', 'Generate r')}</button>
        {status('challenge:a', working)}
        {rValues && rFile && <>{base64('r', rValues.r ?? '')}<p className="font-mono text-sm">rBits = {rValues.rBits}</p></>}
        {downloads([rFile])}
      </fieldset>

      <fieldset disabled={busy !== null} className={panelClass}>
        {legend('b', t('4. Respuesta τ = MAC_K(r)', '4. Response τ = MAC_K(r)'))}
        <p className="text-sm text-text-secondary">{t(`τ = HMAC-SHA-256 con K sobre r (32 bytes). ${who('b')} envía el archivo de τ a ${who('a')}.`, `τ = HMAC-SHA-256 with K over r (32 bytes). ${who('b')} sends the τ file to ${who('a')}.`)}</p>
        {fileInput(t(`Clave K de ${who('b')} (Base64)`, `${who('b')}'s key K (Base64)`), b.kFile, file => setK('b', file), ['respond:b'], '.b64,.txt', loaded(!!b.kFile && !!b.K))}
        {fileInput(t(`Reto r de ${who('a')} (Base64)`, `Challenge r from ${who('a')} (Base64)`), bobR, file => { setBobR(file); setTau(''); }, ['respond:b'], '.b64,.txt', loaded(!!rFile && bobR === rFile))}
        {nameInput(t('Nombre del archivo de τ', 'Filename for τ'), tauName, setTauName, ['respond:b'])}
        <button type="button" className={buttonClass} onClick={respond}>{t('Calcular τ', 'Compute τ')}</button>
        {status('respond:b', working)}
        {tau && tauFile && base64('tau', tau)}
        {downloads([tauFile])}
      </fieldset>
    </div>

    <fieldset disabled={busy !== null} className={panelClass}>
      {legend('a', t('5. Verificación de τ', '5. Verify τ'))}
      <p className="text-sm text-text-secondary">{t(`${who('a')} calcula τ′ = MAC_K(r) con su propia K y lo compara con τ en tiempo constante. Si son diferentes, ${who('a')} detiene la comunicación.`,
        `${who('a')} computes τ′ = MAC_K(r) with their own K and compares it with τ in constant time. If they differ, ${who('a')} stops the communication.`)}</p>
      <div className="grid md:grid-cols-3 gap-5">
        {fileInput(t(`Clave K de ${who('a')} (Base64)`, `${who('a')}'s key K (Base64)`), a.kFile, file => setK('a', file), ['check:a'], '.b64,.txt', loaded(!!a.kFile && !!a.K))}
        {fileInput(t('Reto r (Base64)', 'Challenge r (Base64)'), aliceR, file => { setAliceR(file); setCheck(null); }, ['check:a'], '.b64,.txt', loaded(!!rFile && aliceR === rFile))}
        {fileInput(t(`Respuesta τ de ${who('b')} (Base64)`, `Response τ from ${who('b')} (Base64)`), aliceTau, file => { setAliceTau(file); setCheck(null); setKE('a', null); }, ['check:a'], '.b64,.txt', loaded(!!tauFile && aliceTau === tauFile))}
      </div>
      <button type="button" className={buttonClass} onClick={verify}>{t('Verificar τ', 'Verify τ')}</button>
      {status('check:a', working)}
      {check && <div className="space-y-3" aria-live="polite">
        {base64('tau', check.tau)}{base64('tau_prime', check.tauPrime)}
        <p className={`font-mono ${check.authenticated ? 'text-green-400' : 'text-red-400'}`}>Result = {check.authenticated ? 'authenticated' : 'rejected'}</p>
        {match(check.authenticated, t(`τ = τ′: la autenticación de ${who('b')} está completa y la comunicación continúa.`, `τ = τ′: ${who('b')} is authenticated and the communication continues.`),
          t(`τ ≠ τ′: la autenticación de ${who('b')} falla. ${who('a')} detiene la comunicación.`, `τ ≠ τ′: ${who('b')} is not authenticated. ${who('a')} stops the communication.`))}
      </div>}
    </fieldset>

    <div className="space-y-4">
      <div className="grid lg:grid-cols-2 gap-8">
        {roles.map(role => { const side = sides[role]; return <fieldset key={role} disabled={busy !== null} className={panelClass}>
          {legend(role, t('6. Clave de sesión KE = KDF(τ)', '6. Session key KE = KDF(τ)'))}
          <p className="text-sm text-text-secondary">{t('KE = HKDF-SHA-256(τ) de 16 bytes, la clave de AES-128.', 'KE = HKDF-SHA-256(τ), 16 bytes long: the AES-128 key.')}</p>
          {role === 'a'
            ? <p className="text-sm">{check?.authenticated ? t(`${who('a')} usa τ verificado en el paso 5.`, `${who('a')} uses the τ verified in step 5.`) : t(`${who('a')} continúa solo cuando τ = τ′ en el paso 5.`, `${who('a')} continues only when τ = τ′ in step 5.`)}</p>
            : fileInput(t('Respuesta τ (Base64)', 'Response τ (Base64)'), bobKeTau, file => { setBobKeTau(file); setKE('b', null); }, ['session-key:b'], '.b64,.txt', loaded(!!tauFile && bobKeTau === tauFile))}
          {nameInput(t('Nombre del archivo de KE', 'Filename for KE'), side.keName, value => patch(role, { keName: value }), [`session-key:${role}`])}
          <button type="button" className={buttonClass} onClick={() => sessionKey(role)}>{t('Derivar KE', 'Derive KE')}</button>
          {status(`session-key:${role}`, working)}
          {side.KE && side.keFile && base64('KE', side.KE)}
          {fileInput(t(`Clave KE de ${who(role)} (Base64)`, `${who(role)}'s key KE (Base64)`), side.keFile, file => setKE(role, file), [`encrypt:${role}`, `decrypt:${role}`], '.b64,.txt',
            t('Se usa en los pasos 7 y 8.', 'Used in steps 7 and 8.'))}
          {downloads([side.keFile])}
        </fieldset>; })}
      </div>
      {a.KE && b.KE && match(a.KE === b.KE, t(`KE coincide en ${who('a')} y ${who('b')}.`, `KE matches for ${who('a')} and ${who('b')}.`),
        t('KE no coincide: los dos lados no usaron el mismo τ.', 'KE does not match: the two sides did not use the same τ.'))}
    </div>

    <div className="grid lg:grid-cols-2 gap-8">
      {roles.map(role => { const side = sides[role]; return <fieldset key={role} disabled={busy !== null} className={panelClass}>
        {legend(role, t('7. Cifrado de un archivo con AES-128-GCM', '7. Encrypt a file with AES-128-GCM'))}
        {fileInput(t('Archivo (imagen, video, PDF u otro formato, máximo 16 MiB)', 'File (image, video, PDF or any format, up to 16 MiB)'), side.plain, file => updatePlain(role, file), [`encrypt:${role}`])}
        {nameInput(t('Nombre del archivo cifrado', 'Encrypted filename'), side.cipherName, value => patch(role, { cipherName: value }), [`encrypt:${role}`])}
        <p className="text-sm text-text-secondary">{t(`El archivo contiene Base64 de IV (12 bytes) || texto cifrado || etiqueta (16 bytes). ${who(role)} lo envía a ${who(other(role))}.`,
          `The file holds Base64 of IV (12 bytes) || ciphertext || tag (16 bytes). ${who(role)} sends it to ${who(other(role))}.`)}</p>
        <button type="button" className={buttonClass} onClick={() => encryptFile(role)}>{t('Cifrar archivo', 'Encrypt file')}</button>
        {status(`encrypt:${role}`, working)}
        {side.iv && side.cipher && base64('IV', side.iv)}
        {downloads([side.cipher])}
      </fieldset>; })}
    </div>

    <div className="grid lg:grid-cols-2 gap-8">
      {roles.map(role => { const side = sides[role], peer = other(role); return <fieldset key={role} disabled={busy !== null} className={panelClass}>
        {legend(role, t('8. Descifrado del archivo recibido', '8. Decrypt the received file'))}
        {fileInput(t(`Archivo cifrado de ${who(peer)} (Base64)`, `Encrypted file from ${who(peer)} (Base64)`), side.received, file => updateReceived(role, file), [`decrypt:${role}`], '.b64,.txt',
          loaded(!!sides[peer].cipher && side.received === sides[peer].cipher))}
        {nameInput(t('Nombre del archivo descifrado', 'Decrypted filename'), side.outName, value => patch(role, { outName: value }), [`decrypt:${role}`])}
        <button type="button" className={buttonClass} onClick={() => decryptFile(role)}>{t('Descifrar archivo', 'Decrypt file')}</button>
        {status(`decrypt:${role}`, working)}
        {side.decrypted && <p className="text-green-400">{t('Etiqueta GCM válida. Archivo recuperado: ', 'Valid GCM tag. Recovered file: ')}{side.decrypted.name} · {side.decrypted.size.toLocaleString()} bytes</p>}
        {downloads([side.decrypted])}
      </fieldset>; })}
    </div>
  </div>;
}
