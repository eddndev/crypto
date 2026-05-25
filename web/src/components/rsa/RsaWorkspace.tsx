import { useState } from 'react';
import { useRsaWasm } from './useRsaWasm';

type Lang = 'en' | 'es';
type SubTab = 'generate' | 'encrypt' | 'decrypt';

const T = {
  en: {
    notReady: 'WASM not loaded yet',
    loading: 'Loading WebAssembly…',
    wasmError: 'Failed to load WASM',
    subtabs: { generate: '1. Generate keys', encrypt: '2. Encrypt file', decrypt: '3. Decrypt file' },
    gen: {
      title: 'Generate an RSA keypair',
      desc: 'A 2048-bit RSA keypair is generated entirely in your browser. Randomness comes from the platform CSPRNG (window.crypto.getRandomValues). The private key never leaves this tab.',
      name: 'Owner name',
      namePh: 'alicia',
      bits: 'Key size (bits)',
      run: 'Generate keys',
      running: 'Generating… (this can take a few seconds)',
      warn: '⚠ Never share your private key. Only distribute the public one.',
      pubReady: 'Public key',
      privReady: 'Private key',
      download: 'Download',
    },
    enc: {
      title: 'Encrypt a file for a recipient',
      desc: 'Hybrid scheme: a fresh AES-256-GCM key encrypts the file; that key is then encrypted with the recipient\'s RSA public key (PKCS#1 v1.5).',
      file: 'File to encrypt',
      key: "Recipient's public key (.json)",
      run: 'Encrypt',
      cipherOut: 'Encrypted file',
      keyOut: 'Encrypted AES key',
      download: 'Download',
    },
    dec: {
      title: 'Decrypt a received file',
      desc: 'Provide the encrypted file, the encrypted AES key, and your private key. Decryption is local; nothing is uploaded.',
      cipher: 'Encrypted file (.enc)',
      key: 'Encrypted AES key (_key.enc)',
      priv: 'Your private key (.json)',
      run: 'Decrypt',
      out: 'Decrypted file',
      download: 'Download',
    },
    pickFile: 'Pick a file…',
    chosen: 'Selected',
  },
  es: {
    notReady: 'WASM aún no carga',
    loading: 'Cargando WebAssembly…',
    wasmError: 'No se pudo cargar el WASM',
    subtabs: { generate: '1. Generar llaves', encrypt: '2. Cifrar archivo', decrypt: '3. Descifrar archivo' },
    gen: {
      title: 'Generar un par de llaves RSA',
      desc: 'Se genera un par de llaves RSA de 2048 bits íntegramente en tu navegador. La aleatoriedad proviene del CSPRNG del sistema (window.crypto.getRandomValues). La llave privada nunca sale de esta pestaña.',
      name: 'Nombre del titular',
      namePh: 'alicia',
      bits: 'Tamaño de llave (bits)',
      run: 'Generar llaves',
      running: 'Generando… (puede tardar unos segundos)',
      warn: '⚠ Nunca compartas tu llave privada. Solo distribuye la pública.',
      pubReady: 'Llave pública',
      privReady: 'Llave privada',
      download: 'Descargar',
    },
    enc: {
      title: 'Cifrar un archivo para un destinatario',
      desc: 'Esquema híbrido: una llave AES-256-GCM nueva cifra el archivo; esa llave se cifra a su vez con la llave pública RSA del destinatario (PKCS#1 v1.5).',
      file: 'Archivo a cifrar',
      key: 'Llave pública del destinatario (.json)',
      run: 'Cifrar',
      cipherOut: 'Archivo cifrado',
      keyOut: 'Llave AES cifrada',
      download: 'Descargar',
    },
    dec: {
      title: 'Descifrar un archivo recibido',
      desc: 'Proporciona el archivo cifrado, la llave AES cifrada y tu llave privada. El descifrado es local; nada se sube a ningún servidor.',
      cipher: 'Archivo cifrado (.enc)',
      key: 'Llave AES cifrada (_key.enc)',
      priv: 'Tu llave privada (.json)',
      run: 'Descifrar',
      out: 'Archivo descifrado',
      download: 'Descargar',
    },
    pickFile: 'Elegir archivo…',
    chosen: 'Seleccionado',
  },
} as const;

