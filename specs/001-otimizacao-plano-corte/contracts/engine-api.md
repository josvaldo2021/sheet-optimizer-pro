# Contract — API Pública do Motor

Contrato da biblioteca de otimização, exposto pelo barrel
`src/lib/cnc-engine.ts`. Documento retroativo: descreve as assinaturas reais.

## Entradas de otimização

### `optimizeV6(pieces, usableW, usableH, minBreak?, useGrouping?) → { tree, remaining }`

Otimizador heurístico, **síncrono**.

| Parâmetro    | Tipo      | Padrão | Descrição |
| ------------ | --------- | ------ | --------- |
| `pieces`     | `Piece[]` | —      | Peças a alocar. |
| `usableW`    | `number`  | —      | Largura útil (já descontadas as margens). |
| `usableH`    | `number`  | —      | Altura útil. |
| `minBreak`   | `number`  | `0`    | Distância mínima de corte/quebra. |
| `useGrouping`| `boolean` | (lig.) | **NÃO passar `false` em produção** (Princípio III). |

**Retorno**: `{ tree: TreeNode, remaining: Piece[] }` — a árvore de corte e as
peças não alocadas. `remaining` pode conter peças agrupadas; ver Princípio IV.

**Garantias**: determinístico; corte guilhotina; `pieces=[]` retorna raiz vazia.

### `optimizeGeneticAsync(pieces, usableW, usableH, minBreak?, onProgress?, priorityLabels?, gaPopulationSize?, gaGenerations?) → Promise<TreeNode>`

Otimizador genético, **assíncrono**, com relatório de progresso.

| Parâmetro          | Tipo                                  | Padrão | Descrição |
| ------------------ | ------------------------------------- | ------ | --------- |
| `pieces`           | `Piece[]`                             | —      | Peças a alocar. |
| `usableW`,`usableH`| `number`                              | —      | Dimensões úteis. |
| `minBreak`         | `number`                              | `0`    | Distância mínima de quebra. |
| `onProgress`       | `(p: OptimizationProgress) => void`   | —      | Callback de progresso. |
| `priorityLabels`   | `string[]`                            | —      | Rótulos a priorizar. |
| `gaPopulationSize` | `number`                              | `10`   | Tamanho da população (mín. 10). |
| `gaGenerations`    | `number`                              | `10`   | Nº de gerações. |

**Retorno**: `Promise<TreeNode>` — plano de corte de uma chapa.

### `optimizeGeneticV1(pieces, usableW, usableH, minBreak?) → TreeNode`

Versão anterior do GA, síncrona. Mantida para referência/comparação.

## Controle do backend (TS vs WASM)

| Função                       | Retorno   | Descrição |
| ---------------------------- | --------- | --------- |
| `getUseWasmEngine()`         | `boolean` | Se o backend WASM está ativo. |
| `setUseWasmEngine(val)`      | `void`    | Liga/desliga o WASM (persiste em `localStorage`). |
| `isWasmReady()`              | `boolean` | Se o módulo WASM foi inicializado. |

Garantia de paridade (Princípio VI): para o mesmo input, WASM e TS produzem
resultados equivalentes; o adapter cai para TS em caso de erro do WASM.

## Utilitários de árvore (derivar resultado)

Expostos pelo barrel a partir de `tree-utils.ts` / `normalization.ts`:

`createRoot`, `cloneTree`, `findNode`, `findParentOfType`, `insertNode`,
`deleteNode`, `calcAllocation`, `calcPlacedArea`, `getLastLeftover`,
`calcPlanUtilization`, `annotateTreeLabels`, `countAllocatedPieces`,
`normalizeTree`.

**Regra de uso (Princípio IV)**: contagem/área/aproveitamento derivam da árvore.
`countAllocatedPieces` e funções que filtram por `label` **ignoram nós sem
label** — para tracking interno, percorrer a árvore sem checar `label`.

## Multi-chapa (camada de UI — não faz parte do motor)

`runAllSheets` em `src/pages/Index.tsx` orquestra o loop: expande `PieceItem.qty`
em instâncias com rótulo único, chama `optimizeGeneticAsync` por chapa, deduz as
peças alocadas e repete até o inventário esvaziar (teto `maxSheets`). Não é parte
do contrato do motor puro, mas consome este contrato.
