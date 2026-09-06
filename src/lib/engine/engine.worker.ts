/// <reference lib="webworker" />
/**
 * Worker do motor: tira o `optimizeGeneticAsync` da thread principal.
 *
 * MOTIVO: a chamada `wasm_optimize_genetic` é ATÔMICA e, em inventários grandes,
 * bloqueava a UI por até 10 s de uma vez (medido com 1000 peças) — o Chrome exibe
 * "página sem resposta" a partir de ~5 s. O laço de plano já cedia o controle ENTRE
 * chapas (`Index.tsx`), mas o bloco está DENTRO de uma chapa, então isso não bastava.
 *
 * Só este ponto foi movido: `optimizeGeneticAsync` já era `async` e já era `await`ado
 * no chamador, então nenhuma assinatura muda. As demais chamadas do motor
 * (`optimizeV6`/`runPlacement`) continuam síncronas na thread principal — elas são
 * injetadas como callbacks síncronos em `buildJumboSheet`/XFill e movê-las exigiria
 * refatoração async na camada de conservação.
 *
 * A semeadura por heurísticas (`optimizeV6` normal + transposta) roda DENTRO do
 * genetic (`genetic.ts:537-544`), então é a maior parte do custo e vem junto.
 */
import type { Piece, OptimizationProgress, TreeNode } from './types';
import { optimizeGeneticAsync as optimizeGeneticTS } from './genetic';
import { tryInitWasm, getWasm } from './wasm-bridge';
import type { WorkerRequest, WorkerResponse } from './worker-protocol';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  const post = (msg: WorkerResponse) => ctx.postMessage(msg);

  // O motor emite progresso a CADA indivíduo do GA (`genetic.rs:533`) — dezenas de
  // milhares de eventos num trabalho grande. Antes do worker isso não pesava porque
  // a thread travada engolia os repaints: o React enfileirava os `setProgress` e só
  // renderizava quando cedia, entre chapas. Com a thread livre, cada mensagem
  // repinta a UI (medido: 304 s -> 492 s com 1000 peças).
  //
  // Limitamos por TEMPO, não por evento: a barra anda ~20x/s independentemente de o
  // trabalho ter 100 ou 1.000.000 de avaliações. O `done` fecha a barra no final.
  const PROGRESS_MIN_INTERVAL_MS = 50;
  let lastProgressAt = 0;
  const onProgress = (p: OptimizationProgress) => {
    const now = Date.now();
    if (now - lastProgressAt < PROGRESS_MIN_INTERVAL_MS) return;
    lastProgressAt = now;
    post({ id: req.id, type: 'progress', progress: p });
  };

  try {
    let tree: TreeNode | null = null;

    if (req.useWasm && (await tryInitWasm())) {
      const wasm = getWasm();
      if (wasm) {
        try {
          const json = wasm.wasm_optimize_genetic(
            JSON.stringify(req.pieces),
            req.usableW, req.usableH, req.minBreak,
            req.gaPopulationSize, req.gaGenerations,
            (j: string) => { try { onProgress(JSON.parse(j)); } catch { /* progresso é best-effort */ } },
          );
          tree = JSON.parse(json) as TreeNode;
        } catch (e) {
          console.warn('[worker] wasm_optimize_genetic falhou, caindo para TS:', e);
        }
      }
    }

    if (!tree) {
      tree = await optimizeGeneticTS(
        req.pieces, req.usableW, req.usableH, req.minBreak,
        onProgress, req.priorityLabels, req.gaPopulationSize, req.gaGenerations,
      );
    }

    post({ id: req.id, type: 'done', tree });
  } catch (e) {
    post({ id: req.id, type: 'error', message: e instanceof Error ? e.message : String(e) });
  }
};
