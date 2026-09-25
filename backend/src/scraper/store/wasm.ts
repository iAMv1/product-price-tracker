/**
 * `Cr`: compile the challenge-supplied WASM module and call its `f` export.
 * The module is fresh base64 per challenge (816–864 chars observed), so it
 * needs no extraction — it arrives inside the handshake. Any structural
 * problem (bad base64, no `f` export) means the storefront changed and the
 * caller must surface `handshake_drift`.
 *
 * Minimal structural declaration: tsconfig lib is ES2023 without DOM, and
 * @types/node does not provide the WebAssembly compile/instantiate shape,
 * so the two members we use are declared here instead of widening lib.
 */
declare const WebAssembly: {
  compile(bytes: Uint8Array): Promise<unknown>;
  instantiate(module: unknown): Promise<{ exports: Record<string, unknown> }>;
};

/** Observed challenge modules are under 1KB; anything huge is not ours. */
const MAX_WASM_BYTES = 65_536;

export async function callChallengeWasm(
  wasmBase64: string,
  seed: number,
): Promise<number> {
  const bytes = Buffer.from(wasmBase64, 'base64');
  if (bytes.length === 0) throw new Error('challenge wasm is empty');
  if (bytes.length > MAX_WASM_BYTES) {
    throw new Error(
      `challenge wasm is ${bytes.length} bytes (cap ${MAX_WASM_BYTES}): storefront drift?`,
    );
  }
  const module = await WebAssembly.compile(bytes);
  const instance = await WebAssembly.instantiate(module);
  const fn = (instance.exports as Record<string, unknown>)['f'];
  if (typeof fn !== 'function') {
    throw new Error(
      `challenge wasm has no f export (exports: ${Object.keys(instance.exports).join(',') || 'none'})`,
    );
  }
  return (fn as (seed: number) => number)(seed) | 0;
}
