# Research — Maximização de repetição de padrão de corte

## Fatos verificados no código

- `runAllSheets` (`src/pages/Index.tsx:423`) itera enquanto há inventário: a cada
  passo monta `inv` (uma instância por peça, com `label` uid único), consulta um
  **cache por "forma" do inventário** (`buildInvKey`) e, em miss, chama
  `optimizeGeneticAsync(...)` → **um** `TreeNode` (melhor por área).
- Depois monta o **BOM** do layout (dimensões → count), calcula
  `maxReplications = min sobre peças de floor((disponível − usado)/usado)`
  (linhas 546‑558) e **replica** o mesmo padrão, deduzindo o inventário.
- `optimizeGeneticAsync` retorna `Promise<TreeNode>` (um só) e usa `Math.random()`
  internamente (`randomIndividual`, mutação) → **não é bit-determinístico**.
- Extração de peças de um layout: `extractUsedPiecesWithContext` (peças rotuladas)
  e `calcPlacedArea` já existem e são a fonte da verdade (árvore), não set-difference.
- Já existe estado/exibição de repetição: `replicationInfo` (`{count, bom}`) e o
  cálculo standalone em `Index.tsx:999‑1026` ("Layout pode ser repetido N×").

**Conclusão**: a mecânica de "quantas vezes um padrão repete" **já existe**. Falta
(a) **gerar mais de um candidato** e (b) **escolher pelo que mais repete** sob um
**piso de aproveitamento**, em vez de sempre pegar o melhor por área.

## Decisão 1 — Onde fica a lógica

**Decisão**: módulo **puro** novo `src/lib/pattern-repetition.ts`, fora de
`src/lib/engine/**`. `Index.tsx` monta candidatos e delega a decisão.

**Racional**: é orquestração de inventário multi-chapa (não corte guilhotina), então
não pertence ao motor. Como função pura, é testável em vitest sem UI e mantém
`engine/` intocado (Princípio II) e o WASM sem alteração (Princípio VI).

**Alternativas**: pôr a lógica dentro de `optimizeV6`/GA (rejeitado — o motor é de
chapa única e não conhece o inventário total, Princípio II); pôr direto em `Index.tsx`
(rejeitado — não testável isoladamente, mistura UI e decisão).

## Decisão 2 — Fonte dos candidatos (Fase A)

**Decisão**: conjunto de candidatos por etapa =
1. **Candidato "melhor por área"**: o layout que o fluxo já produz hoje (GA). Garante
   que, se nada repetir bem, a escolha recai no comportamento atual.
2. **Candidatos homogêneos / de baixa variedade**: para cada dimensão distinta
   relevante no inventário restante, um padrão feito **só daquela peça**, pontuado
   **analiticamente** por ladrilhamento:
   `perSheet = max sobre rotação de floor(usableW/w)·floor(usableH/h)` (respeitando
   margens/corte mínimo); `util = perSheet·área/áreaChapa`; `reps = floor(qty/perSheet)`.
   A **árvore** desse candidato só é materializada (via `optimizeV6` daquele subconjunto)
   **se ele for o vencedor** — evita custo.

**Racional**: cobre o ganho principal (padrões homogêneos repetem muito por
construção) com custo mínimo e **determinístico**. O candidato do GA entra "de graça"
(já é calculado). 

**Alternativas consideradas**:
- **Top-K do motor** (expor as elites da população do GA ou top-K do torneio do
  `optimizeV6`): dá candidatos **mistos** de alta repetição, mas exige alterar o
  retorno do motor e a ponte WASM (**quebra a promessa "Fase A sem tocar no WASM"** e
  agrega risco de paridade). **Adiado para Fase B** (enhancement), não bloqueia US1.
- Gerar candidatos por múltiplas execuções do GA com sementes diferentes: caro e não
  determinístico. Rejeitado.

## Decisão 3 — Função de escolha (score)

**Decisão**: dada a lista de candidatos com `util` e `reps`:
1. **Filtrar** candidatos com `util ≥ piso`.
2. Entre os que passam, escolher **maior `reps`**; desempate por **maior `util`**;
   desempate final estável por uma chave determinística (ex.: dimensões ordenadas).
3. Se **nenhum** passa no piso → escolher o de **maior `util`** e marcar
   `pisoAtingido = false` (FR-006).

**Racional**: implementa o objetivo primário decidido — **menos padrões distintos**
(maximizar repetição) **com bom aproveitamento** (piso como restrição dura, FR-011).
Maximizar `reps` sob piso tende a menos setups; o total de chapas fica como efeito
secundário (não é o critério).

**Nota**: não usar score ponderado difuso (`util + λ·reps`) — o usuário escolheu a
semântica de **restrição + prioridade**, mais previsível e explicável (spec, US2).

## Decisão 4 — Determinismo (FR-007 / SC-005)

**Decisão**: garantir determinismo **da seleção** e dos **candidatos homogêneos**;
documentar que o candidato do GA herda a aleatoriedade pré-existente do
`optimizeGeneticAsync`. Testes de determinismo usam **conjunto de candidatos fixo
injetado** no módulo puro.

**Racional**: a seleção é a parte nova e deve ser 100% determinística — e é
(entradas fixas → mesma escolha). O GA já é aleatório hoje (Princípio V tolera com
justificativa). 

**Follow-up recomendado (fora do escopo)**: semear o GA (`Math.random` → PRNG com
semente) para tornar o fluxo multi-chapa inteiro reproduzível. Registrar como spec
futura se o determinismo bit-a-bit do plano completo virar requisito.

## Decisão 5 — UI e não-regressão

**Decisão**: toggle **"Priorizar repetição de padrão"** (OFF por padrão) + slider
**"Aproveitamento mínimo"** (default **85%**) em `SidebarSection.tsx`; resumo de
padrões (nº distintos + cobertura) reaproveitando `replicationInfo`.

**Racional**: OFF por padrão garante **SC-003** (zero regressão): com a opção
desligada, `runAllSheets` segue exatamente o caminho atual (não monta candidatos, não
chama o módulo). O piso 85% é um default seguro (spec, Assumptions).

## Riscos

- **Materializar a árvore do vencedor homogêneo**: chamar `optimizeV6` de um único
  tipo no navegador usa WASM (ok). No fallback TS há um **bug latente pré-existente**
  no ramo de agrupamento do `optimizeV6` para peças **sem label** (ver notas do spec
  005). Mitigar rotulando as peças ao materializar, ou construir a árvore homogênea
  diretamente (grid). Decidir na implementação; registrar em tasks.
- **Interação com o cache de layout** (`buildInvKey`): a escolha por repetição muda o
  padrão usado; garantir que o cache não force o padrão antigo quando a opção está
  ligada (chavear o cache também pela flag/piso, ou ignorá-lo no modo repetição).
