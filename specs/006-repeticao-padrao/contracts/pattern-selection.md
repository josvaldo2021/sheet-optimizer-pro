# Contract — Módulo puro `src/lib/pattern-repetition.ts`

Interface interna (não exposta a rede). Funções puras, determinísticas, sem React/DOM.

## `scoreCandidate`

```
scoreCandidate(
  candidate: LayoutCandidate,
  remaining: Array<{ w: number; h: number; qty: number }>,
  utilizationFloor: number,
): RepetitionEval
```

- Calcula `reps` = `min` sobre cada item do `bom` de `floor((disponível − count)/count)`,
  onde `disponível` soma `qty` das peças de mesma dimensão em `remaining` (considerando
  rotação: `(w,h)` ou `(h,w)`). `reps` nunca negativo.
- `coverage = 1 + reps`; `passesFloor = candidate.util ≥ utilizationFloor`.
- **Puro**: não muta `remaining` nem `candidate`.

## `selectByRepetition`

```
selectByRepetition(
  candidates: LayoutCandidate[],
  remaining: Array<{ w; h; qty }>,
  utilizationFloor: number,
): SelectionResult
```

- Pontua todos, aplica a **ordem de escolha determinística** (data-model):
  filtro por piso → maior `reps` → maior `util` → `key`.
- Fallback (nenhum passa o piso): maior `util`, `floorReached = false` (FR-006).
- **Determinístico**: mesmas entradas → mesma escolha (FR-007). Não usa `Math.random`,
  não depende de ordem de inserção além do desempate explícito por `key`.

## `homogeneousCandidates`

```
homogeneousCandidates(
  remaining: Array<{ w; h; qty }>,
  usableW: number,
  usableH: number,
  minBreak: number,
): LayoutCandidate[]
```

- Para cada dimensão distinta com `qty` suficiente, produz um candidato homogêneo
  pontuado **analiticamente**:
  `perSheet = max( floor(usableW/w)·floor(usableH/h), floor(usableW/h)·floor(usableH/w) )`
  (respeitando margens já embutidas em `usableW/H` e `minBreak`);
  `util = perSheet·(w·h)/(usableW·usableH)`; `buildTree` materializa via `optimizeV6`
  do subconjunto **apenas quando o candidato vence**.
- **Puro** quanto ao cálculo do score; `buildTree` é lazy.

## Contrato de integração (em `Index.tsx`, fora do módulo puro)

- Quando `config.enabled === false`: **não** chamar o módulo; usar o caminho atual
  (best-by-area) — garante SC-003.
- Quando `enabled === true`, por etapa do `runAllSheets`:
  1. montar `candidates = [bestAreaCandidate, ...homogeneousCandidates(...)]`;
  2. `res = selectByRepetition(candidates, remaining, floor)`;
  3. materializar `res.chosen.candidate.buildTree()`, deduzir/replicar como hoje;
  4. acumular `PatternSummary` (nº de padrões distintos + cobertura + `floorReached`).

## Invariantes do contrato

1. **Não-regressão**: `enabled=false` ⇒ resultado idêntico ao atual.
2. **Piso é restrição dura**: nenhum padrão `< piso` é escolhido, salvo fallback sinalizado.
3. **Prioridade**: `reps` domina `util` na escolha (FR-011); `util` só desempata.
4. **Fonte da verdade**: `bom`/`util` derivam da árvore (Princípio IV).
5. **Determinismo**: `selectByRepetition` é função pura determinística.

## Verificação

- Testes unitários do módulo puro (sem UI, candidatos injetados): escolha por maior
  `reps`, respeito ao piso, empate `reps` → `util`, fallback quando piso inatingível,
  `reps=0` quando nada repete, determinismo (mesma entrada → mesma saída), pureza
  (entradas não mutadas).