function download(filename: string, data: BlobPart, mime = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function readBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

async function readText(file: File): Promise<string> {
  return await file.text();
}

export default function RsaWorkspace({ lang = 'en' as Lang }: { lang?: Lang }) {
  const t = T[lang];
  const [tab, setTab] = useState<SubTab>('generate');
  const wasm = useRsaWasm();

  return (
    <div className="flex flex-col gap-6">
      {/* WASM status banner */}
      {wasm.status === 'loading' && (
        <div className="font-mono text-[0.78rem] text-text-secondary">
          {t.loading}
        </div>
      )}
      {wasm.status === 'error' && (
        <div className="p-4 border border-red-500/50 bg-red-500/10 font-mono text-[0.85rem] text-red-400">
          {t.wasmError}: {wasm.error}
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex gap-2 flex-wrap">
        {(Object.keys(t.subtabs) as SubTab[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`font-mono text-[0.75rem] uppercase tracking-[0.08em] py-2 px-4 border transition-colors ${
              tab === k
                ? 'border-accent bg-accent-deep text-white'
                : 'border-[#3a3a42] text-text-secondary hover:text-text-primary hover:border-accent'
            }`}
          >
            {t.subtabs[k]}
          </button>
        ))}
      </div>

      {tab === 'generate' && <GeneratePanel wasm={wasm} t={t.gen} ready={wasm.status === 'ready'} notReady={t.notReady} />}
      {tab === 'encrypt' && <EncryptPanel wasm={wasm} t={t.enc} pickFile={t.pickFile} chosen={t.chosen} ready={wasm.status === 'ready'} notReady={t.notReady} />}
      {tab === 'decrypt' && <DecryptPanel wasm={wasm} t={t.dec} pickFile={t.pickFile} chosen={t.chosen} ready={wasm.status === 'ready'} notReady={t.notReady} />}
    </div>
  );
}

function GeneratePanel({
  wasm,
  t,
  ready,
  notReady,
}: {
  wasm: ReturnType<typeof useRsaWasm>;
  t: typeof T.en.gen;
  ready: boolean;
  notReady: string;
}) {
  const [name, setName] = useState('alicia');
  const [bits, setBits] = useState(2048);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keys, setKeys] = useState<{ pub: string; priv: string } | null>(null);

  async function run() {
    if (!ready) {
      setError(notReady);
      return;
    }
    setBusy(true);
    setError(null);
    setKeys(null);
    // Defer to next frame so the "running" state can paint before the
    // (synchronous, multi-second) WASM call hogs the main thread.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    try {
      const { publicKeyJson, privateKeyJson } = wasm.generateKeys(bits);
      setKeys({ pub: publicKeyJson, priv: privateKeyJson });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const cleanName = (name || 'user').replace(/[^a-zA-Z0-9_-]/g, '_');

  return (
    <Section title={t.title} desc={t.desc}>
      <div className="grid grid-cols-[1fr_auto] max-md:grid-cols-1 gap-4 items-end">
        <Field label={t.name}>
          <input
            type="text"
            value={name}
            placeholder={t.namePh}
            onChange={(e) => setName(e.target.value)}
            className="bg-[#0c0c12] border border-[#3a3a42] p-3 font-mono text-[0.9rem] text-text-primary focus:outline-none focus:border-accent transition-colors"
          />
        </Field>
        <Field label={t.bits}>
          <select
            value={bits}
            onChange={(e) => setBits(parseInt(e.target.value, 10))}
            className="bg-[#0c0c12] border border-[#3a3a42] p-3 font-mono text-[0.9rem] text-text-primary focus:outline-none focus:border-accent transition-colors"
          >
            <option value={1024}>1024</option>
            <option value={2048}>2048</option>
            <option value={3072}>3072</option>
          </select>
        </Field>
      </div>
      <RunButton onClick={run} disabled={busy || !ready} busy={busy} label={busy ? t.running : t.run} />
      {error && <ErrorBox>{error}</ErrorBox>}
      {keys && (
        <div className="flex flex-col gap-3">
          <div className="font-mono text-[0.78rem] text-red-400">{t.warn}</div>
          <div className="grid grid-cols-2 max-md:grid-cols-1 gap-3">
            <ArtifactCard
              label={t.pubReady}
              filename={`${cleanName}_public.json`}
              data={keys.pub}
              mime="application/json"
              downloadLabel={t.download}
            />
            <ArtifactCard
              label={t.privReady}
              filename={`${cleanName}_private.json`}
              data={keys.priv}
              mime="application/json"
              downloadLabel={t.download}
              danger
            />
          </div>
        </div>
      )}
    </Section>
  );
}

function EncryptPanel({
  wasm,
  t,
  pickFile,
  chosen,
  ready,
  notReady,
}: {
  wasm: ReturnType<typeof useRsaWasm>;
  t: typeof T.en.enc;
  pickFile: string;
  chosen: string;
  ready: boolean;
  notReady: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [pubKey, setPubKey] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [out, setOut] = useState<{ ciphertext: Uint8Array; key: Uint8Array; baseName: string } | null>(
    null,
  );

  async function run() {
    if (!ready) {
      setError(notReady);
      return;
    }
    if (!file || !pubKey) {
      setError('Select both a file and a public key.');
      return;
    }
    setBusy(true);
    setError(null);
    setOut(null);
    try {
      const [bytes, pubJson] = await Promise.all([readBytes(file), readText(pubKey)]);
      const { ciphertext, encryptedKey } = wasm.encryptFile(bytes, pubJson);
      setOut({ ciphertext, key: encryptedKey, baseName: file.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title={t.title} desc={t.desc}>
      <FilePicker label={t.file} file={file} onChange={setFile} pickLabel={pickFile} chosenLabel={chosen} />
      <FilePicker
        label={t.key}
        file={pubKey}
        onChange={setPubKey}
        accept="application/json,.json"
        pickLabel={pickFile}
        chosenLabel={chosen}
      />
      <RunButton onClick={run} disabled={busy || !ready || !file || !pubKey} busy={busy} label={t.run} />
      {error && <ErrorBox>{error}</ErrorBox>}
      {out && (
        <div className="grid grid-cols-2 max-md:grid-cols-1 gap-3">
          <ArtifactCard
            label={t.cipherOut}
            filename={`${out.baseName}.enc`}
            data={out.ciphertext}
            downloadLabel={t.download}
          />
          <ArtifactCard
            label={t.keyOut}
            filename={`${out.baseName}_key.enc`}
            data={out.key}
            downloadLabel={t.download}
          />
        </div>
      )}
    </Section>
  );
}

function DecryptPanel({
  wasm,
  t,
  pickFile,
  chosen,
  ready,
  notReady,
}: {
  wasm: ReturnType<typeof useRsaWasm>;
  t: typeof T.en.dec;
  pickFile: string;
  chosen: string;
  ready: boolean;
  notReady: string;
}) {
  const [cipher, setCipher] = useState<File | null>(null);
  const [keyFile, setKeyFile] = useState<File | null>(null);
  const [priv, setPriv] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [out, setOut] = useState<{ plain: Uint8Array; name: string } | null>(null);

  async function run() {
    if (!ready) {
      setError(notReady);
      return;
    }
    if (!cipher || !keyFile || !priv) {
      setError('All three files are required.');
      return;
    }
    setBusy(true);
    setError(null);
    setOut(null);
    try {
      const [cipherBytes, keyBytes, privJson] = await Promise.all([
        readBytes(cipher),
        readBytes(keyFile),
        readText(priv),
      ]);
      const plain = wasm.decryptFile(cipherBytes, keyBytes, privJson);
      const outName = cipher.name.endsWith('.enc')
        ? cipher.name.slice(0, -4)
        : `${cipher.name}_decrypted`;
      setOut({ plain, name: outName });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title={t.title} desc={t.desc}>
      <FilePicker label={t.cipher} file={cipher} onChange={setCipher} pickLabel={pickFile} chosenLabel={chosen} />
      <FilePicker label={t.key} file={keyFile} onChange={setKeyFile} pickLabel={pickFile} chosenLabel={chosen} />
      <FilePicker
        label={t.priv}
        file={priv}
        onChange={setPriv}
        accept="application/json,.json"
        pickLabel={pickFile}
        chosenLabel={chosen}
      />
      <RunButton
        onClick={run}
        disabled={busy || !ready || !cipher || !keyFile || !priv}
        busy={busy}
        label={t.run}
      />
      {error && <ErrorBox>{error}</ErrorBox>}
      {out && (
        <ArtifactCard label={t.out} filename={out.name} data={out.plain} downloadLabel={t.download} />
      )}
    </Section>
  );
}

// --- Tiny presentational helpers ---------------------------------------------

function Section({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="font-extrabold tracking-[-0.01em] uppercase text-[1.15rem] mb-2">{title}</h3>
        <p className="text-text-secondary text-[0.9rem] leading-relaxed max-w-[700px]">{desc}</p>
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[0.7rem] text-text-secondary uppercase tracking-wider">{label}</span>
      {children}
    </label>
  );
}

function FilePicker({
  label,
  file,
  onChange,
  accept,
  pickLabel,
  chosenLabel,
}: {
  label: string;
  file: File | null;
  onChange: (f: File | null) => void;
  accept?: string;
  pickLabel: string;
  chosenLabel: string;
}) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-3 flex-wrap">
        <label className="cursor-pointer font-mono text-[0.78rem] uppercase tracking-[0.08em] py-2 px-4 border border-[#3a3a42] text-text-secondary hover:text-text-primary hover:border-accent transition-colors">
          {pickLabel}
          <input
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => onChange(e.target.files?.[0] ?? null)}
          />
        </label>
        {file && (
          <span className="font-mono text-[0.78rem] text-text-secondary">
            {chosenLabel}: <span className="text-accent">{file.name}</span>{' '}
            <span className="text-text-secondary">({file.size} B)</span>
          </span>
        )}
      </div>
    </Field>
  );
}

function RunButton({
  onClick,
  disabled,
  busy,
  label,
}: {
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="self-start font-mono text-[0.8rem] font-semibold tracking-[0.1em] uppercase py-3 px-6 bg-accent-deep text-white border-none cursor-pointer transition-all duration-200 hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
    >
      {busy ? '…' : ''} {label}
    </button>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-3 border border-red-500/50 bg-red-500/10 font-mono text-[0.85rem] text-red-400">
      {children}
    </div>
  );
}

function ArtifactCard({
  label,
  filename,
  data,
  mime,
  downloadLabel,
  danger,
}: {
  label: string;
  filename: string;
  data: BlobPart;
  mime?: string;
  downloadLabel: string;
  danger?: boolean;
}) {
  const sizeLabel =
    typeof data === 'string' ? `${data.length} chars` : `${(data as Uint8Array).byteLength} B`;
  return (
    <div
      className={`p-4 border ${danger ? 'border-red-500/40 bg-red-500/5' : 'border-[#3a3a42] bg-[#0c0c12]'}`}
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="font-mono text-[0.78rem] text-accent uppercase tracking-[0.08em]">{label}</span>
        <span className="font-mono text-[0.7rem] text-text-secondary">{sizeLabel}</span>
      </div>
      <div className="font-mono text-[0.82rem] text-text-primary mb-3 break-all">{filename}</div>
      <button
        type="button"
        onClick={() => download(filename, data, mime)}
        className="font-mono text-[0.75rem] uppercase tracking-[0.08em] py-2 px-4 border border-[#3a3a42] hover:border-accent hover:text-accent text-text-secondary transition-colors"
      >
        {downloadLabel}
      </button>
    </div>
  );
}
