import { useEffect, useRef, useState } from 'react';
import type { OpResponse } from './types';

type WasmModule = {
  default: (input?: unknown) => Promise<unknown>;
  op: (requestJson: string) => string;
};

type Status = 'idle' | 'loading' | 'ready' | 'error';

export function useMatrixWasm() {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const modRef = useRef<WasmModule | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    (async () => {
      try {
        const wasm = (await import('../../wasm/matrix/matrix.js')) as unknown as WasmModule;
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

  function call(request: object): OpResponse {
    if (!modRef.current) throw new Error('WASM not loaded yet');
    const json = modRef.current.op(JSON.stringify(request));
    return JSON.parse(json) as OpResponse;
  }

  return { status, error, call };
}
