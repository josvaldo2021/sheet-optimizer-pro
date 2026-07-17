# Contrato: Expansão de peça agrupada

**Fase 1** | **Data**: 2026-07-16 | **Plan**: [plan.md](./plan.md)

Contrato interno do motor (`src/lib/engine/**`), consumido pelo optimizer e pelo GA,
e obrigatoriamente espelhado em Rust (Princípio VI). Definições e invariantes em
[data-model.md](../data-model.md).

## 1. Produtor de grupo (funções de agrupamento)

**Estado**: já em conformidade — verificado por sonda sobre 24 combinações
(research.md, Achado 3). O contrato abaixo **documenta** e protege esse estado.

Uma função de agrupamento MUST, para todo grupo emitido (`count = n > 1`):

| # | Cláusula |
|---|---|
| P1 | `labels.length === n` — uma identificação por peça física contida. |
| P2 | Se `groupedAxis ∈ {"w","h"}`: `individualDims.length === n`, e cada valor é a medida de uma peça **real** do inventário. |
| P3 | Se `groupedAxis === "2d"`: `individualDims === [cols, rows]` (contagens) e `cols * rows === n`. |
| P4 | `w`/`h` descrevem o agregado e são consistentes com `individualDims` ao longo de `groupedAxis`. |
| P5 | **Não recompõe** (INV-5): uma peça de entrada com `count > 1` MUST passar intacta — nunca reagrupada, nunca normalizada/rotacionada. |

> P5 é a correção do Achado 2, já aplicada em `groupPiecesFillRow`. As demais funções
> MUST ser auditadas contra ela — não porque falhem hoje, mas porque nada as impede de
> falhar amanhã: elas são compostas em `optimizer.ts:117-118`.

## 2. Consumidor (expansão em `placement`)

**Estado**: **em violação** (research.md, Achados 4 e 5). É o alvo da Etapa 1.

Ao colocar uma peça com `count = n > 1`, a expansão MUST:

| # | Cláusula |
|---|---|
| C1 | Produzir **exatamente `n`** folhas (INV-4). |
| C2 | Cada folha carrega `labels[i]`, uma e só uma vez (INV-3). |
| C3 | Cada folha renderiza com as medidas **reais** da peça `i` (INV-2) — jamais as do agregado. |
| C4 | Rotação (`rotated`) MUST inverter coerentemente `groupedAxis` e o eixo de `individualDims`. |
| C5 | Se o roteamento não permitir satisfazer C1–C4 — p.ex. destino `R`, que é sempre folha, ou profundidade esgotada — a colocação MUST **falhar de forma limpa** (peça não colocada), nunca produzir folha infiel. |

**Violação conhecida de C5** — `placement.ts:53-61`:

```ts
if (originalAxis === "w" && !rotated)                       splitAxis = "Z";
else if ((originalAxis === "h" && !rotated) || (originalAxis === "w" && rotated)) splitAxis = "W";
else if (originalAxis === "w" && rotated)                   splitAxis = "Q";  // INALCANÇÁVEL
else                                                        splitAxis = "R";  // recebe ("h", rotated)
```

O terceiro ramo é código morto (subsumido pelo segundo), então **grupo empilhado
rotacionado** cai em `R` — sempre folha, incapaz de conter `n` filhos.

## 3. Validação no limite (rede de segurança)

Onde um candidato é aceito como plano, ele MUST satisfazer INV-1 a INV-4. Em
violação, o candidato é **descartado** (FR-007), nunca reparado.

| # | Cláusula |
|---|---|
| V1 | Verificação **antes** do desempate, para que candidato inválido não vença por parecer mais compacto (Achado 2). |
| V2 | Descartar é sempre seguro: perde-se um candidato, nunca a conservação. |
| V3 | Reparo a jusante é PROIBIDO — quando `capPhantomLeaves` roda, a informação já se perdeu (Achado 6). |
| V4 | Vale para optimizer e GA (compartilham a expansão). |

## 4. Dívida correlata (fora da Etapa 1, registrar)

`genetic.ts:258-262` mapeia rótulo → medida:

```ts
if (p.labels) p.labels.forEach((lb) => { labelDims.set(lb, [p.w, p.h]); });
```

Para um grupo, `p.w`/`p.h` são as medidas do **agregado** — cada rótulo é associado à
medida errada, envenenando a tabela que detecta fantasmas. Latente hoje (o GA recebe
peças cruas); ativo assim que entrada agrupada chegar ali. MUST ser corrigido ou
explicitamente documentado como inalcançável.

## 5. Verificação

| Cláusula | Verificado por |
|---|---|
| P1–P5 | Sonda de agrupamento (research.md, Achado 3) promovida a teste permanente |
| C1–C5 | `grouped-expansion.test.ts` (novo) + `ga-phantom.test.ts` **com** agrupamento |
| INV-1 | `quantity-groups.test.ts` — 385 entram, 385 saem |
| INV-2 | `ga-phantom.test.ts` — toda folha rotulada casa com o inventário |
| V1–V4 | `grouped-expansion.test.ts` — candidato inválido é descartado, não aceito |
| Sem regressão | `heuristics-benchmark.test.ts` (melhora ⇒ `RECORD_BASELINE=1`) |
| Determinismo | `ga-determinism.test.ts` (SC-007) |
| Cenário-âncora | 4× 2473×1262 + 2× 2634×406 em 5980×3190, rotuladas: 6 folhas rotuladas, `remaining` vazio (SC-004) |
| Paridade | TS e Rust equivalentes para o mesmo input (Princípio VI) |
