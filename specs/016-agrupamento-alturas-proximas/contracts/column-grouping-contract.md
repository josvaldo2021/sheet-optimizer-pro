# Contrato: `consolidateColumnsX` com agrupamento por altura próxima

Interface pública afetada: `src/lib/engine/tree-utils.ts` (re-exportada por
`src/lib/cnc-engine.ts`).

## Assinatura

```ts
export function consolidateColumnsX(
  tree: TreeNode,
  usableW: number,
  usableH: number,
  fill?: XFill,
  tol?: number,          // NOVO — piso do resíduo de correção (mm)
): void
```

`XFill` permanece inalterado.

### Compatibilidade (regra dos três estados de `tol`)

| `tol` | Significado |
|-------|-------------|
| **omitido / `undefined`** | Feature DESLIGADA. Só alturas idênticas agrupam — comportamento bit-a-bit da spec 015. Preserva todos os call-sites e testes existentes. |
| **`0`** (explícito) | Sem piso físico: qualquer diferença é candidata; só a guarda econômica (C5) decide. |
| **`> 0`** | Piso de maquinabilidade: agrupa com `diff === 0` ou `diff >= tol`. |

O único call-site de produção (`src/pages/Index.tsx`) passa `minBreak` explicitamente.
A distinção entre `undefined` e `0` é o que impede a mudança de vazar para chamadores antigos.

## Pré-condições

- `tree.tipo === "ROOT"`; caso contrário a função retorna sem efeito (já vigente).
- `tree.filhos.length >= 2`; caso contrário retorna sem efeito (já vigente).
- `usableW`, `usableH` positivos e correspondentes à chapa da árvore.

## Pós-condições

Seja `EPS = 0.5` mm.

- **C1 — admissão física**: duas colunas candidatas com alturas `hA > hB` só ficam no mesmo
  conjunto se `hA − hB <= EPS` **ou** `hA − hB >= tol`. Com `0 < hA − hB < tol` elas
  permanecem colunas separadas.
- **C2 — altura da faixa**: a faixa criada tem `valor === max(h_i)` dos seus membros.
- **C3 — correção**: todo membro com `h_i < bandH − EPS` aparece como `Z(w_i) → W(h_i)[peça]`;
  todo membro com `h_i` igual a `bandH` aparece como `Z(w_i)[peça]` folha. Nenhuma folha tem
  medida diferente da peça original.
- **C4 — largura**: a faixa tem `valor === Σ colW_i`, e a soma das larguras dos filhos do
  `ROOT` é preservada.
- **C5 — guarda econômica**: um conjunto só é fundido se
  `largestFreeRect(com a fusão, ANTES do preenchimento) >= largestFreeRect(sem a fusão)` em
  área. Caso contrário as colunas voltam ao `ROOT` exatamente como estavam (identidade
  estrutural, não apenas equivalência).

  **Métrica LOCAL** (decisão de implementação, 2026-07-20): a medição é feita num sub-`ROOT`
  contendo APENAS as colunas do conjunto candidato (largura `Σ colW`), não na chapa inteira.
  Motivo: `largestFreeRect` é um `max` global — um bloco livre grande em outra região da chapa
  dominaria a comparação e faria a guarda aprovar qualquer fusão, virando um no-op. A métrica
  local é o que realmente implementa "a área da nova sobra gerada vs. a área dos fragmentos
  atuais". Efeito colateral positivo: a avaliação fica independente da ordem em que os
  conjuntos são processados (determinismo).
- **C6 — conservação**: `extractLeafPieces` produz o mesmo multiset de `(w, h, label)` antes e
  depois, exceto pelas peças ACRESCENTADAS pelo preenchimento da tira (`fill`), que devem vir
  todas do `fill.pool` e nenhuma já colocada.
- **C7 — determinismo**: para a mesma árvore de entrada e os mesmos parâmetros, a árvore de
  saída é estruturalmente idêntica (medidas, ordem de filhos, rótulos). `id` de nó pode diferir.
- **C8 — idempotência**: aplicar a função duas vezes não altera o resultado da primeira
  (a segunda passada não encontra colunas candidatas na faixa já formada).
- **C9 — sem regressão do caso uniforme**: para uma árvore em que todas as colunas candidatas
  têm alturas iguais, a saída é idêntica à produzida pela versão anterior da função, para
  qualquer `tol`.
- **C10 — guilhotina**: todo nó criado corta de borda a borda do seu pai; nenhuma folha
  ultrapassa o nível `R`.

## Casos de teste normativos

| ID | Cenário | Esperado |
|----|---------|----------|
| **G1** | 2 colunas, peças 592×2388 e 561×2320 (âncora do usuário), `tol = 50` | 1 faixa `Y(2388)`; peça 2320 sob `Z(469 ou 561) → W(2320)`; largura da faixa = soma das colunas |
| **G2** | Mesmas colunas, diferença 12 mm, `tol = 50` | Sem agrupamento; árvore inalterada |
| **G3** | Diferença exatamente 50 com `tol = 50` | Agrupa (limite inclusivo) |
| **G4** | 3 colunas: alturas 2388, 2320, 2000, `tol = 50` | Todas num conjunto (semente 2388; 68 e 388 ≥ 50), cada peça com a sua altura |
| **G5** | Conjunto cuja fusão encolhe o maior bloco livre | Rejeitado; colunas preservadas |
| **G5b** | Conjunto cuja fusão AUMENTA o maior bloco livre | Aceito (prova que a guarda não bloqueia tudo — par discriminante de G5) |
| **G6** | Alturas idênticas, qualquer `tol` | Resultado idêntico ao da spec 015 (regressão C9) |
| **G7** | Conservação após G1/G4 | Multiset de `(w, h, label)` preservado; `calcPlacedArea` não regride |
| **G8** | Duas execuções sobre a mesma entrada | Árvores estruturalmente idênticas (C7) e idempotência (C8) |
| **G9** | G1 com `fill` de peças que cabem na tira | Peças do pool colocadas na tira única; nenhuma peça repetida |
