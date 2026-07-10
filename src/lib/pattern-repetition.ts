// Seleção de padrão por repetibilidade no fluxo multi-chapa (spec 006).
//
// Módulo PURO e determinístico: recebe candidatos de layout + inventário restante
// + piso de aproveitamento, e escolhe o padrão que pode ser repetido no maior número
// de chapas mantendo aproveitamento >= piso. Não conhece React/DOM nem o motor de
// corte (a construção da árvore é injetada via `buildTree`), preservando os
// Princípios II (motor puro) e IV (árvore é a fonte da verdade) da constituição.
//
// Ver specs/006-repeticao-padrao/{spec,plan,data-model,contracts}.

import type { TreeNode } from "./engine/types";

/** Uma linha da composição de um padrão: dimensão + quantas cópias por chapa. */
export interface BomEntry {
  w: number;
  h: number;
  count: number;
}

/** Item do inventário restante (dimensão + quantidade disponível). */
export interface RemainingItem {
  w: number;
  h: number;
  qty: number;
}

/** Um plano de corte candidato para uma chapa na etapa atual. */
export interface LayoutCandidate {
  /** Composição do padrão, extraída da árvore (nunca por set-difference). */
  bom: BomEntry[];
  /** Aproveitamento em [0,1] = área ocupada / área útil da chapa. */
  util: number;
  /** Total de peças por chapa nesse padrão. */
  perSheet: number;
  /** Origem do candidato. */
  kind: "best-area" | "homogeneous";
  /** Materializa a árvore (lazy — só chamado no vencedor). */
  buildTree: () => TreeNode;
  /** Assinatura determinística para desempate/identidade. */
  key: string;
}

/** Resultado de pontuar um candidato contra o inventário restante. */
export interface RepetitionEval {
  candidate: LayoutCandidate;
  /** Chapas ADICIONAIS que o padrão cobre além da primeira. */
  reps: number;
  /** Total de chapas cobertas = 1 + reps. */
  coverage: number;
  /** util >= piso. */
  passesFloor: boolean;
}

/** Configuração controlada pelo usuário (UI). */
export interface RepetitionConfig {
  enabled: boolean;
  /** Piso de aproveitamento em [0,1]. */
  utilizationFloor: number;
}

/** Retorno da seleção. */
export interface SelectionResult {
  chosen: RepetitionEval;
  /** false quando nenhum candidato atingiu o piso e houve fallback (FR-006). */
  floorReached: boolean;
}

/** Soma a quantidade disponível de uma dimensão no inventário (considerando rotação). */
function availableFor(remaining: RemainingItem[], w: number, h: number): number {
  let total = 0;
  for (const p of remaining) {
    if ((p.w === w && p.h === h) || (p.w === h && p.h === w)) total += p.qty;
  }
  return total;
}

/**
 * Pontua um candidato: quantas chapas adicionais o padrão pode cobrir com o
 * inventário restante, limitado pela peça mais escassa do padrão (FR-004: só conta
 * uma repetição quando há peças para o CONJUNTO COMPLETO do padrão).
 * Puro: não muta `candidate` nem `remaining`.
 */
export function scoreCandidate(
  candidate: LayoutCandidate,
  remaining: RemainingItem[],
  utilizationFloor: number,
): RepetitionEval {
  let reps = Infinity;
  for (const b of candidate.bom) {
    const available = availableFor(remaining, b.w, b.h);
    const additional = available - b.count; // desconta a primeira chapa
    const possible = b.count > 0 ? Math.floor(additional / b.count) : 0;
    reps = Math.min(reps, possible);
  }
  if (!isFinite(reps) || reps < 0) reps = 0;
  return {
    candidate,
    reps,
    coverage: 1 + reps,
    passesFloor: candidate.util >= utilizationFloor,
  };
}

