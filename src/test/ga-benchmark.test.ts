/**
 * GA Benchmark — investiga por que pop/gen baixos (10) às vezes batem altos (50).
 *
 * NÃO é teste de regressão. É um experimento controlado e lento (minutos),
 * por isso fica DESLIGADO por padrão (não roda no `npm test`).
 * Para rodar:
 *   GA_BENCH=1 npx vitest run ga-benchmark          (bash)
 *   $env:GA_BENCH=1; npx vitest run ga-benchmark    (PowerShell)
 * Veja o relatório nos console.log ao final.
 *
 * Estratégia:
 *  - Injeta um PRNG com semente (mulberry32) sobre Math.random, para que cada
 *    par (pop/gen=10) vs (pop/gen=50) seja comparável e reprodutível.
 *  - Mede DOIS números por execução:
 *      realUtil      = calcPlacedArea(tree)/areaChapa*100  → o objetivo REAL
 *                      (exatamente o que runAllSheets usa: aproveitamento da chapa retornada)
 *      internalFit   = último bestUtil do onProgress (= bestFitness*100, o PROXY otimizado)
 *  - Experimento A: 1 chamada do GA por execução → isola variância + desalinhamento.
 *  - Experimento B: loop multi-chapa completo → impacto no total de chapas (visível ao usuário).
 */

import { describe, it } from "vitest";
import { optimizeGeneticAsync, calcPlacedArea } from "../lib/cnc-engine";

// ── PRNG semeável (mulberry32) ───────────────────────────────────────────────
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ORIG_RANDOM = Math.random;
const setSeed = (s: number) => {
  Math.random = mulberry32(s);
};
const restoreRandom = () => {
  Math.random = ORIG_RANDOM;
};

// ── Chapa e inventário de teste (≈ 2 chapas) ─────────────────────────────────
const W = 2750;
const H = 1830;
const SHEET_AREA = W * H;

interface Item {
  id: string;
  qty: number;
  w: number;
  h: number;
}
const ITEMS: Item[] = [
  { id: "A", qty: 6, w: 716, h: 600 },
  { id: "B", qty: 8, w: 600, h: 500 },
  { id: "C", qty: 10, w: 400, h: 380 },
  { id: "D", qty: 12, w: 250, h: 200 },
  { id: "E", qty: 4, w: 900, h: 300 },
];

function expand(items: Item[]) {
  const inv: { w: number; h: number; area: number; label: string }[] = [];
  items.forEach((p) => {
    for (let i = 0; i < p.qty; i++) inv.push({ w: p.w, h: p.h, area: p.w * p.h, label: p.id });
  });
  return inv;
}

// Uma chamada do GA → mede objetivo real e fitness interno.
async function runOnce(
  inv: { w: number; h: number; area: number; label?: string }[],
  pop: number,
  gen: number,
): Promise<{ realUtil: number; internalFit: number }> {
  let lastBestUtil = 0;
  const tree = await optimizeGeneticAsync(
    inv,
    W,
    H,
    0,
    (p) => {
      if (typeof p.bestUtil === "number") lastBestUtil = p.bestUtil;
    },
    undefined,
    pop,
    gen,
  );
  const realUtil = (calcPlacedArea(tree) / SHEET_AREA) * 100;
  return { realUtil, internalFit: lastBestUtil };
}

