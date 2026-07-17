# Research: Qualidade de corte para peças identificadas

**Fase 0** | **Data**: 2026-07-16 | **Spec**: [spec.md](./spec.md)

Este documento registra a investigação que originou a spec 012 e as decisões de
abordagem. Todas as afirmações abaixo foram **medidas**, não inferidas — cada uma
traz como foi verificada.

## Contexto: a diferença entre peça e grupo

O motor combina peças durante a busca para aproveitar melhor a chapa. Uma `Piece`
com `count > 1` não é uma peça: é um **grupo** — um agregado temporário com:

- `w`/`h` = medidas do **grupo inteiro** (não da peça individual)
- `count` = quantas peças físicas ele contém
- `individualDims` = a medida de cada peça ao longo do eixo do agrupamento
- `groupedAxis` = `"w"` | `"h"` | `"2d"`
- `labels` = a identificação de cada peça física

O `placement` expande o grupo em nós individuais rotulados na árvore. **A árvore é a
fonte da verdade** (Princípio IV): se a expansão falha, o plano mente.

## Achado 1 — O guard que desliga a otimização (CONFIRMADO)

**O quê**: `optimizer.ts` reduz o conjunto de variantes de busca de ~54 para 2 quando
qualquer peça tem rótulo (`hasLabels`).

**Como foi medido**: removendo o guard, o cenário-âncora do usuário passa a produzir
o layout com a sobra consolidada de 1034×2524; recolocando, volta a fragmentar em
dois retalhos de 1034×1262. Reproduzido nos dois sentidos.

**Impacto**: 100% dos trabalhos reais do usuário vêm rotulados do relatório de OF
(`Index.tsx` atribui um uid por peça). Na prática, o motor **nunca** roda com
agrupamento em produção.

**Conformidade**: o Princípio III da constituição (NON-NEGOTIABLE) proíbe
explicitamente rodar o otimizador sem agrupamento em produção, citando a queda de
qualidade (~9 peças/chapa vs 30+). O comportamento atual equivale a isso. **Esta
spec é uma correção de conformidade, não apenas uma melhoria.**

## Achado 2 — Composição de agrupamentos (CONFIRMADO e JÁ CORRIGIDO)

**O quê**: `groupPiecesFillRow`, ao receber peças **já agrupadas** (variantes
encadeadas em `optimizer.ts:117-118`), reempacotava o grupo como se fosse uma peça
solta: descartava `labels`, `count` e `individualDims`, e a normalização por
`max/min` rotacionava o grupo sem trocar `groupedAxis`. N peças passavam a contar
como 1.

**Como foi medido**: varredura das 20 variantes no cenário-âncora. 18 preservavam
rótulo; as 2 encadeadas produziam 3 folhas em vez de 6, **zero** rotuladas. Pior: por
terem menos nós, venciam o desempate por compactação — **o bug se disfarçava de
layout melhor**.

**Decisão**: grupos não são recomponíveis. A árvore expande **um único nível** de
agrupamento, então reagrupar um grupo nunca é representável. Peças com `count > 1`
passam intactas.

**Status**: corrigido no working tree; suíte verde; benchmark sem regressão.

## Achado 3 — As funções de agrupamento estão limpas (CONFIRMADO)

**O quê**: depois do Achado 2, **nenhuma** função de agrupamento emite grupo
malformado.

**Como foi medido**: sonda sobre 24 combinações (todas as funções, incluindo
encadeadas e com entrada rotacionada), verificando que todo grupo emitido tem
`individualDims` composto apenas de medidas existentes no inventário e
`labels.length === count`. **Zero problemas encontrados.**

**Consequência**: a corrupção acontece **depois** do agrupamento — na expansão ou no
pós-processamento. Isso redireciona o trabalho e descarta a hipótese inicial de
"caçar a função de agrupamento culpada".

## Achado 4 — A expansão produz folhas fantasma (CONFIRMADO)

**O quê**: a árvore final contém folhas que mentem a própria medida e engolem peças.

**Como foi medido**: dump da árvore no cenário do `ga-phantom.test.ts` (seed 1,
chapa 2), com o guard removido:

```
Z250 multi=1
  W800 multi=1 [__19]  <<FOLHA
  W800 multi=1 [__12]  <<FOLHA
```

`__19` e `__12` são peças de **250×200**. Cada folha `W800` afirma ser uma peça de
250×800 e carrega o rótulo de apenas uma peça. Onde deveriam existir 8 folhas
rotuladas, existem 2 — **6 peças desapareceram do rastreio** e as 2 restantes têm
medida inexistente.

**Falhas correlatas**: `quantity-groups.test.ts` relata 429 peças alocadas para um
inventário de 385 — a contagem infla porque `multi`/`count` sobrevivem enquanto as
folhas individuais não.

## Achado 5 — Ramo morto no roteamento da expansão (CONFIRMADO)

**O quê**: `placement.ts:53-61` escolhe o eixo de divisão do grupo:

```ts
if (originalAxis === "w" && !rotated)                       splitAxis = "Z";
else if ((originalAxis === "h" && !rotated) || (originalAxis === "w" && rotated)) splitAxis = "W";
else if (originalAxis === "w" && rotated)                   splitAxis = "Q";  // INALCANÇÁVEL
else                                                        splitAxis = "R";
```

