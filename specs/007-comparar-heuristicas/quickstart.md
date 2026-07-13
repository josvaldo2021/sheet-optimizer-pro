# Quickstart — Validação da Feature 007

## Pré-requisitos

```bash
npm install            # dependências JS (uma vez)
npm test               # suíte atual verde antes de começar
```

## Fase A — Análise e baseline

1. **Relatório comparativo** (US1): abrir
   `specs/007-comparar-heuristicas/relatorio-comparativo.md` e conferir que as 15
   técnicas de [heuristicas.md](./heuristicas.md) têm classificação + justificativa
   (prévia em [research.md](./research.md), Decisão 3).
2. **Priorização** (US2): abrir `specs/007-comparar-heuristicas/priorizacao.md` —
   ≥ 3 oportunidades ranqueadas (C1..Cn) com impacto/compatibilidade/esforço e
   descartes justificados.
3. **Baseline** (US3, pré-condição):

   ```bash
   npx vitest run src/test/heuristics-benchmark.test.ts
   ```

   Esperado: suíte passa; `src/test/fixtures/benchmark-baseline.json` contém ≥ 5
   cenários com aproveitamento/chapas registrados (formato no
   [contrato](./contracts/benchmark-contract.md)).

## Fase B — Evolução medida

Para cada candidato implementado (C1, C2, ...):

```bash
npx tsc --noEmit                                    # tipos limpos
npm test                                            # suíte inteira, inclui benchmark e paridade TS↔WASM
npx vitest run src/test/heuristics-benchmark.test.ts  # gate de aproveitamento
```

Esperado por candidato:

- **C1 (PRNG semeado)**: teste novo do GA — mesmo input duas vezes → planos idênticos.
- **C2/C3**: nenhum cenário do baseline piora; ≥ 1 cenário melhora ≥ 0,5 p.p. ou
  −1 chapa. Reprovado → reverter e registrar em `priorizacao.md`.
- Rust alterado? `cd wasm-engine && cargo test` + rebuild WASM + teste de paridade.

## Validação final (Definition of Done) — resultado em 2026-07-13

- [x] 15/15 técnicas classificadas (SC-001) — `relatorio-comparativo.md`
- [x] ≥ 3 oportunidades ranqueadas (SC-002) — 4 em `priorizacao.md` (C1..C4)
- [x] Baseline com ≥ 5 cenários (SC-003) — `benchmark-baseline.json`, versão `baseline-2026-07`
- [x] `npm test` verde — nenhum cenário regrediu (SC-004) — 86 testes, 54s
- [ ] ≥ 1 cenário melhorou mensuravelmente (SC-005) — **NÃO atingido nesta rodada**:
  o único candidato de aproveitamento (C2) reprovou o gate (empate em todos os
  cenários, `optimizeV6` e GA) e foi revertido conforme o contrato §3; o ganho
  entregue foi de **reprodutibilidade** (C1: GA determinístico, exceção prevista no
  contrato). Reprovação com medição registrada é entregável válido (FR-007);
  a busca por ganho de aproveitamento continua em C3/C4 (specs futuras).
- [x] Duas execuções → planos idênticos em 100% dos cenários (SC-006) — harness +
  `ga-determinism.test.ts`
- [x] Tipos limpos nos arquivos da feature — via `npx tsc -p tsconfig.app.json --noEmit`
  (o `tsc --noEmit` raiz é no-op; os 10 erros restantes são pré-existentes de UI,
  registrados em `priorizacao.md` › Higiene)
