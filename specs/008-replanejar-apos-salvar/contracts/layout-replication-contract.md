# Contrato — `src/lib/lots/layout-replication.ts` e fluxo de save ×N

**Feature**: `specs/008-replanejar-apos-salvar` | **Date**: 2026-07-14

Módulo **puro** (Constituição, Artigo II): recebe dados, retorna dados; sem
React, DOM, I/O ou estado. Consumido por `src/pages/Index.tsx`
(`calcReplication`, `saveLayout`) e testado em
`src/test/layout-replication.test.ts`.

## API

```ts
export interface UsedPieceDim { w: number; h: number }        // peça extraída da árvore
export interface BomEntry { w: number; h: number; count: number }

export interface InventoryPiece { id: string; qty: number; w: number; h: number }

export interface DeductionResult<P extends InventoryPiece> {
  pieces: P[];            // cópia; nunca qty < 0
  shortfall: BomEntry[];  // vazio = dedução completa
}

/** Agrega peças de UM layout em BOM por dimensão normalizada (min×max). */
export function buildLayoutBom(used: UsedPieceDim[]): BomEntry[];

/** Máximo de cópias inteiras do BOM que o inventário cobre (0 se alguma linha não cobre). */
export function maxRepetitions(pieces: InventoryPiece[], bom: BomEntry[]): number;

/** Deduz n×BOM do inventário (qualquer orientação). Tudo-ou-nada por linha: o que faltar vai para shortfall. */
export function deductBomTimes<P extends InventoryPiece>(
  pieces: P[], bom: BomEntry[], n: number,
): DeductionResult<P>;

/** Partição estável por manual === true. */
export function partitionByManual<C extends { manual?: boolean }>(
  chapas: C[],
): { manuais: C[]; autos: C[] };

/** True se existe chapa automática não confirmada (gatilho do replanejamento). */
export function needsReplan(chapas: Array<{ manual?: boolean }>): boolean;
```

## Semântica e invariantes

| # | Invariante | FR |
|---|-----------|----|
| C1 | `buildLayoutBom`: linhas agregadas por `min(w,h)×max(w,h)`; Σ`count` = nº de peças de entrada; `count ≥ 1`. Entrada vazia → `[]`. | FR-001 |
| C2 | `maxRepetitions`: `min` sobre linhas de `floor(disponível/count)`, onde disponível soma `qty` de itens que casam em qualquer orientação. BOM vazio → `0`. Nunca `Infinity`/negativo. | FR-001, FR-002 |
| C3 | `deductBomTimes` não muta a entrada; resultado sem `qty < 0`; se `shortfall` vazio, Σ deduzido = `n × Σ count` (conservação exata). | FR-002, FR-006 |
| C4 | `deductBomTimes` com `n ≤ 0` → cópia idêntica, `shortfall` vazio. | — |
| C5 | `partitionByManual` preserva ordem relativa e não muta; `manuais ∪ autos` = entrada. | FR-005 |
| C6 | `needsReplan(chapas) === partitionByManual(chapas).autos.length > 0`. | FR-003, FR-009 |
| C7 | Determinismo: todas as funções são puras — mesmo input, mesmo output (sem `Math.random`, sem `Date`). | FR-008 |

## Contrato de comportamento do fluxo de save (orquestração em `Index.tsx`)

Pré-condição: árvore ativa com peças **rotuladas** (extração via
`extractUsedPiecesWithContext`; árvores do plano têm labels restaurados, árvores
manuais nascem rotuladas — armadilha nº 1 do CLAUDE.md).

