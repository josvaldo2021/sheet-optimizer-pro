// Harness de benchmark — spec 007 (comparar heurísticas e evoluir o otimizador)
//
// Contrato: specs/007-comparar-heuristicas/contracts/benchmark-contract.md
// - Mede o caminho DETERMINÍSTICO do motor (optimizeV6) em loop multi-chapa.
// - Métricas derivadas exclusivamente da árvore (Princípio IV): área posicionada
//   via calcPlacedArea, peças via percurso de folhas ignorando label.
// - Falha se qualquer cenário regredir vs baseline (aproveitamento, chapas ou
//   peças alocadas) e se duas execuções não produzirem árvores idênticas.
//
// Regravação do baseline (ato explícito, contrato §3.5):
//   RECORD_BASELINE=1 npx vitest run src/test/heuristics-benchmark.test.ts
//   (PowerShell: $env:RECORD_BASELINE='1'; npx vitest run ...)

import { describe, it, expect } from "vitest";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { optimizeV6, calcPlacedArea } from "../lib/cnc-engine";
import type { TreeNode, Piece } from "../lib/engine/types";
import baselineFile from "./fixtures/benchmark-baseline.json";

// ─── Tipos do arquivo de baseline (data-model.md da spec 007) ───

interface CenarioBenchmark {
  nome: string;
  perfil: string;
  chapa: { w: number; h: number; ml: number; mr: number; mt: number; mb: number; minBreak: number };
  permiteRotacao: boolean;
  pecas: Array<{ w: number; h: number; qty: number; label?: string }>;
}

interface Medicao {
  cenario: string;
  aproveitamento: number;
  chapas: number;
  pecasAlocadas: number;
}

const TOLERANCIA_APROVEITAMENTO = 0.005; // p.p. — só arredondamento (contrato §2)
const MAX_CHAPAS = 100;

// ─── Extração de peças rotuladas da árvore (espelho de Index.tsx) ───
// O harness rotula cada instância do inventário com um uid único — o mesmo que
// o runAllSheets de produção faz — e extrai as peças usadas da árvore pelos
// labels. Dedução exata, sem ambiguidade de grupos (armadilhas nº 1 e 3):
// v6Result.remaining sub-reporta sobras quando a variante vencedora é
// agrupada, então a árvore é a única fonte confiável.

function extractLabeledLeaves(tree: TreeNode): string[] {
  const labels: string[] = [];
  const traverse = (n: TreeNode, parents: TreeNode[], parentMulti: number) => {
    const totalMulti = parentMulti * n.multi;
    const isLeaf =
      (n.tipo === "Y" && n.filhos.length === 0) ||
      (n.tipo === "Z" && n.filhos.length === 0) ||
      (n.tipo === "W" && n.filhos.length === 0) ||
      (n.tipo === "Q" && n.filhos.length === 0) ||
      n.tipo === "R";
    if (isLeaf && n.label) {
      for (let m = 0; m < totalMulti; m++) labels.push(n.label);
    }
    n.filhos.forEach((f) => traverse(f, [...parents, n], totalMulti));
  };
  traverse(tree, [], 1);
  return labels;
}

// Remove ids (gerados com Math.random em tree-utils) para comparar planos.
function normalizeTree(n: TreeNode): unknown {
  return {
    tipo: n.tipo,
    valor: n.valor,
    multi: n.multi,
    label: n.label ?? null,
    transposed: n.transposed ?? null,
    filhos: n.filhos.map(normalizeTree),
  };
}

// ─── Loop multi-chapa determinístico (equivalente ao runAllSheets, sem GA) ───