// Loop multi-chapa FIEL ao runAllSheets (Index.tsx): cada instância recebe um uid
// único e a dedução é por uid (identidade), não por dimensão. Isso evita que a
// inflação de dimensão "fantasma" (ex.: 250x200 vira 250x300) quebre a dedução —
// que é o que aconteceria com matching por dimensão (como no optimization.test.ts).
// Retorna o total de chapas e quantas peças saíram com dimensão fantasma (não existe
// no inventário), para medir se a inflação cresce com mais busca.
async function totalSheets(
  items: Item[],
  pop: number,
  gen: number,
): Promise<{ sheets: number; phantom: number }> {
  let remaining = items.map((p) => ({ ...p, qty: p.qty }));
  let sheetCount = 0;
  let phantomTotal = 0;
  const maxSheets = 100;
  const dimKey = (w: number, h: number) => `${Math.min(w, h)}x${Math.max(w, h)}`;
  const validDims = new Set(items.map((p) => dimKey(p.w, p.h)));

  while (remaining.length > 0 && sheetCount < maxSheets) {
    sheetCount++;
    // uid único por instância (espelha runAllSheets).
    const inv: { w: number; h: number; area: number; label: string }[] = [];
    const uidToItem = new Map<string, (typeof remaining)[number]>();
    let uidSeq = 0;
    remaining.forEach((p) => {
      for (let i = 0; i < p.qty; i++) {
        const uid = `__${uidSeq++}`;
        inv.push({ w: p.w, h: p.h, area: p.w * p.h, label: uid });
        uidToItem.set(uid, p);
      }
    });
    if (inv.length === 0) break;

    const result = await optimizeGeneticAsync(inv, W, H, 0, undefined, undefined, pop, gen);

    // Extrai folhas com label (uid) e dimensão.
    const used: { w: number; h: number; label?: string }[] = [];
    const traverse = (n: any, parents: any[], mult: number) => {
      const totalMult = mult * n.multi;
      const yA = parents.find((p) => p.tipo === "Y");
      const zA = parents.find((p) => p.tipo === "Z");
      const wA = parents.find((p) => p.tipo === "W");
      let pw = 0, ph = 0, leaf = false;
      if (n.tipo === "Z" && n.filhos.length === 0) { pw = n.valor; ph = yA?.valor || 0; leaf = true; }
      else if (n.tipo === "W" && n.filhos.length === 0) { pw = zA?.valor || 0; ph = n.valor; leaf = true; }
      else if (n.tipo === "Q") { pw = n.valor; ph = wA?.valor || 0; leaf = true; }
      if (leaf && pw > 0 && ph > 0) {
        for (let m = 0; m < totalMult; m++) used.push({ w: pw, h: ph, label: n.label });
      }
      n.filhos.forEach((f: any) => traverse(f, [...parents, n], totalMult));
    };
    traverse(result, [], 1);
    if (used.length === 0) break;

    // Conta peças fantasma (dimensão inexistente no inventário).
    used.forEach((u) => { if (!validDims.has(dimKey(u.w, u.h))) phantomTotal++; });

    // Dedução por uid (identidade) — fiel ao runAllSheets.
    used.forEach((u) => {
      if (!u.label) return;
      const item = uidToItem.get(u.label);
      if (item && item.qty > 0) item.qty--;
    });
    remaining = remaining.filter((p) => p.qty > 0);
  }
  return { sheets: sheetCount, phantom: phantomTotal };
}

const fmt = (n: number) => n.toFixed(2).padStart(6);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

