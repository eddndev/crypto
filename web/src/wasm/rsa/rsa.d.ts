/* tslint:disable */
/* eslint-disable */

/**
 * Inverse of [`encrypt_file`]. Returns the decrypted plaintext bytes.
 */
export function decrypt_file(ciphertext_with_nonce: Uint8Array, encrypted_key: Uint8Array, private_key_json: string): Uint8Array;

/**
 * Hybrid encryption: AES-256-GCM with a fresh key+nonce, then encrypt the AES
 * key with the recipient's RSA public key (PKCS#1 v1.5).
 *
 * Output ciphertext layout matches the CLI practice: `[12-byte nonce || aes-gcm ciphertext]`.
 */
export function encrypt_file(file: Uint8Array, public_key_json: string): any;

/**
 * Generate a 2048-bit RSA keypair. Returns `{public_key_json, private_key_json}`
 * as a JSON string — each value is itself the JSON payload of the corresponding
 * key file (same shape as the CLI practice).
 */
export function generate_keys(bits?: number | null): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly decrypt_file: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly encrypt_file: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly generate_keys: (a: number) => [number, number, number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
