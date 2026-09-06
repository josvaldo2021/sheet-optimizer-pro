/**
 * Contrato de mensagens entre `engine-adapter.ts` e `engine.worker.ts`.
 *
 * Vive num arquivo SÓ DE TIPOS de propósito: se o adapter importar os tipos
 * direto de `engine.worker.ts`, o grafo do worker (genetic + wasm-bridge) entra
 * no módulo do adapter. Medido: isso deixou o benchmark 2,5-4x mais lento
 * (`heuristics-benchmark`, cenário alto-volume: 2,0 s -> 5,3-9,1 s).
 */
import type { Piece, OptimizationProgress, TreeNode } from './types';

export interface WorkerRequest {
  id: number;
  useWasm: boolean;
  pieces: Piece[];
  usableW: number;
  usableH: number;
  minBreak: number;
  priorityLabels?: string[];
  gaPopulationSize: number;
  gaGenerations: number;
}

export type WorkerResponse =
  | { id: number; type: 'progress'; progress: OptimizationProgress }
  | { id: number; type: 'done'; tree: TreeNode }
  | { id: number; type: 'error'; message: string };
