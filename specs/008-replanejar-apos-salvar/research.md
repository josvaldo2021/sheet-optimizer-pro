# Research — Replanejar o plano automático após salvar layout com repetições

**Feature**: `specs/008-replanejar-apos-salvar` | **Date**: 2026-07-14

Nenhum NEEDS CLARIFICATION restou da spec (a regra de negócio central foi
decidida pelo usuário). Este documento registra as decisões de desenho e as
alternativas avaliadas.

## D1 — Como replanejar: reusar o gerador de plano existente, parametrizado

**Decision**: parametrizar `optimizeAllSheets` (`src/pages/Index.tsx:430`) para
aceitar um inventário explícito (`piecesOverride`) e uma base de chapas a
preservar, em vez de criar um segundo gerador.

**Rationale**: o gerador atual encapsula tudo que define a qualidade do plano —
loop `runAllSheets`, cache por assinatura de inventário, replicação de layout,
`deductions` exatas por `PieceItem.id`, variantes de ordenação (`sortVariants`)
e o critério de seleção de grupo (menos chapas → menos layouts únicos → menor
utilização da última chapa), além da integração com a spec 006 (repetição de
padrão). Reusá-lo garante que o plano replanejado tem exatamente a mesma
qualidade e o mesmo formato de dados (chapas com `deductions`) que o original —
inclusive para o `confirmAutoPlan` subsequente. Constituição III (qualidade) e
V (determinismo, GA semeado) ficam satisfeitas por construção.

**Alternatives considered**:
- *Chamar `optimizeGeneticAsync`/`optimizeV6` direto no `saveLayout`*: duplicaria
  o loop multi-chapa e as `deductions`; divergência inevitável entre os dois
  caminhos de plano. Rejeitado.
- *Extrair `runAllSheets` para um módulo próprio nesta feature*: refactor maior
  e arriscado (closure sobre 8+ valores de estado); a extração está prevista
  como pré-condição da candidata C3-lite (harness da camada de plano) e não
  precisa ser antecipada aqui. Rejeitado por escopo.

## D2 — Onde mora a lógica nova: módulo puro `src/lib/lots/layout-replication.ts`

**Decision**: concentrar BOM, máximo de repetições, dedução ×N, partição
manual/automática e o gatilho de replanejamento em um módulo puro (dados →
dados), com testes vitest dedicados.

**Rationale**: Constituição II (motor puro / UI fina) e V (testes
determinísticos). Precedente direto: `src/lib/lots/lot-selection.ts` (spec 003)
e `src/lib/pattern-repetition.ts` (spec 006). Hoje a construção de BOM está
triplicada (`calcReplication`, `saveLayout`, `runAllSheets`) e a dedução por
dimensão duplicada — a unificação elimina o risco de as três cópias divergirem
(era exatamente uma divergência de premissas que causava o bug).

**Alternatives considered**: manter a lógica inline em `Index.tsx` (intestável
sem DOM; repete a causa-raiz). Rejeitado.

## D3 — Identidade de peça no BOM: dimensão normalizada, insensível à orientação

**Decision**: manter a convenção existente — peças são agregadas por
`min(w,h)×max(w,h)`; a dedução aceita o item do inventário em qualquer
orientação. Labels não participam da identidade do BOM de replicação.

**Rationale**: é a convenção já usada em todos os pontos do fluxo
(`calcReplication`, replicação dentro do `runAllSheets`, `saveLayout`,
devolução de lote). Mudar a identidade (ex.: label+dim) mudaria o
comportamento de repetição visível e está fora do escopo do bug. A spec fixa a
verificação de repetições como comportamento correto (FR-001).

**Alternatives considered**: dedução label-aware como no fallback do
`confirmAutoPlan` (label+dim primeiro, dim depois). Adiado — melhoria de
rastreabilidade ortogonal ao bug; registrada como possível follow-up.

## D4 — Gatilho do replanejamento: qualquer save que deduz inventário com autos pendentes

**Decision**: o descarte + replanejamento dispara em todo `saveLayout` que
deduza peças enquanto existir chapa com `manual !== true` (não confirmada) —
inclusive quando o layout salvo foi desenhado manualmente durante um plano
automático ativo.

**Rationale**: a invalidação não depende da origem do layout salvo, e sim do
fato de o inventário ter mudado sob um plano calculado com o inventário antigo
(edge case explícito na spec). Critério objetivo e barato: `some(c => !c.manual)`.
Nota: isso também elimina a duplicação atual em que a chapa automática sendo
visualizada permanecia na lista além das N cópias salvas — todas as autos saem,
as N cópias `manual: true` entram.

**Alternatives considered**: disparar só quando o layout salvo veio do plano
(exigiria rastrear origem da árvore ativa; frágil e sem benefício). Rejeitado.

## D5 — Estado de grupos de variantes: reset no replanejamento; `selectGroup` preserva manuais

**Decision**: ao replanejar, `optimizationGroups`/`patternSummary` antigos são
descartados e substituídos pelos grupos do novo plano. `selectGroup` passa a
compor `[...chapas manuais atuais, ...grupo.chapas]` em vez de substituir tudo.

**Rationale**: os grupos antigos referenciam o inventário pré-save — mantê-los
seria reintroduzir o bug por outra porta. E sem o ajuste do `selectGroup`,
trocar de variante após o replanejamento apagaria as cópias recém-salvas,
violando FR-005 (preservação de layouts salvos). O ajuste é a correção mínima
coerente; vale também para o fluxo antigo (salvar layout manual e depois trocar
de grupo hoje perde o layout salvo — mesmo defeito latente).

**Alternatives considered**: recalcular todas as variantes preservando-as por
label (custo alto, sem valor para o usuário — os grupos são descartáveis por
definição). Rejeitado.

## D6 — Robustez do N: clamp no `saveLayout`, não só na UI

**Decision**: `saveLayout` recalcula `maxRepetitions(pieces, bom)` e faz
`n = clamp(reps, 1, max)`; se `max === 0`, aborta com erro sem deduzir nada.

**Rationale**: hoje o clamp existe só no `ReplicationInfoBox` (UI) e o botão
"salvar" do `CommandBar` passa `replicationInfo?.count || 1`, que pode estar
obsoleto se o inventário mudou depois do cálculo (ex.: peça removida). FR-002 e
FR-006 exigem a garantia na regra de negócio, não no componente.

**Alternatives considered**: confiar na UI (estado obsoleto possível). Rejeitado.

## Riscos e mitigação

- **Latência**: salvar ×N passa a poder disparar uma otimização completa. Mitigado
  pelo cache de layout por assinatura de inventário (já existente no
  `runAllSheets`) e pelo indicador de progresso reutilizado (US3). Documentado
  na spec como assumption.
- **Regressão de aproveitamento**: nenhum caminho do motor muda; gate =
  `heuristics-benchmark.test.ts` verde.
- **Árvores sem label**: `extractUsedPiecesWithContext` exige labels (armadilha
  nº 1 do CLAUDE.md). Ambos os fluxos de origem produzem árvores rotuladas
  (plano restaura labels de usuário; comandos manuais criam com label); o
  contrato registra a pré-condição.
