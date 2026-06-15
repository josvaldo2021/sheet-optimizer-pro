import { TreeNode, Piece, OptimizationProgress } from './types';
import { optimizeGeneticAsync as _optimizeGeneticTS, optimizeGeneticV1 as _optimizeGeneticV1TS } from './genetic';
import { optimizeV6 as _optimizeV6TS } from './optimizer';
import { tryInitWasm, getWasm, isWasmReady } from './wasm-bridge';

const STORAGE_KEY = 'useWasmEngine';

let _useWasm: boolean = localStorage.getItem(STORAGE_KEY) !== 'false';

export function getUseWasmEngine(): boolean { return _useWasm; }
export function setUseWasmEngine(val: boolean): void {
  _useWasm = val;
  localStorage.setItem(STORAGE_KEY, val ? 'true' : 'false');
}
export { isWasmReady };

let _wasmInitDone = false;
let _wasmInitPromise: Promise<boolean> | null = null;

async function ensureWasm(): Promise<boolean> {
  if (!_useWasm) return false;
  if (!_wasmInitDone) {
    _wasmInitDone = true;
    _wasmInitPromise = tryInitWasm();
    await _wasmInitPromise;
    _wasmInitPromise = null;
  } else if (_wasmInitPromise) {
    await _wasmInitPromise;
  }
  return getWasm() !== null;
}

// Eagerly kick off WASM init so it's ready when optimizeV6 (sync) is called
ensureWasm();

export async function optimizeGeneticAsync(
  pieces: Piece[],
  usableW: number,
  usableH: number,
  minBreak = 0,
  onProgress?: (p: OptimizationProgress) => void,
  priorityLabels?: string[],
  gaPopulationSize = 10,
  gaGenerations = 10,
): Promise<TreeNode> {
  if (await ensureWasm()) {
    const wasm = getWasm()!;
    try {
      const progressCb = onProgress
        ? (json: string) => {
            try { onProgress(JSON.parse(json)); } catch { /* ignore */ }
          }
        : undefined;
      const resultJson = wasm.wasm_optimize_genetic(
        JSON.stringify(pieces),
        usableW, usableH, minBreak,
        gaPopulationSize, gaGenerations,
        progressCb,
      );
      return JSON.parse(resultJson) as TreeNode;
    } catch (e) {
      console.warn('[WASM] optimize_genetic error, falling back to TS:', e);
    }
  }
  return _optimizeGeneticTS(pieces, usableW, usableH, minBreak, onProgress, priorityLabels, gaPopulationSize, gaGenerations);
}

export function optimizeV6(
  pieces: Piece[],
  usableW: number,
  usableH: number,
  minBreak = 0,
  useGrouping?: boolean,
): { tree: TreeNode; remaining: Piece[] } {
  if (_useWasm && getWasm()) {
    const wasm = getWasm()!;
    try {
      const resultJson = wasm.wasm_optimize_v6(JSON.stringify(pieces), usableW, usableH, minBreak);
      return JSON.parse(resultJson) as { tree: TreeNode; remaining: Piece[] };
    } catch (e) {
      console.warn('[WASM] optimize_v6 error, falling back to TS:', e);
    }
  }
  return _optimizeV6TS(pieces, usableW, usableH, minBreak, useGrouping);
}

export { optimizeGeneticV1 } from './genetic';