O terceiro ramo é **código morto**: `originalAxis === "w" && rotated` já foi capturado
pelo segundo. Consequência: o caso restante — **grupo empilhado (`h`) e rotacionado**
— cai no `else` e vira `R`, um tipo que é **sempre folha** (Princípio IV / armadilha
nº 4 do CLAUDE.md). Um grupo roteado para `R` não tem como expandir em N folhas.

**Status**: forte candidato à causa do Achado 4, ainda **não provado como causa
única**. A verificação é tarefa da implementação, não bloqueio do plano — porque a
decisão de projeto abaixo não depende de qual ramo está errado.

## Achado 6 — As redes de proteção existentes não alcançam o caso (CONFIRMADO)

**`capPhantomLeaves`** (`genetic.ts:73`) conserta folhas fantasma comparando a medida
do nó com as medidas reais do rótulo. Ele **não consegue** reparar o Achado 4: para a
folha `W800` de `__19`, nem 800 nem a dimensão do contêiner batem com 250 ou 200, e a
função devolve `null` — desiste. Ela só trata folhas com **uma** dimensão inflada.

**`labelDims`** (`genetic.ts:258-262`) mapeia rótulo → medida real:

```ts
if (p.labels) p.labels.forEach((lb) => { labelDims.set(lb, [p.w, p.h]); });
```

Para um grupo, `p.w`/`p.h` são as medidas **do agregado**. Se a entrada já vier
agrupada, cada rótulo é mapeado para a medida do grupo — **envenenando a própria
tabela que detecta fantasmas**. Hoje o GA recebe peças cruas, então o defeito está
latente; ele vira ativo assim que a entrada agrupada chegar até ali.

## Decisão de projeto

**Decisão**: tratar "grupo expansível" como um **contrato verificável no limite**, em
vez de caçar e remendar cada função.

**Racional**:

1. O Achado 3 mostra que o produtor (agrupamento) está correto; o consumidor
   (expansão) é que falha. Remendar produtores não resolveria.
2. O Achado 6 mostra que redes downstream (`capPhantomLeaves`) são estruturalmente
   incapazes de reparar o dano — informação já perdida.
3. A spec já exige isso em **FR-007**: combinações que não possam ser desfeitas em
   peças rastreáveis MUST ser descartadas como candidatas, nunca aceitas no plano.

**Forma**: um invariante único, verificado onde o candidato vira plano — *toda folha
rotulada corresponde a uma peça real do inventário, e o total de folhas é igual ao
total de peças consumidas*. Um candidato que viole é **descartado**, não corrigido.
Isso é robusto: vale para as ~15 funções, para o GA e para o optimizer, e falha de
forma segura (perde-se um candidato, nunca a conservação).

**Alternativas consideradas e rejeitadas**:

| Alternativa | Rejeitada porque |
|---|---|
| Corrigir cada função de agrupamento | O Achado 3 prova que já estão corretas. Trabalho sobre o alvo errado. |
| Reforçar `capPhantomLeaves` | Achado 6: a informação já foi perdida quando ele roda. Remendo sobre remendo. |
| Manter o guard e otimizar só o desempate | Não entrega a US2; o usuário continuaria sem 52 das 54 variantes. Viola o Princípio III. |
| Desfazer a rotação de grupos | Perderia candidatos legítimos (rotação é o que faz muitos layouts caberem). |
| Remover rótulos antes do motor | O usuário definiu identificação como inegociável; sustenta dedução, lotes e leitura do operador. |

## Custo de tempo — decidido, fora de escopo

Liberar as ~54 variantes para trabalhos rotulados multiplica a busca por ~9× (suíte:
61s → 510s; trabalho de 385 peças: ~4-8s → ~32-38s por variante). O usuário decidiu
em 2026-07-16 **aceitar o custo** (~20s → ~2min por trabalho típico), priorizando
aproveitamento. Consequência registrada em FR-008: **reduzir o esforço de busca está
fora do escopo** — nem recalibrar o corte automático de inventários grandes
(`skipExpensiveGrouping`), nem selecionar estratégias promissoras.

## Ordem obrigatória de execução

A ordem não é preferência — é dependência:

1. **Conservação primeiro** (US1). Enquanto a expansão perder peças, liberar as
   variantes torna o plano *ativamente perigoso*: dedução de estoque errada é pior que
   sobra fragmentada.
2. **Só então liberar o guard** (US2). É uma mudança de uma linha, mas só é segura
   depois de (1).
3. **Paridade Rust/WASM** (Princípio VI) acompanha qualquer mudança de comportamento.

## Riscos

| Risco | Mitigação |
|---|---|
| A correção da expansão muda layouts de trabalhos **não** rotulados (que já usam agrupamento) | `heuristics-benchmark.test.ts` barra regressão; melhora ⇒ regravar baseline (`RECORD_BASELINE=1`) |
| Descartar candidatos inválidos reduz a diversidade da busca e piora o aproveitamento | Medir; se material, corrigir o roteamento (Achado 5) em vez de só descartar |
| Divergência TS ↔ Rust após a mudança | Princípio VI: espelhar e rebuildar; divergência é bug |
| O ganho de aproveitamento não se materializar em trabalhos reais | Cenário-âncora + benchmark medem antes/depois; a spec exige melhora, não só ausência de piora |
