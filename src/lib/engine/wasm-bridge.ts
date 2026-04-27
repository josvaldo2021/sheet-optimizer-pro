interface WasmBindings {
  wasm_optimize_v6(pieces_json: string, usable_w: number, usable_h: number, min_break: number): string;
  wasm_optimize_genetic(
    pieces_json: string,
    usable_w: number,
    usable_h: number,
    min_break: number,
    pop_size: number,
    generations: number,
    on_progress?: (json: string) => void,
  ): string;
}

let wasmMod: WasmBindings | null = null;
let initAttempted = false;

export async function tryInitWasm(): Promise<boolean> {
  if (initAttempted) return wasmMod !== null;
  initAttempted = true;
  console.log('[WASM] tentando carregar engine Rust...');
  try {
    // Run `npm run build:wasm` first to generate wasm-engine/pkg/.
    // @wasm alias resolves to wasm-engine/pkg/ (configured in vite.config.ts).
    // @ts-ignore — generated file, types resolved at runtime
    const mod = await import('@wasm/optimizer_wasm.js');
    if (typeof mod.default === 'function') {
      await mod.default();
    }
    wasmMod = mod as unknown as WasmBindings;
    console.log('[WASM] ✓ engine Rust carregado com sucesso!');
    return true;
  } catch (e) {
    console.error('[WASM] falhou, usando TypeScript como fallback:', e);
    return false;
  }
}

export function getWasm(): WasmBindings | null {
  return wasmMod;
}

export function isWasmReady(): boolean {
  return wasmMod !== null;
}
