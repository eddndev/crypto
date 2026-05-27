import { useEffect, useRef, useState } from 'react';

type WasmModule = {
  default: (input?: unknown) => Promise<unknown>;
  generate_keys: (bits?: number | null) => string;
  encrypt_file: (
    file: Uint8Array,
    public_key_json: string,
  ) => { ciphertext: Uint8Array; encrypted_key: Uint8Array };
  decrypt_file: (
    ciphertext_with_nonce: Uint8Array,
    encrypted_key: Uint8Array,
    private_key_json: string,
  ) => Uint8Array;
};

type Status = 'idle' | 'loading' | 'ready' | 'error';

export type RsaApi = {
  status: Status;
  error: string | null;
  generateKeys: (bits?: number) => { publicKeyJson: string; privateKeyJson: string };
  encryptFile: (
    file: Uint8Array,
    publicKeyJson: string,
  ) => { ciphertext: Uint8Array; encryptedKey: Uint8Array };
  decryptFile: (
    ciphertext: Uint8Array,
    encryptedKey: Uint8Array,
    privateKeyJson: string,
  ) => Uint8Array;
};

export function useRsaWasm(): RsaApi {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const modRef = useRef<WasmModule | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    (async () => {
      try {
        const wasm = (await import('../../wasm/rsa/rsa.js')) as unknown as WasmModule;
        await wasm.default();
        if (!cancelled) {
          modRef.current = wasm;
          setStatus('ready');
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setStatus('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    status,
    error,
    generateKeys(bits) {
      if (!modRef.current) throw new Error('WASM not loaded yet');
      const raw = modRef.current.generate_keys(bits ?? 2048);
      const parsed = JSON.parse(raw) as {
        public_key_json: string;
        private_key_json: string;
      };
      return {
        publicKeyJson: parsed.public_key_json,
        privateKeyJson: parsed.private_key_json,
      };
    },
    encryptFile(file, publicKeyJson) {
      if (!modRef.current) throw new Error('WASM not loaded yet');
      const out = modRef.current.encrypt_file(file, publicKeyJson);
      return { ciphertext: coerceBytes(out.ciphertext), encryptedKey: coerceBytes(out.encrypted_key) };
    },
    decryptFile(ciphertext, encryptedKey, privateKeyJson) {
      if (!modRef.current) throw new Error('WASM not loaded yet');
      return coerceBytes(modRef.current.decrypt_file(ciphertext, encryptedKey, privateKeyJson));
    },
  };
}

// serde_wasm_bindgen serializes Vec<u8> as a JS Array<number>, NOT a Uint8Array.
// Wrapping an Array in new Blob([…]) coerces via toString() → comma-joined ASCII —
// then the saved .enc file is text, decrypt sees the wrong bytes and fails with
// "RSA decryption failed (wrong private key?)". Force Uint8Array on every byte
// vector crossing the WASM boundary so downloads and re-uploads round-trip.
function coerceBytes(v: Uint8Array | ArrayLike<number>): Uint8Array {
  return v instanceof Uint8Array ? v : new Uint8Array(v);
}