| # | Comportamento | FR |
|---|---------------|----|
| S1 | `n` efetivo = `clamp(reps, 1, maxRepetitions(inventário atual, bom))`; `maxRepetitions = 0` → erro ao usuário, **nenhum efeito** (inventário, chapas e grupos intactos). | FR-002 |
| S2 | `shortfall` não vazio → erro, nenhum efeito (dedução é atômica do ponto de vista do estado). | FR-002, FR-006 |
| S3 | Save com `needsReplan` → todas as chapas `!manual` e os `optimizationGroups`/`patternSummary` antigos são descartados no mesmo commit de estado que insere as N cópias. | FR-003 |
| S4 | Inventário restante não vazio → replanejamento automático com o gerador existente (mesmas configurações da sessão), chapas resultantes **anexadas** após manuais+cópias; `optimizationGroups` = grupos novos. | FR-004 |
| S5 | Inventário restante vazio → sem replanejamento; lista final = manuais + cópias. | FR-004 (edge) |
| S6 | Chapas `manual === true` e lotes: bit a bit inalterados pelo fluxo. `selectGroup` compõe `[...manuais, ...grupo.chapas]` (nunca descarta manuais). | FR-005 |
| S7 | Save sem chapas automáticas presentes → comportamento legado (deduz, salva, reseta árvore; sem replanejamento). | FR-009 |
| S8 | Mensagem final informa: nº de cópias salvas, ocorrência de replanejamento, nº de chapas do novo plano, peças restantes. Durante o replanejamento, indicador de progresso existente ativo. | FR-007 |
| S9 | Fluxo completo determinístico dado o mesmo estado inicial (GA semeado — spec 007). | FR-008 |

## Emenda A1 (2026-07-14) — dedução na confirmação do lote

Salvar ×N não deduz o inventário: cria cópias **pendentes**
(`{ manual: false, saved: true, selected: true, deductions }`) que apenas
reservam inventário até o lote ser confirmado (`confirmAutoPlan` →
`applyDeductions`, caminho preciso por id). API adicional do módulo:

```ts
export interface PendingChapa { manual?: boolean; saved?: boolean; deductions?: Array<{id: string; qty: number}> }

/** Cópias salvas aguardando lote (reservam sem deduzir). */
export function pendingSavedChapas<C extends PendingChapa>(chapas: C[]): C[];
/** Inventário efetivo = pieces − reservas pendentes (satura em 0; não muta). */
export function effectiveInventory<P extends InventoryPiece>(pieces: P[], chapas: PendingChapa[]): P[];
/** Preservadas (manual OU saved) vs autos descartáveis. */
export function partitionByPreserved<C extends PendingChapa>(chapas: C[]): { preserved: C[]; autos: C[] };
/** Deduções id-a-id para n cópias, consumindo de cópia do inventário; Σ por id ≤ qty. */
export function allocateDeductions<P extends InventoryPiece>(pieces: P[], bom: BomEntry[], n: number):
  { perCopy: Array<Array<{id: string; qty: number}>>; remaining: P[]; shortfall: BomEntry[] };
```

Regras revisadas: `needsReplan` ignora chapas `saved` (não são descartáveis);
S1/S2 avaliam contra `effectiveInventory`; S3/S6 preservam `manual || saved`;
S4 replaneja com `allocateDeductions(...).remaining`; o inventário exibido só
muda na confirmação do lote (que também limpa `selected` das confirmadas).
`deductBomTimes`/`partitionByManual` permanecem no módulo (contrato original).

## Testes exigidos (`src/test/layout-replication.test.ts`)

1. C1–C7 unitários (incluindo rotação: item `600×400` cobre BOM `400×600`).
2. Conservação (SC-001): cenário plano→save×N→dedução, conferindo
   Σ salvas + inventário restante = inventário inicial, sem negativos.
3. Casos de borda da spec: N = máximo (inventário zera), N < máximo (sobras
   voltam ao replanejamento — verificado no nível da dedução), BOM de layout com
   peça inexistente no inventário (`maxRepetitions = 0`).
4. Gates gerais da feature: `npm test` verde (benchmark e determinismo do GA
   intactos) e `npx tsc -p tsconfig.app.json --noEmit` limpo.
