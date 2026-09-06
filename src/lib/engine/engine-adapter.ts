import { TreeNode, Piece, OptimizationProgress } from './types';
import { optimizeGeneticAsync as _optimizeGeneticTS, optimizeGeneticV1 as _optimizeGeneticV1TS } from './genetic';
import { optimizeV6 as _optimizeV6TS } from './optimizer';
import { tryInitWasm, getWasm, isWasmReady } from './wasm-bridge';
import type { WorkerRequest, WorkerResponse } from './worker-protocol';

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

// ─────────────────────────────────────────────────────────────────────────────
// Worker do motor (`engine.worker.ts`): mantém a UI responsiva em inventários
// grandes. `wasm_optimize_genetic` é uma chamada ATÔMICA que chegou a travar a
// thread principal por 10 s com 1000 peças (limiar do "página sem resposta" do
// Chrome: ~5 s). O worker é LONGEVO — recriá-lo por chamada re-instanciaria o
// WASM, que é caro. Qualquer falha degrada, em definitivo, para a thread
// principal, então ambientes sem Worker (jsdom/testes) seguem funcionando.
// ─────────────────────────────────────────────────────────────────────────────
interface PendingCall {
  resolve: (t: TreeNode) => void;
  reject: (e: unknown) => void;
  onProgress?: (p: OptimizationProgress) => void;
}

let _worker: Worker | null = null;
let _workerUnavailable = false;
let _reqSeq = 0;
const _pending = new Map<number, PendingCall>();

function disableWorker(reason: unknown): void {
  _workerUnavailable = true;
  _worker = null;
  for (const [, call] of _pending) call.reject(reason);
  _pending.clear();
}

function getWorker(): Worker | null {
  if (_workerUnavailable) return null;
  if (_worker) return _worker;
  if (typeof Worker === 'undefined') { _workerUnavailable = true; return null; }
  try {
    const w = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const msg = ev.data;
      const call = _pending.get(msg.id);
      if (!call) return;
      if (msg.type === 'progress') { call.onProgress?.(msg.progress); return; }
      _pending.delete(msg.id);
      if (msg.type === 'done') call.resolve(msg.tree);
      else call.reject(new Error(msg.message));
    };
    w.onerror = (e: ErrorEvent) => {
      console.warn('[worker] indisponível; motor volta para a thread principal:', e.message || e);
      disableWorker(new Error('worker indisponível'));
    };
    _worker = w;
    return w;
  } catch (e) {
    console.warn('[worker] não pôde ser criado; motor fica na thread principal:', e);
    _workerUnavailable = true;
    return null;
  }
}

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
  const worker = getWorker();
  if (worker) {
    try {
      return await new Promise<TreeNode>((resolve, reject) => {
        const id = ++_reqSeq;
        _pending.set(id, { resolve, reject, onProgress });
        const req: WorkerRequest = {
          id, useWasm: _useWasm, pieces, usableW, usableH, minBreak,
          priorityLabels, gaPopulationSize, gaGenerations,
        };
        worker.postMessage(req);
      });
    } catch (e) {
      console.warn('[worker] chamada falhou; refazendo na thread principal:', e);
    }
  }
  return optimizeGeneticInThread(
    pieces, usableW, usableH, minBreak, onProgress, priorityLabels, gaPopulationSize, gaGenerations,
  );
}

async function optimizeGeneticInThread(
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