function cmpKey(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Escolhe o candidato pela repetibilidade, com o piso como restrição dura e o
 * objetivo primário de MENOS PADRÕES DISTINTOS (FR-011):
 *   1. filtra candidatos com util >= piso;
 *   2. entre os que passam: maior `reps` -> desempate maior `util` -> `key` (estável);
 *   3. se nenhum passa: maior `util` global (fallback), `floorReached = false` (FR-006).
 * Determinístico: mesmas entradas -> mesma escolha (FR-007).
 */
export function selectByRepetition(
  candidates: LayoutCandidate[],
  remaining: RemainingItem[],
  utilizationFloor: number,
): SelectionResult {
  if (candidates.length === 0) {
    throw new Error("selectByRepetition: lista de candidatos vazia");
  }
  const evals = candidates.map((c) => scoreCandidate(c, remaining, utilizationFloor));
  const passing = evals.filter((e) => e.passesFloor);

  if (passing.length > 0) {
    passing.sort(
      (a, b) =>
        b.reps - a.reps ||
        b.candidate.util - a.candidate.util ||
        cmpKey(a.candidate.key, b.candidate.key),
    );
    return { chosen: passing[0], floorReached: true };
  }

  // Fallback: nenhum atinge o piso -> maior aproveitamento disponível.
  evals.sort(
    (a, b) =>
      b.candidate.util - a.candidate.util ||
      b.reps - a.reps ||
      cmpKey(a.candidate.key, b.candidate.key),
  );
  return { chosen: evals[0], floorReached: false };
}

/**
 * Gera candidatos homogêneos (padrão feito de um único tipo de peça), pontuados
 * analiticamente por ladrilhamento — repetem muito por construção. A árvore só é
 * materializada quando o candidato vence (via `buildTreeForSubset`, injetado).
 *
 * `perSheet` = máximo sobre rotação de floor(uW/w)·floor(uH/h). `minBreak` é ignorado
 * no cálculo analítico (estimativa conservadora do nº de peças por chapa).
 */
export function homogeneousCandidates(
  remaining: RemainingItem[],
  usableW: number,
  usableH: number,
  _minBreak: number,
  buildTreeForSubset: (item: { w: number; h: number; count: number }) => TreeNode,
): LayoutCandidate[] {
  const sheetArea = usableW * usableH;
  const seen = new Set<string>();
  const candidates: LayoutCandidate[] = [];

  for (const p of remaining) {
    if (p.qty <= 0 || p.w <= 0 || p.h <= 0) continue;
    const key = `${Math.min(p.w, p.h)}x${Math.max(p.w, p.h)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const fitNormal = Math.floor(usableW / p.w) * Math.floor(usableH / p.h);
    const fitRotated = Math.floor(usableW / p.h) * Math.floor(usableH / p.w);
    const perSheet = Math.max(fitNormal, fitRotated);
    if (perSheet < 1) continue;

    // Total disponível dessa dimensão (com rotação) precisa cobrir ao menos 1 chapa.
    const available = availableFor(remaining, p.w, p.h);
    if (available < perSheet) continue;

    const util = Math.min(1, (perSheet * (p.w * p.h)) / sheetArea);
    const w = p.w;
    const h = p.h;
    candidates.push({
      bom: [{ w, h, count: perSheet }],
      util,
      perSheet,
      kind: "homogeneous",
      key: `homo:${key}`,
      buildTree: () => buildTreeForSubset({ w, h, count: perSheet }),
    });
  }

  return candidates;
}

/**
 * Constrói um LayoutCandidate a partir de um layout já otimizado (o "melhor por
 * área" que o fluxo produz hoje). `bom`, `util` e `perSheet` derivam da árvore.
 */
export function bestAreaCandidate(
  bom: BomEntry[],
  util: number,
  tree: TreeNode,
): LayoutCandidate {
  const perSheet = bom.reduce((s, b) => s + b.count, 0);
  const key = "best:" + bom
    .map((b) => `${Math.min(b.w, b.h)}x${Math.max(b.w, b.h)}:${b.count}`)
    .sort()
    .join(",");
  return { bom, util, perSheet, kind: "best-area", buildTree: () => tree, key };
}
