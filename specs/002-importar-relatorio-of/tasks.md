# Tasks: Importar Relatório OF (.rpt)

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)

Ordem sugerida; cada tarefa é pequena e verificável.

## T001 — Parser puro `of-report.ts` [P1, US1/US2]
Criar `src/lib/import/of-report.ts` com:
- `isOfReport(wb): boolean` — detecta a aba `of_geral_parcial` (regex, case-insensitive).
- `parseOfReport(wb): { items: PieceItem[]; imported: number; skipped: number }`
  — lê por posição fixa B/M/O/R a partir da linha 9; pula linhas com B vazio; fim
  natural na última linha com B (FR-002, FR-003, FR-004); ignora linhas incompletas
  contando em `skipped` (FR-008); rótulo = pedido (FR-005); valores em mm (FR-007).
**Done**: funções exportadas e tipadas.

## T002 — Teste com fixtures reais [P1, SC-001..SC-003]
Criar `src/test/of-report-import.test.ts`:
- `isOfReport` verdadeiro para os dois `.xls` de `parts/`.
- lote 1: 49 peças, soma qtd = 238, primeiro `01966/26`, último `01965/26`.
- lote 2: 13 peças, soma qtd = 35.
- linha em branco intermediária não trunca (último rótulo presente) (SC-002).
**Done**: `npm test` verde.

## T003 — Fiação no `handleExcel` [P1/P2, US1/US3, FR-001/FR-006/FR-009/FR-010]
Em `src/pages/Index.tsx`, após `XLSX.read`, se `isOfReport(wb)` → usar
`parseOfReport` e `setPieces`; senão manter o fluxo atual. Mensagem de status com
`imported` (e `skipped` se houver). Caso nada reconhecido/sem peças, avisar.
**Done**: import OF funciona na UI sem quebrar o formato antigo.

## T004 — Verificação final
`npx tsc --noEmit` limpo e `npm test` verde. Conferir critérios SC-001..SC-005.