describe.runIf(!!process.env.GA_BENCH)("GA Benchmark — pop/gen 10 vs 50", () => {
  it("Experimento A: 1 chamada — objetivo real (1ª chapa) vs fitness interno", async () => {
    const SEEDS = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233];
    const inv = expand(ITEMS);

    const real10: number[] = [];
    const real50: number[] = [];
    let winsBy10 = 0; // realUtil(10) > realUtil(50)  → 10 bateu 50
    let misaligned = 0; // fit(50) > fit(10) MAS real(50) < real(10) → prova do desalinhamento

    console.log("\n=== EXPERIMENTO A: 1 chamada do GA (objetivo = aproveitamento da 1ª chapa) ===");
    console.log("seed |   real@10  fit@10 |   real@50  fit@50 | Δreal(50-10)  Δfit(50-10)");

    for (const seed of SEEDS) {
      setSeed(seed);
      const r10 = await runOnce(inv, 10, 10);
      setSeed(seed);
      const r50 = await runOnce(inv, 50, 50);

      real10.push(r10.realUtil);
      real50.push(r50.realUtil);
      const dReal = r50.realUtil - r10.realUtil;
      const dFit = r50.internalFit - r10.internalFit;
      if (r10.realUtil > r50.realUtil + 1e-9) winsBy10++;
      if (r50.internalFit > r10.internalFit + 1e-9 && r50.realUtil < r10.realUtil - 1e-9) misaligned++;

      const flag = dReal < -1e-9 ? "  <-- 50 PIOR no real" : "";
      console.log(
        `${String(seed).padStart(4)} | ${fmt(r10.realUtil)}  ${fmt(r10.internalFit)} | ${fmt(
          r50.realUtil,
        )}  ${fmt(r50.internalFit)} | ${fmt(dReal)}      ${fmt(dFit)}${flag}`,
      );
    }
    restoreRandom();

    console.log("\n--- Resumo A ---");
    console.log(`real@10  média=${fmt(mean(real10))}  mediana=${fmt(median(real10))}  max=${fmt(Math.max(...real10))}`);
    console.log(`real@50  média=${fmt(mean(real50))}  mediana=${fmt(median(real50))}  max=${fmt(Math.max(...real50))}`);
    console.log(`Execuções em que pop=10 superou pop=50 no objetivo real: ${winsBy10}/${SEEDS.length}`);
    console.log(`Execuções com DESALINHAMENTO (fit 50 maior, real 50 menor): ${misaligned}/${SEEDS.length}`);
    console.log(
      "Interpretação: winsBy10>0 confirma o fenômeno; misaligned>0 prova que o fitness é um proxy desalinhado.",
    );
  }, 600000);

  it("Experimento B: loop multi-chapa FIEL (dedução por uid) — total de chapas + fantasmas", async () => {
    const SEEDS = [1, 2, 3, 7, 11, 17];
    const sheets10: number[] = [];
    const sheets50: number[] = [];
    let winsBy10 = 0;
    let phantom10 = 0;
    let phantom50 = 0;

    console.log("\n=== EXPERIMENTO B: loop multi-chapa FIEL ao runAllSheets (dedução por uid) ===");
    console.log("seed | chapas@10 (fant) | chapas@50 (fant) | Δ(50-10)");

    for (const seed of SEEDS) {
      setSeed(seed);
      const r10 = await totalSheets(ITEMS, 10, 10);
      setSeed(seed);
      const r50 = await totalSheets(ITEMS, 50, 50);
      sheets10.push(r10.sheets);
      sheets50.push(r50.sheets);
      phantom10 += r10.phantom;
      phantom50 += r50.phantom;
      if (r10.sheets < r50.sheets) winsBy10++;
      const flag = r50.sheets > r10.sheets ? "  <-- 50 usou MAIS chapas" : "";
      console.log(
        `${String(seed).padStart(4)} | ${String(r10.sheets).padStart(6)} (${String(r10.phantom).padStart(3)})    | ${String(r50.sheets).padStart(6)} (${String(r50.phantom).padStart(3)})    | ${String(r50.sheets - r10.sheets).padStart(7)}${flag}`,
      );
    }
    restoreRandom();

    console.log("\n--- Resumo B (fiel) ---");
    console.log(`chapas@10  média=${fmt(mean(sheets10))}  mediana=${fmt(median(sheets10))}  min=${Math.min(...sheets10)}  fantasmas=${phantom10}`);
    console.log(`chapas@50  média=${fmt(mean(sheets50))}  mediana=${fmt(median(sheets50))}  min=${Math.min(...sheets50)}  fantasmas=${phantom50}`);
    console.log(`Execuções em que pop=10 usou MENOS chapas que pop=50: ${winsBy10}/${SEEDS.length}`);
    console.log("Se com dedução por uid pop=50 ≤ pop=10, o 'encalhe' do benchmark antigo era artefato de fantasma.");
  }, 600000);
});
