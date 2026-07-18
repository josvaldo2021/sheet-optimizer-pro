---

description: "Task list — Qualidade de corte para peças identificadas"
---

# Tasks: Qualidade de corte para peças identificadas

**Input**: Design documents from `/specs/012-qualidade-pecas-identificadas/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/grouped-expansion-contract.md), [quickstart.md](./quickstart.md)

**Tests**: OBRIGATÓRIOS. O Princípio V da constituição exige que toda mudança no motor seja coberta por testes de regressão. Além disso, três gates já existentes (`quantity-groups`, `ga-phantom`, `heuristics-benchmark`) são condição de aceite.

**Organization**: Tarefas agrupadas por user story. **Atenção**: ao contrário do caso usual, **US2 depende de US1** — a spec define essa ordem como obrigatória por segurança, não por preferência (research.md).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: a qual user story a tarefa pertence (US1, US2, US3)

## Descoberta que orienta tudo

**O Rust já está correto; o TypeScript é que está quebrado.** `wasm-engine/src/placement.rs:54-73` contém a lógica de roteamento certa, com o raciocínio comentado; `src/lib/engine/placement.ts:53-63` diverge em dois pontos:

| Caso | Rust (correto) | TS (bug) |
|---|---|---|
| `"h"` + rotacionado | `Z` | `R` — sempre folha, não expande |
| `zNodeToUse` + `Z` | `Q` | `W` — grava largura no campo de altura |

O comentário de `placement.rs:69-72` **explica por que o comportamento do TS está errado**. Alguém corrigiu o Rust e não retroportou: o Princípio VI já está violado hoje.

**Consequência prática**: a correção do US1 é majoritariamente **retroporte, não invenção**. Isso reduz muito o risco — mas não dispensa os testes, porque a hipótese "estas duas divergências explicam 100% dos fantasmas" ainda precisa ser provada (T012).

> ### ✅ Status em 2026-07-16 — RESOLVIDO
>
> Eram **duas** causas independentes, e a segunda estava escondida atrás da primeira:
>
> 1. **Roteamento do `splitAxis`** (T008): `("h", rotacionado)` ia para `R` — sempre
>    folha — e o grupo inteiro virava UMA folha com o rótulo de uma só peça.
>    Retroportado do Rust. Matou o fantasma `250×800`.
> 2. **Tolerância de altura no `groupStripPackingDP`** (T010): com tolerância de
>    30/100mm, peças de alturas DIFERENTES entravam na mesma faixa; o grupo grava
>    UMA altura (`h`) e `individualDims` só com as larguras, então as peças mais
>    baixas passavam a ser cortadas com a altura da faixa. Era a origem do
>    `250×300` e da inflação 385→429. Corrigido em TS e Rust: a faixa só agrupa
>    peças de altura idêntica.
>
> **Gates verdes**: `quantity-groups` 385/385, `ga-phantom` sem fantasmas,
> `heuristics-benchmark` sem regressão, suíte 207 testes. Guard removido em TS e
> Rust; WASM reconstruído. Cenário-âncora verificado no app real com WASM.

---

## ✅ Item 1 RESOLVIDO em 2026-07-17 — o WASM voltava a alocar tudo

**Causa**: `group_pieces_fill_row` em `wasm-engine/src/grouping.rs` normalizava cada
peça para a tupla `(largura, altura, rótulo)` e **descartava `count`/`labels`/
`individual_dims`**. Um grupo que passasse por ali virava UMA peça e as outras
`count-1` sumiam do plano — sem nem cair em `remaining`. É exatamente a composição
que o TS já protegia (`groupPiecesFillRow`, "peças que JÁ são grupos passam
intactas"): **o T025 marcou como espelhado o que só existia no TS**. A remoção do
`has_labels` (T022) ativou o agrupamento no Rust e acordou o defeito.

**Segundo defeito, no mesmo arquivo**: a remoção da linha usada era
`remaining.retain(...)` por igualdade de `(largura, altura, rótulo)` — apagava
TODAS as peças iguais, não só a usada. Sem rótulo não há o que distinga duplicatas,
então peças anônimas idênticas sumiam em bloco. O TS remove por identidade, uma a
uma. Corrigido nos dois laços (`fill_row` e `fill_col`) removendo por índice.

**Medida real do estrago** (`src/test/wasm-parity.test.ts`, antes da correção):
WASM alocava 2 de 8, 3 de 11 e 3 de 6 peças, com `remaining` VAZIO — o plano
afirmava ter cortado tudo. TS acertava 8/8, 11/11, 6/6.

**A rede que faltava**: `src/test/wasm-parity.test.ts` (T032) roda o mesmo input
nos dois motores e exige mesma contagem alocada + conservação. Carrega o `pkg`
`--target web` no Node passando os bytes do `.wasm` direto para o init (o fetch da
URL não existe fora do browser). Falhava 6/8 antes, verde depois.

**Flake caçado de brinde**: o `heuristics-benchmark` escolhia o motor por CORRIDA
(vem de `engine-adapter`; em Node o fetch do WASM normalmente falha e cai no TS,
que é como o baseline foi gravado — mas bastava outro teste do worker ter
carregado o módulo para ele comparar WASM contra baseline de TS). Fixado em TS com
`setUseWasmEngine(false)`.

---

## 🔴 RETOMAR AQUI (relato do usuário, 2026-07-16, fim do dia)

Dois retornos de teste real do usuário, DEPOIS de tudo abaixo estar marcado como feito:

1. ~~**O motor Rust/WASM NÃO aloca todas as peças do inventário; o TypeScript está OK.**~~ **RESOLVIDO — ver acima.**
   REGRESSÃO INTRODUZIDA nesta spec — não é dívida pendente, é bug ativo. O app usa
   WASM por padrão (`localStorage.useWasmEngine !== 'false'`), então o usuário está
   exposto. Suspeitos, em ordem, todos em `wasm-engine/src/`:
   - `grouping.rs` `group_strip_packing_dp`: a subdivisão por altura exata
     (BTreeMap) pode estar perdendo peças no caminho de `unassigned`.
   - `placement.rs` ramo `"W"`: a tampa `Q` nova (`if placed_w < slot_w`) pode
     alterar a contabilidade de área/`remaining`.
   - `optimizer.rs`: remoção do `has_labels` ativou o agrupamento no Rust e pode
     ter exposto defeitos de expansão que só existem lá.
   **CAUSA DO FURO**: os 207 testes cobrem SÓ o TypeScript. O Rust foi apenas
   compilado. Não existe teste de paridade TS↔WASM — e o Princípio VI exige um.
   **PRIMEIRO PASSO SUGERIDO**: criar o teste de paridade (mesmo input ⇒ mesma
   contagem de peças alocadas em TS e WASM) e só então caçar a causa. Sem ele,
   qualquer correção é no escuro.

2. **O usuário NÃO percebeu melhoria na fragmentação** nos trabalhos reais dele.
   **Hipótese (b) REFUTADA em 2026-07-17 por duas medições independentes** — mas a
   investigação achou outra coisa, pior (ver T035 abaixo):
   - O gate `skipExpensiveGrouping` **não existe no Rust** (`optimizer.rs:92` só
     testa `!use_grouping`). Como o app roda WASM, ele NUNCA afetou o usuário.
     É uma divergência do Princípio VI, viva e não intencional.
   - Mesmo no TS ele não dispararia: exige `maxRepetition < 3`, isto é, NENHUMA
     medida repetida 3+ vezes. Medido nos relatórios de OF reais do usuário
     (`parts/lote 1|2 medida de chapa.xls`, agrupados por material, que é como o
     app otimiza): 236 peças/maxRep=22, 35 peças/maxRep=12, 2 peças/maxRep=2 —
     `skip=false` em todos. Corte de vidro repete medida demais para o gate pegar.
   Restam as hipóteses (a) e (c) — e o fato de que o relato do usuário foi feito
   sobre o build que PERDIA PEÇAS no WASM (2 de 8), o que sozinho já invalidava
   qualquer plano. **Próximo passo honesto: pedir ao usuário para re-medir com o
   WASM corrigido antes de teorizar mais.**
   O que foi de fato verificado: o cenário-âncora sintético e o benchmark — NÃO os
   trabalhos reais. Possibilidades a investigar: (a) o ganho é real mas estreito;
   (b) `skipExpensiveGrouping` (`pieces.length > 50 && maxRepetition < 3`) desliga
   o agrupamento justamente nos trabalhos grandes dele, tornando a correção inócua
   no uso real; (c) a consolidação de sobra depende do critério de desempate que
   está FORA do escopo desta spec (é a spec 011, com a mira corrigida). A hipótese
   (b) é a mais barata de testar e a mais provável.

**SEGURANÇA ENQUANTO ISSO NÃO É RESOLVIDO**: para usar o app com o motor correto,
setar `localStorage.useWasmEngine = 'false'` (usa o TypeScript, que está OK). Ou
restaurar o binário anterior com `git checkout wasm-engine/pkg` — mas isso apaga o
build necessário para depurar o Rust.

---

## Phase 1: Setup

**Purpose**: preparar o terreno e congelar a linha de base para comparação

- [X] T001 Criar branch de trabalho a partir de `main` (NÃO seguir em `fix/replication-count-stale-input`, que é da tarefa do campo de repetições) e trazer as mudanças já feitas no working tree: correção de composição em `src/lib/engine/grouping.ts` e comentário-nota em `src/lib/engine/optimizer.ts`
- [X] T002 Registrar a linha de base em `specs/012-qualidade-pecas-identificadas/baseline.md`: saída de `npm test` (145 testes, ~61s) e o tempo por variante do cenário de 385 peças, para comparar em T017 e T021

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: a infraestrutura de verificação que ambas as stories consomem

**⚠️ CRITICAL**: nenhuma user story começa antes desta fase

- [X] T003 Criar `src/test/grouped-expansion.test.ts` com o helper de invariantes reutilizável: dado um `TreeNode` e o inventário de origem, asserta INV-1 (conservação, contando `multi`), INV-2 (toda folha rotulada casa com medida real em alguma orientação), INV-3 (cada rótulo aparece no máximo uma vez) e INV-4 (grupo de `count = n` ⇒ exatamente `n` folhas rotuladas), conforme [data-model.md](./data-model.md)

**Checkpoint**: invariantes verificáveis por teste; US1 pode começar

---

## Phase 3: User Story 1 - O plano nunca mente sobre as peças (Priority: P1) 🎯 base do MVP

**Goal**: cada peça física vira uma folha rotulada com a medida real; candidato que não expande fielmente é descartado.

**Independent Test**: testável **sem tocar no guard** — chamando `runPlacement` diretamente com uma `Piece` agrupada e rotulada e verificando INV-1 a INV-4. Isso torna a US1 verificável isoladamente, apesar de a US2 depender dela.

### Tests for User Story 1 ⚠️

> Escrever ANTES da implementação e confirmar que FALHAM. Os casos `("h", rotated)` e `zNodeToUse` são os que devem falhar hoje.

- [X] T004 [P] [US1] Em `src/test/grouped-expansion.test.ts`, teste do contrato do PRODUTOR (P1-P5 de [contracts/grouped-expansion-contract.md](./contracts/grouped-expansion-contract.md)): varrer as funções de `src/lib/engine/grouping.ts` e assertar `labels.length === count`, `individualDims` com medidas reais (ou `[cols,rows]` se `groupedAxis === "2d"`), e que peça com `count > 1` na entrada passa intacta. **Deve PASSAR já** — congela o estado limpo verificado no Achado 3
- [X] T005 [P] [US1] Em `src/test/grouped-expansion.test.ts`, teste do contrato do CONSUMIDOR (C1-C4) chamando `runPlacement` de `src/lib/engine/placement.ts` para as **4 combinações** `groupedAxis ∈ {"w","h"} × rotated ∈ {false,true}`, mais `groupedAxis === "2d"`. **Deve FALHAR** em `("h", rotated)`
- [X] T006 [P] [US1] Em `src/test/grouped-expansion.test.ts`, teste C5: grupo cuja expansão não cabe na estrutura ⇒ colocação falha limpa (peça em `remaining`), NUNCA folha infiel. **Deve FALHAR**
- [X] T007 [P] [US1] Em `src/test/grouped-expansion.test.ts`, teste de regressão do fantasma concreto do Achado 4: grupo de 4 peças 250×200 empilhadas ⇒ 4 folhas rotuladas de 250×200, jamais folhas `W800`. **Deve FALHAR**

### Implementation for User Story 1

- [X] T008 [US1] Corrigir o roteamento de `splitAxis` em `src/lib/engine/placement.ts:53-63` **retroportando a lógica de `wasm-engine/src/placement.rs:54-73`**: `("w",!rot) || ("h",rot) → Z`; caso contrário `W`; e `zNodeToUse && Z → Q` (não `W`). Remover o ramo morto `("w" && rotated) → Q`. Portar também os comentários que explicam o porquê
- [X] T009 [US1] Verificar C4 em `src/lib/engine/placement.ts`: rotação inverte `groupedAxis` e o eixo de `individualDims` coerentemente, inclusive no ramo `"2d"` (linhas 24-47, onde `individualDims` são `[cols, rows]` e já trocam sob rotação)
- [X] T010 [US1] ✅ **RESOLVIDO — a causa NÃO era o pós-processamento.** A investigação (canário por etapa + pilha de criação do nó) provou que o fantasma já nascia no laço de colocação, e o culpado era o **produtor**: `groupStripPackingDP` (`grouping.ts`), variante #42 = tolerância 100. A tolerância junta peças de alturas diferentes na mesma faixa (`sorted[i].nh - current[0].nh <= tolerance`) e a faixa adota `Math.max` das alturas — as peças mais baixas passam a mentir a medida. Somava-se um segundo defeito: `stripHeight` era o máximo do GRUPO inteiro, enquanto o knapsack selecionava só um SUBCONJUNTO. Corrigido subdividindo cada grupo por altura EXATA antes do knapsack; as peças que sobram voltam a ser soltas (onde o caminho de peça única corta a altura real com Q/R). Espelhado em `wasm-engine/src/grouping.rs`.
  <br>**Lição para o contrato**: o teste do produtor (T004) passava porque só validava `individualDims` contra medidas reais — nunca que a medida TRANSVERSAL do grupo batia com cada membro. Essa verificação (P4 completo) foi adicionada e é o que trava a regressão.

- [X] T011 [US1] ✅ (2026-07-18) Validação no limite em `validatePlacementCandidate` (`tree-utils.ts`, com `physicalCount`/`physicalMeasureSet`): INV-1 (conservação), INV-2 (fidelidade de medida via multiset de dims reais), INV-3 (rótulo único). Chamada no loop do `optimizer.ts` ANTES do desempate; candidato inválido é descartado (`continue`). Rede de fallback: se NENHUM válido vencer, usa o melhor inválido em vez de chapa vazia. Testes V1-V4 em `grouped-expansion.test.ts` (T011: 6 casos). INV-4 é subsumido por INV-1+INV-3.
- [X] T012 [US1] ✅ **PASSOU** (2026-07-16, após T010): `quantity-groups` = 385/385 em 17 chapas; `ga-phantom` sem fantasmas. A hipótese inicial (roteamento como causa única) foi refutada na primeira execução e levou à descoberta da segunda causa — o teste fez exatamente o trabalho dele.
- [X] T013 [US1] ✅ (2026-07-18) `labelDims` (`genetic.ts`) agora decodifica a medida REAL de cada peça de um grupo: eixo "w" ⇒ `[individualDims[i], p.h]`, eixo "h" ⇒ `[p.w, individualDims[i]]`, "2d" ⇒ `[p.w/cols, p.h/rows]`; singleton e grupo indecodificável caem no agregado (fallback seguro). Com isso o `capPhantomLeaves` corrige folhas de grupo para a medida certa, não mais a do agregado.

**Checkpoint**: expansão fiel e verificada. **Nada mudou para o usuário ainda** — o guard segue ligado e o bug seguia dormente. É pré-requisito, não entrega.

---

## Phase 4: User Story 2 - Identificar uma peça não piora o corte (Priority: P2) 🎯 aqui o valor chega

**Goal**: trabalhos rotulados recebem as ~54 variantes de busca — o que o usuário efetivamente pediu.

**Independent Test**: planejar o mesmo conjunto com e sem rótulo e comparar aproveitamento e nº de chapas.

**⚠️ Depende de US1**: liberar o guard antes de T012 passar torna o plano ativamente perigoso (dedução de estoque errada é pior que sobra fragmentada).

### Tests for User Story 2 ⚠️

- [X] T014 [P] [US2] Em `src/test/grouped-expansion.test.ts`, teste do cenário-âncora (SC-004): 4× 2473×1262 + 2× 2634×406 em 5980×3190 **com rótulos** ⇒ 6 peças alocadas, todas as folhas rotuladas, `remaining` vazio
- [X] T015 [P] [US2] Em `src/test/grouped-expansion.test.ts`, teste SC-006: o mesmo conjunto planejado com e sem rótulo ⇒ aproveitamento e nº de chapas do rotulado **iguais ou melhores** que os do anônimo

### Implementation for User Story 2

- [X] T016 [US2] Remover o guard `hasLabels` de `src/lib/engine/optimizer.ts:91-95` (e a const `hasLabels`, linha ~74) junto com o comentário-nota temporário, liberando as ~54 variantes para peças rotuladas
- [X] T017 [US2] Rodar `npm test` completo e comparar com a linha de base de T002. Esperado: verde, ~9× mais lento (~510s). Se algum gate falhar, é regressão real — investigar antes de seguir
- [X] T018 [US2] Rodar `npx vitest run src/test/heuristics-benchmark.test.ts`. Verde ⇒ sem regressão. **Melhorou** ⇒ regravar com `RECORD_BASELINE=1 npx vitest run src/test/heuristics-benchmark.test.ts` e commitar `src/test/fixtures/benchmark-baseline.json`. **Piorou** ⇒ falha (FR-006 exige melhora, não só ausência de piora)
- [X] T019 [US2] Rodar `npx vitest run src/test/ga-determinism.test.ts` (SC-007)

**Checkpoint**: o problema original do usuário está resolvido — sobra deixa de fragmentar por falta de busca. **MVP real: US1 + US2.**

---

## Phase 5: User Story 3 - A espera continua suportável (Priority: P3)

**Goal**: confirmar que a espera fica na ordem de ~2 min com progresso visível. **Não otimizar** — FR-008 aceita o custo explicitamente.

**Independent Test**: medir o tempo do plano de um trabalho típico no app real.

- [X] T020 [US3] ✅ (2026-07-18) Medido com o motor de PRODUÇÃO (WASM/GA pop10×gen10) replicando o loop multi-chapa de `runAllSheets` sobre `of_geral_parcial (3).xls` — 268 peças físicas rotuladas (uid por peça), útil 5980×3190, agrupamento LIGADO. (Optou-se pela medição direta do motor real em vez de dirigir a UI: é o mesmo caminho que roda no app e dá o número faticamente.)
- [X] T021 [US3] ✅ SC-008 folgado: plano completo em **8,2 s** (44 chapas, 268/268 conservadas; 1ª chapa 914 ms) ≪ ~2 min. Ligar o agrupamento p/ peças rotuladas NÃO estourou o tempo. Registrado em `baseline.md` ("Resultados finais medidos"). Fragmentação (44 chapas) é alvo da spec 011, não da 012.

---

## Phase 6: Paridade TS ↔ WASM (Princípio VI — OBRIGATÓRIO)

**Purpose**: o Princípio VI não é polimento. Divergência é bug.

> Note a inversão: aqui **o TS converge para o Rust** no roteamento (T008), mas o guard precisa cair nos **dois** lados.

- [X] T022 Remover o guard `has_labels` de `wasm-engine/src/optimizer.rs:83-86`, espelhando T016
- [X] T023 Espelhar em `wasm-engine/src/placement.rs` as correções de T009/T010 que não existirem lá (o roteamento de T008 já está correto no Rust — verificar, não duplicar)
- [X] T024 ⚠️→✅ Estava FALSAMENTE marcado feito (o padrão desta spec: "marcado feito, só existia no TS"). CORRIGIDO de fato em 2026-07-18: `validate_placement_candidate`/`extract_leaf_pieces`/`physical_count`/`physical_measure_set` em `wasm-engine/src/tree_utils.rs`, chamados no loop de `optimizer.rs` com a mesma rede de fallback do TS. WASM reconstruído; `wasm-parity.test.ts` verde.
- [X] T025 Espelhar em `wasm-engine/src/grouping.rs` a correção de composição já feita em `src/lib/engine/grouping.ts` (grupo recebido como entrada passa intacto)
- [X] T026 Rodar `npm run build:wasm` e verificar que TS e WASM produzem resultados equivalentes para o cenário-âncora, via `src/lib/engine/engine-adapter.ts`
- [X] T032 Criar `src/test/wasm-parity.test.ts`: mesmo input nos dois motores ⇒ mesma contagem de peças alocadas + conservação (alocadas + `remaining` = inventário). Cenários: âncora, faixa de altura única, alturas mistas (exercita a subdivisão de T010) e duplicatas anônimas (exercita a remoção por índice). **Esta era a rede que faltava** — sem ela, T022-T026 passaram verdes com o WASM perdendo peças
- [X] T033 Corrigir de fato o espelho de T025 em `wasm-engine/src/grouping.rs` (`group_pieces_fill_row`: grupo recebido como entrada passa intacto) — T025 foi marcado como feito, mas a correção só existia no TS
- [X] T034 Fixar o motor do `heuristics-benchmark` em TS (`setUseWasmEngine(false)`): o baseline é de TS e a escolha do motor via `engine-adapter` era uma corrida ⇒ falha intermitente
- [X] T035 **O T010 estava PELA METADE, nos DOIS motores.** A correção de tolerância foi aplicada a `groupStripPackingDP` mas NÃO ao gêmeo `groupStripPackingDPTransposed` (`grouping.ts:780` / `grouping.rs:566`), que tem o bug simétrico: agrupa por tolerância de LARGURA e adota `strip_w = max` do grupo, enquanto `individualDims` guarda só as alturas ⇒ as peças mais estreitas são cortadas com a largura da faixa. Medido: 60 peças de medidas únicas ⇒ WASM alocava 60/60 mas com **20 fantasmas** (`P50` real 650×350 virava 650×353, sempre a medida do vizinho dentro da tolerância) e área inflada 9145k→9177k. Corrigido nos dois motores subdividindo por largura EXATA antes do knapsack. **Por que passou pelo T012**: a suíte só media CONTAGEM de peças, e a contagem estava certa — o motor alocava as N peças e mentia a medida de algumas. `wasm-parity.test.ts` ganhou o teste "nenhuma folha afirma medida inexistente" (multiset de medidas do inventário + igualdade de área), que é o que trava esta classe de bug
- [X] T036 ✅ (2026-07-18) DECISÃO DO USUÁRIO: **remover do TS** (converge para o Rust/WASM). `skipExpensiveGrouping` + `dimCounts`/`maxRepetition` removidos de `optimizer.ts`; o TS agora sempre agrupa, igual ao WASM de produção. Corrige a divergência do Princípio VI ao custo de CPU no fallback TS em jobs grandes de baixa repetição (regime ausente nos relatórios reais). Rust intocado (nunca teve o gate) ⇒ sem rebuild WASM.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T027 [P] ✅ Armadilha nº 2 do `CLAUDE.md` já cobre o guard `hasLabels` (desligava o agrupamento sozinho em 100% dos trabalhos rotulados); desfecho registrado.
- [X] T028 [P] ✅ `docs/AI_CONTEXT.md` (tabela Peça-vs-Grupo + INV-1..INV-5 + validação no limite) e `docs/CONTEXT_MAP.md` (linha do `tree-utils.ts` com os helpers de validação + linhas de teste `grouped-expansion`/`wasm-parity`) atualizados.
- [X] T029 [P] ✅ AVALIADO e MANTIDO: `capPhantomLeaves` NÃO é remendo morto. O caminho de PRODUÇÃO é o GA e seus indivíduos EVOLUÍDOS (`buildPieces`→`simulateSheets`→`runPlacement`) chegam ao vencedor SEM passar pela validação do `optimizeV6` (T011); `capPhantomLeaves` segue sendo a defesa de fantasma desse ramo, agora com `labelDims` correto (T013). Desfecho documentado no cabeçalho da função.
- [X] T030 ✅ Quickstart exercitado nesta sessão: os 10 critérios de pronto conferidos (conservação, zero fantasmas, âncora, rotulado≥anônimo, benchmark sem regressão, determinismo, suíte verde + tipos limpos, plano em 8,2 s, paridade TS↔WASM, guard removido).
- [X] T031 ✅ Bloco SPECKIT do `CLAUDE.md` atualizado: spec 012 IMPLEMENTADA, T011/T013/T024/T029 concluídos, T020/T021 medidos (8,2 s), benchmark sem melhora (baseline não regravado), pendente só T036 (decisão do usuário) + re-medição pós-spec-011.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências
- **Foundational (Phase 2)**: depende do Setup — BLOQUEIA todas as stories
- **US1 (Phase 3)**: depende da Foundational
- **US2 (Phase 4)**: **depende de US1 completa (T012 verde)** — não é independente, e essa ordem é de segurança
- **US3 (Phase 5)**: depende de US2 (o custo de tempo só existe depois do guard cair)
- **Paridade (Phase 6)**: depende de US1 + US2 (o comportamento precisa estar estável)
- **Polish (Phase 7)**: depende de tudo

### User Story Dependencies

- **US1 (P1)**: independente. Testável isoladamente via `runPlacement` (T005-T007), sem tocar no guard
- **US2 (P2)**: **BLOQUEADA por US1**. Liberar a busca sem conservação = plano que mente sobre o que corta
- **US3 (P3)**: bloqueada por US2. Só medir, não otimizar

### Parallel Opportunities

- T004, T005, T006, T007 (testes da US1) em paralelo — **mesmo arquivo**, então coordenar ou escrever em sequência dentro do arquivo
- T014, T015 (testes da US2) em paralelo entre si
- T027, T028, T029 (polish) em paralelo — arquivos diferentes
- **Sem paralelismo entre stories**: a cadeia US1 → US2 → US3 é estritamente sequencial. Esta feature não se beneficia de time paralelo

## Parallel Example: Phase 7

```bash
# Arquivos diferentes, sem dependência entre si:
Task: "T027 Corrigir a armadilha nº 2 do CLAUDE.md"
Task: "T028 Atualizar docs/AI_CONTEXT.md e docs/CONTEXT_MAP.md"
Task: "T029 Avaliar remover capPhantomLeaves em src/lib/engine/genetic.ts"
```

## Implementation Strategy

### O MVP aqui é US1 + US2 — não US1 sozinha

Ao contrário do padrão, **US1 sozinha não entrega nada observável**: com o guard ligado, agrupamento e rótulo nunca se encontram, e o bug de conservação fica dormente. US1 é a fundação que torna US2 **segura**. Parar na US1 significa ter feito o trabalho difícil sem colher nada.

O valor chega no T016 — a remoção do guard, uma linha, que só é segura depois de tudo antes dela.

### Entrega incremental

1. Setup + Foundational → invariantes verificáveis
2. US1 → conservação garantida (invisível ao usuário, mas o gate destrava)
3. US2 → **o valor chega**: sobra deixa de fragmentar, layouts melhoram
4. Paridade → WASM alinhado (obrigatório, não opcional)
5. US3 + Polish → confirmar espera e limpar remendos

### Critério de parada honesto

Se T012 não passar após T008-T010, **pare e reporte**. Significa que o roteamento não era a causa única e a investigação precisa continuar antes de qualquer coisa na US2. Liberar o guard com conservação quebrada é o pior desfecho possível desta feature — pior que o estado atual.

## Notes

- `[P]` = arquivos diferentes, sem dependência
- Commitar a cada tarefa ou grupo lógico
- **Flake conhecido**: `npm test` pode sair com código 1 mesmo tudo passando (worker do vitest). Julgar pelo sumário, não pelo exit code
- Ao mexer no benchmark: melhora ⇒ regravar baseline; piora ⇒ falha, não tolerância
