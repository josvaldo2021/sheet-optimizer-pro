# Implementation Plan: Importar Relatório OF (.rpt)

**Branch**: `main` (trunk-based) | **Date**: 2026-06-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-importar-relatorio-of/spec.md`

## Summary

Adicionar um leitor dedicado para o relatório OF (aba `of_geral_parcial.rpt`) que
extrai peças por **posição fixa de coluna** (B=pedido, M=qtd, O=altura, R=largura),
da linha 9 até a última linha com dado na coluna B, pulando linhas em branco. A
importação atual detecta automaticamente o layout e usa o novo leitor; arquivos no
formato antigo continuam pelo caminho atual (por nome de cabeçalho).

## Technical Context

**Language/Version**: TypeScript 5.x (React 18 + Vite).

**Primary Dependencies**: `xlsx` (SheetJS) — já usada em `handleExcel`.

**Storage**: N/A.

**Testing**: vitest; fixtures reais `parts/lote 1 medida de chapa.xls` e
`parts/lote 2 medida de chapa.xls`.

**Target Platform**: navegador (e Node/vitest para os testes do parser).

**Project Type**: SPA web; o parser é uma função pura e testável.

**Constraints**: não regredir a importação existente; parser puro (sem UI/DOM),
no espírito do Artigo II da constituição.

## Constitution Check

*GATE: passar antes da implementação.*

| Princípio | Situação | Observação |
| --------- | -------- | ---------- |
| II. Pureza/agnóstico de UI | ✅ PASS | Parser em `src/lib/import/of-report.ts` recebe um `WorkBook` e retorna dados; sem React/DOM. A fiação fica no handler de UI. |
| IV. Fonte da verdade | ✅ N/A direto | Não mexe na árvore de corte; produz `PieceItem[]` de entrada. |
| V. Determinismo e testes | ✅ PASS | Parser determinístico; teste com fixtures reais cobre contagem/soma/rótulos/linhas em branco. |
| I, III, VI | ✅ N/A | Feature de importação, não toca no motor de corte. |

**Gate**: PASS, sem violações.

## Project Structure

```text
specs/002-importar-relatorio-of/
├── spec.md, plan.md, research.md, data-model.md, quickstart.md
├── contracts/of-report-parser.md
└── checklists/requirements.md

src/lib/import/of-report.ts        # NOVO — detector + parser puro
src/pages/Index.tsx (handleExcel)  # fiação: detecta e despacha
src/test/of-report-import.test.ts  # NOVO — teste com fixtures reais
```

**Structure Decision**: novo módulo `src/lib/import/of-report.ts` (puro), plugado
no início de `handleExcel`. Se `isOfReport(wb)` for verdadeiro, usa
`parseOfReport(wb)`; senão, mantém o fluxo atual por cabeçalho. Mínima alteração na
UI, lógica testável isolada.

## Complexity Tracking

Sem violações de constituição. Detecção por nome de aba (`of_geral_parcial`) é o
sinal confiável escolhido; estrutura (B7≈"OF" + dado em B9) fica como reforço
opcional, sem ampliar escopo.