function runPlanoMultiChapa(cenario: CenarioBenchmark): {
  medicao: Medicao;
  planos: unknown[];
} {
  const { chapa } = cenario;
  const usableW = chapa.w - chapa.ml - chapa.mr;
  const usableH = chapa.h - chapa.mt - chapa.mb;
  const areaUtil = usableW * usableH;

  // Inventário expandido: uma entrada por instância, com uid único (como o
  // runAllSheets de produção) para dedução exata via árvore.
  let inv: Piece[] = [];
  let uidSeq = 0;
  cenario.pecas.forEach((p) => {
    for (let i = 0; i < p.qty; i++) {
      inv.push({ w: p.w, h: p.h, area: p.w * p.h, label: `__${uidSeq++}` });
    }
  });
  const totalPecas = inv.length;

  const planos: unknown[] = [];
  let areaPosicionada = 0;
  let chapas = 0;
  let pecasAlocadas = 0;

  while (inv.length > 0 && chapas < MAX_CHAPAS) {
    const { tree } = optimizeV6(inv, usableW, usableH, chapa.minBreak);

    // Dedução exata via árvore: cada uid extraído consome sua instância.
    const usados = extractLabeledLeaves(tree);
    if (usados.length === 0) {
      throw new Error(
        `Cenário ${cenario.nome}: chapa ${chapas + 1} não alocou nenhuma peça com ${inv.length} restantes`,
      );
    }
    const usadosSet = new Set(usados);
    if (usadosSet.size !== usados.length) {
      throw new Error(`Cenário ${cenario.nome}: uid duplicado na extração da árvore`);
    }
    const invDepois = inv.filter((p) => !usadosSet.has(p.label!));
    if (inv.length - invDepois.length !== usados.length) {
      throw new Error(
        `Cenário ${cenario.nome}: uids extraídos (${usados.length}) não batem com dedução do inventário`,
      );
    }

    inv = invDepois;
    chapas++;
    pecasAlocadas += usados.length;
    areaPosicionada += calcPlacedArea(tree);
    planos.push(normalizeTree(tree));
  }

  if (inv.length > 0) {
    throw new Error(`Cenário ${cenario.nome}: estourou MAX_CHAPAS com ${inv.length} peças restantes`);
  }
  if (pecasAlocadas !== totalPecas) {
    throw new Error(
      `Cenário ${cenario.nome}: alocadas ${pecasAlocadas} ≠ inventário ${totalPecas} (contagem via árvore)`,
    );
  }

  const aproveitamento = Math.round((areaPosicionada / (chapas * areaUtil)) * 10000) / 100;
  return { medicao: { cenario: cenario.nome, aproveitamento, chapas, pecasAlocadas }, planos };
}

// ─── Suíte ───

const cenarios = baselineFile.cenarios as CenarioBenchmark[];
const baseline = baselineFile.baseline as Medicao[];
const gravando = process.env.RECORD_BASELINE === "1";

describe("Benchmark de aproveitamento — spec 007 (caminho determinístico)", () => {
  const medicoes: Medicao[] = [];

  cenarios.forEach((cenario) => {
    it(`cenário ${cenario.nome} (${cenario.perfil}): sem regressão vs baseline e determinístico`, () => {
      const exec1 = runPlanoMultiChapa(cenario);
      const exec2 = runPlanoMultiChapa(cenario);

      // Determinismo (SC-006): mesmo input → planos idênticos.
      expect(exec2.planos).toEqual(exec1.planos);

      medicoes.push(exec1.medicao);

      if (gravando) return; // modo gravação: só coleta

      const base = baseline.find((b) => b.cenario === cenario.nome);
      expect(base, `baseline ausente para ${cenario.nome} — grave com RECORD_BASELINE=1`).toBeDefined();

      // Contrato §2: qualquer regressão falha a build.
      expect(exec1.medicao.aproveitamento).toBeGreaterThanOrEqual(
        base!.aproveitamento - TOLERANCIA_APROVEITAMENTO,
      );
      expect(exec1.medicao.chapas).toBeLessThanOrEqual(base!.chapas);
      expect(exec1.medicao.pecasAlocadas).toBeGreaterThanOrEqual(base!.pecasAlocadas);
    });
  });

  it("suíte cobre os 5 perfis exigidos (FR-004/SC-003)", () => {
    const perfis = new Set(cenarios.map((c) => c.perfil));
    ["pecas-pequenas", "pecas-grandes", "misto", "alto-volume", "restricoes-agressivas"].forEach(
      (p) => expect(perfis, `perfil ausente: ${p}`).toContain(p),
    );
    expect(cenarios.length).toBeGreaterThanOrEqual(5);
  });

  it(gravando ? "grava o baseline (RECORD_BASELINE=1)" : "baseline registrado e completo", () => {
    if (gravando) {
      const path = resolve(process.cwd(), "src/test/fixtures/benchmark-baseline.json");
      const conteudo = {
        ...baselineFile,
        versao: baselineFile.versao || "baseline-2026-07",
        geradoEm: new Date().toISOString().slice(0, 10),
        baseline: medicoes,
      };
      writeFileSync(path, JSON.stringify(conteudo, null, 2) + "\n", "utf8");
      console.log("[BENCHMARK] baseline gravado:", JSON.stringify(medicoes, null, 2));
      return;
    }
    cenarios.forEach((c) =>
      expect(
        baseline.find((b) => b.cenario === c.nome),
        `baseline ausente para ${c.nome}`,
      ).toBeDefined(),
    );
  });
});
