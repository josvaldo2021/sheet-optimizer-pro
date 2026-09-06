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
// POOL de workers do motor (`engine.worker.ts`).
//
// Um worker já bastava para a UI não travar (`wasm_optimize_genetic` é ATÔMICA e
// chegou a bloquear 10 s com 1000 peças). O POOL existe para outra coisa: o plano
// testa 3-4 CANDIDATOS independentes (variantes de ordenação + guloso) e antes os
// rodava em série. Com um worker por candidato eles rodam de verdade em paralelo.
//
// Workers são LONGEVOS — cada um instancia o próprio WASM, que é caro. Qualquer
// falha desliga o pool INTEIRO e degrada, em definitivo, para a thread principal;
// ambientes sem `Worker` (jsdom/testes) caem nesse caminho de imediato.
// ─────────────────────────────────────────────────────────────────────────────
interface PendingCall {
  resolve: (t: TreeNode) => void;
  reject: (e: unknown) => void;
  onProgress?: (p: OptimizationProgress) => void;
}
interface PoolSlot { worker: Worker; busy: boolean }

/** Teto do pool: o plano tem 3-4 candidatos, mais workers não teriam quem servir. */
const POOL_MAX = 4;

let _pool: PoolSlot[] = [];
let _workersUnavailable = false;
let _reqSeq = 0;
const _pending = new Map<number, PendingCall>();
const _waiters: Array<(s: PoolSlot | null) => void> = [];

/**
 * Tamanho do pool. `localStorage.enginePoolSize` sobrepõe (mesmo padrão de
 * `useWasmEngine`): serve para diagnosticar — pool 1 reproduz o comportamento em
 * série sem precisar de outro build.
 */
function poolSize(): number {
  try {
    const override = Number(localStorage.getItem('enginePoolSize'));
    if (Number.isFinite(override) && override >= 1) return Math.min(POOL_MAX, Math.floor(override));
  } catch { /* sem localStorage: usa o padrão */ }
  const hc = typeof navigator !== 'undefined' && navigator.hardwareConcurrency
    ? navigator.hardwareConcurrency : 4;
  // Deixa um núcleo para a thread principal, que ainda roda `runPlacement`,
  // `optimizeV6` e as operações de árvore de forma síncrona.
  return Math.max(1, Math.min(POOL_MAX, hc - 1));
}

function disableWorkers(reason: unknown): void {
  _workersUnavailable = true;
  for (const slot of _pool) { try { slot.worker.terminate(); } catch { /* já morto */ } }
  _pool = [];
  for (const [, call] of _pending) call.reject(reason);
  _pending.clear();
  while (_waiters.length) _waiters.shift()!(null);
}

function spawnSlot(): PoolSlot | null {
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
      disableWorkers(new Error('worker indisponível'));
    };
    return { worker: w, busy: false };
  } catch (e) {
    console.warn('[worker] não pôde ser criado; motor fica na thread principal:', e);
    return null;
  }
}

function acquireSlot(): Promise<PoolSlot | null> {
  if (_workersUnavailable) return Promise.resolve(null);
  if (typeof Worker === 'undefined') { _workersUnavailable = true; return Promise.resolve(null); }
  const free = _pool.find((s) => !s.busy);
  if (free) { free.busy = true; return Promise.resolve(free); }
  if (_pool.length < poolSize()) {
    const slot = spawnSlot();
    if (!slot) { _workersUnavailable = true; return Promise.resolve(null); }
    slot.busy = true;
    _pool.push(slot);
    return Promise.resolve(slot);
  }
  // Pool cheio: espera alguém liberar. `releaseSlot` entrega o slot AINDA ocupado
  // ao próximo da fila, então não há janela para outro chamador roubá-lo.
  return new Promise((res) => _waiters.push(res));
}

function releaseSlot(slot: PoolSlot): void {
  if (_workersUnavailable) return;
  const next = _waiters.shift();
  if (next) { next(slot); return; }
  slot.busy = false;
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
  const slot = await acquireSlot();
  if (slot) {
    try {
      return await new Promise<TreeNode>((resolve, reject) => {
        const id = ++_reqSeq;
        _pending.set(id, { resolve, reject, onProgress });
        const req: WorkerRequest = {
          id, useWasm: _useWasm, pieces, usableW, usableH, minBreak,
          priorityLabels, gaPopulationSize, gaGenerations,
        };
        slot.worker.postMessage(req);
      });
    } catch (e) {
      console.warn('[worker] chamada falhou; refazendo na thread principal:', e);
    } finally {
      releaseSlot(slot);
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
