# Contract: lookahead residual na seleção do `optimizeV6`

Mudança no **motor** (TS de referência + espelho Rust). Adiciona um helper
geométrico e um nível de desempate na seleção de layout. Deriva tudo da árvore
(Princípio IV) e mantém paridade TS↔WASM (Princípio VI).

## Helper: `largestFreeRect(tree, usableW, usableH): { w, h } | null`

- **TS**: `src/lib/engine/tree-utils.ts`. **Rust**: espelho `largest_free_rect`.
- Retorna o retângulo de **maior área** entre os espaços livres da chapa,
  generalizando o gap-walk do `getLastLeftover` (coleta os gaps de cada nível em
  vez de só o final).
- Puro; não muta; determinístico; `null` se não há espaço livre.

### Casos (unit)

- **L1** Árvore vazia → `{ usableW, usableH }`.
- **L2** Uma coluna X ocupada + faixa à direita → retorna a faixa se for o maior.
- **L3** Sobra "final" pequena mas um gap intermediário maior → retorna o **maior**
  (não o final) — diferença chave frente ao `getLastLeftover`.
- **L4** Chapa totalmente preenchida → `null`.

## Função: `residualFits(tree, usableW, usableH, piece, minBreak): boolean`

- `true` se `largestFreeRect` acomoda `piece` em `w×h` **ou** `h×w` (rotação),
  respeitando margens/`minBreak`.
- Usada com a **maior peça** de `result.remaining` como `piece`.

## Critério de seleção (comportamento observável)

No laço do `optimizeV6`, a preferência entre candidatos passa a ser:

```
1. maior `area`                                  (inalterado; objetivo primário)
2. empate em área → `residualFits(maior restante)` true > false   (NOVO)
3. empate → menor `compactness`                  (desempate atual)
4. empate → critério estável                     (determinismo)
```

### Casos (comportamento)

- **S1 (âncora "Chapa 2")** Dois candidatos de mesma área; um deixa livre
  consolidado que comporta a próxima peça, outro fragmenta. → escolhe o
  consolidado. O maior retângulo livre do escolhido comporta a próxima peça.
- **S2 (guarda III)** Candidato A com **mais área** e livre fragmentado vs. B com
  menos área e livre consolidado → escolhe **A** (área manda; residual só desempata).
- **S3 (não-regressão)** Sem peça restante que caiba em nenhum livre → residual
  empata `false` p/ todos → resultado idêntico ao atual (só compactness).
- **S4 (determinismo)** Mesmo input 2× → mesmo layout.
- **S5 (paridade)** Mesmo input em TS e WASM → mesmo layout.

## Portão de não-regressão (obrigatório)

- `heuristics-benchmark.test.ts`: **nenhum** cenário pode piorar em aproveitamento
  ou nº de chapas (SC-002/SC-003). Se **melhorar**, regravar baseline
  (`RECORD_BASELINE=1`) e documentar.

## Consumidores

- `optimizeV6` (TS e Rust). Nenhuma mudança de UI ou de plano.
