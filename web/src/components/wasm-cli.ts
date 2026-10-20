// Shared helper for the C17 command-line modules that run inside a Web Worker.
export type CliFile = { path: string; bytes: Uint8Array };
export type CliResult = { code: number; output: string; error: string; files: CliFile[]; cancelled?: boolean };
export type CliRequest = { args: string[]; inputs?: { path: string; bytes: ArrayBuffer }[]; outputs?: string[] };

export function startCli(url: string, request: CliRequest) {
  const worker = new Worker(url, { type: 'module' });
  let settle: (result: CliResult) => void = () => {};
  const result = new Promise<CliResult>(resolve => { settle = resolve; });
  const finish = (value: CliResult) => { worker.terminate(); settle(value); };
  worker.onmessage = ({ data }: MessageEvent<CliResult>) => finish(data);
  worker.onerror = event => { event.preventDefault(); finish({ code: 1, output: '', error: 'module', files: [] }); };
  worker.postMessage(request, (request.inputs ?? []).map(input => input.bytes));
  return { result, cancel: () => finish({ code: 1, output: '', error: '', files: [], cancelled: true }) };
}

// Lines "name = value" printed by the CLI.
export function parseValues(output: string) {
  const values: Record<string, string> = {};
  for (const line of output.split('\n')) {
    const match = line.match(/^\s*([A-Za-z_][\w]*)\s*=\s*(.+?)\s*$/);
    if (match && !(match[1] in values)) values[match[1]] = match[2];
  }
  return values;
}

// Keeps only the final component of a user-chosen filename.
export function cleanName(name: string) {
  const base = (name.split(/[\\/]/).pop() ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return base === '.' || base === '..' ? '' : base.slice(0, 120);
}

export function download(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url; link.download = file.name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
