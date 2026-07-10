# Data Model — Maximização de repetição de padrão de corte

Sem persistência nova. Estruturas em memória do módulo puro de seleção e do estado de
UI. Reutiliza `TreeNode`, `PieceItem` do motor.

## Entidade: Candidato de layout (`LayoutCandidate`)

Um plano de corte possível para uma chapa na etapa atual.

| Campo | Tipo | Descrição |
| --- | --- | --- |
| `bom` | `Array<{ w; h; count }>` | composição do padrão (peças e quantidades), extraída da árvore |
| `util` | `number` (0–1) | aproveitamento = área ocupada / área útil da chapa |
| `perSheet` | `number` | total de peças por chapa nesse padrão |
| `kind` | `'best-area' \| 'homogeneous'` | origem do candidato |
| `buildTree` | `() => TreeNode` | materializa a árvore (lazy; só chamado no vencedor) |
| `key` | `string` | assinatura determinística para desempate/identidade (dims ordenadas) |

**Invariantes**:
- `bom` deriva **da árvore** (`extractUsedPiecesWithContext`) — nunca de set-difference (Princípio IV).
- `util` ∈ [0,1]; `perSheet ≥ 1`.
- `buildTree()` produz um plano guilhotina válido (o motor garante).

## Entidade: Avaliação de repetição (`RepetitionEval`)

Resultado de pontuar um candidato contra o inventário restante.

| Campo | Tipo | Descrição |
| --- | --- | --- |
| `candidate` | `LayoutCandidate` | o candidato avaliado |
| `reps` | `number` | chapas adicionais que o padrão cobre = `min` sobre peças de `floor((disponível−count)/count)` |
| `coverage` | `number` | total de chapas cobertas por este padrão = `1 + reps` |
| `passesFloor` | `boolean` | `util ≥ piso` |

**Regra (FR-004)**: só conta uma repetição quando o inventário comporta o **conjunto
completo** do padrão (divisão inteira; repetições parciais não existem).

## Entidade: Configuração de repetição (`RepetitionConfig`)

Estado controlado pelo usuário (UI).

| Campo | Tipo | Default | Descrição |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `false` | liga/desliga a priorização de repetição (FR-001) |
| `utilizationFloor` | `number` (0–1) | `0.85` | piso de aproveitamento (FR-003) |

**Invariante de não-regressão (SC-003)**: `enabled === false` ⇒ caminho de decisão
idêntico ao atual (best-by-area), sem montar candidatos.

## Entidade: Resumo de padrões (`PatternSummary`)

Apresentado ao operador para um plano gerado (FR-008 / SC-007).

| Campo | Tipo | Descrição |
| --- | --- | --- |
| `distinctPatterns` | `number` | quantos padrões de corte distintos o plano usa |
| `perPattern` | `Array<{ key; sheets; util }>` | por padrão: nº de chapas que cobre e aproveitamento |
| `floorReached` | `boolean` | se todos os padrões escolhidos ficaram ≥ piso (FR-006) |

## Resultado da seleção (`SelectionResult`)

Retorno da função central `selectByRepetition`.

| Campo | Tipo | Descrição |
| --- | --- | --- |
| `chosen` | `RepetitionEval` | candidato vencedor |
| `floorReached` | `boolean` | `false` quando nenhum candidato atingiu o piso e houve fallback (FR-006) |

**Ordem de escolha (determinística — FR-007)**:
1. filtrar `passesFloor`;
2. entre os que passam: **maior `reps`** → desempate **maior `util`** → desempate `key` (estável);
3. se vazio: **maior `util`** global, `floorReached = false`.
