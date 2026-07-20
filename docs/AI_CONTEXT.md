# Contexto Mestre do Projeto: Sheet Optimizer Pro

Este documento serve como um guia abrangente para a inteligência artificial (IA) interagir com o projeto **Sheet Optimizer Pro**. Ele detalha a arquitetura, os algoritmos centrais, as estruturas de dados e as regras de negócio, visando facilitar o entendimento e reduzir a necessidade de tokens em interações futuras.

## 1. Visão Geral do Projeto

O **Sheet Optimizer Pro** é uma aplicação web desenvolvida para otimização de planos de corte (nesting 2D) de peças retangulares em chapas maiores. O objetivo principal é minimizar o desperdício de material e otimizar o processo de corte, utilizando algoritmos avançados de agrupamento e posicionamento de peças.

## 2. Arquitetura Técnica

O projeto é uma aplicação **Single Page Application (SPA)** construída com as seguintes tecnologias:

*   **Frontend:** React com TypeScript, utilizando Vite para o ambiente de desenvolvimento e build.
*   **Estilização:** Tailwind CSS para utilitários de CSS e shadcn/ui para componentes de interface de usuário.
*   **Motor de Otimização (CNC Engine):** Implementado em TypeScript, é o módulo central responsável pelos algoritmos de agrupamento, posicionamento e otimização. Este motor é agnóstico à interface de usuário e pode ser reutilizado.
*   **Exportação:** Funcionalidades de exportação para PDF (via `jspdf`) e Excel (via `xlsx`) para relatórios e integração com outros sistemas.

## 3. Algoritmos Centrais de Otimização

O projeto emprega uma abordagem híbrida para a otimização, combinando heurísticas e algoritmos genéticos para alcançar alta eficiência.

### 3.1. `optimizeV6` (Heurístico)

Esta função implementa diversas estratégias heurísticas para o posicionamento de peças. Ela considera:

*   **Estratégias de Ordenação:** 14 formas de ordenar as peças (por área, maior dimensão, proporção, etc., além de altura/largura **ascendentes** — spec 004→005) para tentar diferentes arranjos. `getSortStrategies()` (TS) e `cmp_by_strategy`/`NUM_SORT_STRATEGIES` (Rust) devem permanecer em paridade.
*   **Agrupamento:** Antes do posicionamento, peças com características semelhantes (ex: mesma largura ou altura) podem ser agrupadas para serem cortadas juntas, reduzindo o número de cortes primários.
*   **Rotação:** As peças podem ser rotacionadas em 90 graus para encontrar um encaixe melhor.

### 3.2. `optimizeGeneticAsync` (Algoritmo Genético)

Este é um otimizador mais avançado que utiliza um algoritmo genético para explorar um espaço de soluções maior. **Desde a spec 007 o GA é determinístico**: toda a aleatoriedade vem de um PRNG semeado (`mulberry32` em `src/lib/engine/rng.ts`, semente default `DEFAULT_GA_SEED = 0x5EED2026`, parâmetro opcional `seed` no TS; mesma constante no Rust `genetic.rs`) — mesmo input → mesmo plano. Ele funciona da seguinte forma:

*   **População Inicial:** Gerada a partir de uma combinação de estratégias heurísticas.
*   **Evolução:** Através de gerações, a população de soluções (planos de corte) é aprimorada usando operadores genéticos (seleção, cruzamento, mutação).
*   **Função de Fitness:** Avalia a qualidade de cada plano de corte, geralmente baseada na área utilizada da chapa (aproveitamento) e na complexidade dos cortes.
*   **Otimização Multi-chapa:** Capaz de otimizar o corte de múltiplas chapas, deduzindo peças do inventário à medida que são utilizadas.

## 4. Estruturas de Dados Chave

### 4.1. `TreeNode` (Árvore de Corte)

A `TreeNode` representa a estrutura hierárquica dos cortes e o posicionamento das peças na chapa. É uma árvore que descreve como a chapa é dividida.

*   **`id`:** Identificador único do nó.
*   **`tipo`:** Indica o **nível de profundidade de corte** ou a **coordenada de alocação** que o algoritmo utiliza para posicionar peças ou identificar regiões. No contexto do corte guilhotina, cada letra representa um estágio sucessivo na hierarquia de cortes. Os tipos são:

    `ROOT` -> `X` (Executa um corte na vertical) -> `Y` (Executa um corte na horizontal dentro do espaço criado pelo corte X) -> `Z` (Executa um corte na vertical dentro do espaço criado pelo corte Y) / `W` (Executa um corte na horizontal dentro do espaço criado pelo corte Z) / `Q` (Executa um corte na vertical dentro do espaço criado pelo corte Z) / `R` (Executa um corte na horizontal dentro do espaço criado pelo corte R).

    **Exemplo:** Uma peça de 1000x1000 é alocada através de uma sequência de coordenadas de corte, como um nó `X` com `valor: 1000` e um nó `Y` com `valor: 1000`.
*   **`valor`:** A dimensão do corte (largura para X, altura para Y) ou a dimensão da peça/desperdício.
*   **`multi`:** Multiplicidade do nó, útil para agrupar peças idênticas ou indicar que um nó `Z` representa múltiplas peças cortadas em conjunto.
*   **`filhos`:** Array de `TreeNode`s, representando os sub-cortes ou peças resultantes.
*   **`label`:** Rótulo opcional para a peça (ex: ID do item).
*   **`transposed`:** Booleano indicando se a peça foi rotacionada.

### 4.2. `Piece` e `PieceItem`

*   **`Piece`:** Representa uma peça a ser cortada, com `w` (largura), `h` (altura), `area`. Pode incluir `count` (se for um agrupamento de peças idênticas), `label`, `labels` (para agrupamentos) e `groupedAxis`.
*   **`PieceItem`:** Representa um item do inventário de peças, com `id`, `qty` (quantidade necessária), `w`, `h`, `label` e `priority` (se deve ser priorizada na otimização).

#### ⚠️ Peça vs Grupo — a sobrecarga que gera a pior classe de bug (spec 012)

`Piece` representa DOIS conceitos com a mesma estrutura, distinguidos por `count`:

| Campo | Como **PEÇA** (`count` ausente/1) | Como **GRUPO** (`count > 1`) |
|---|---|---|
| `w`/`h` | medidas reais da peça | medidas do **AGREGADO** — de peça alguma |
| `label` | id da peça | ausente |
| `labels` | ausente | id de **cada** peça contida |
| `individualDims` | ausente | medida de cada peça ao longo de `groupedAxis`; em `"2d"` é `[cols, rows]` (contagens, não medidas) |
| `groupedAxis` | ausente | `"w"` \| `"h"` \| `"2d"` |

**Regra de ouro:** todo código que lê `p.w`/`p.h` sem antes checar `count` está
potencialmente errado para grupos. A medida real de um membro vem de
`individualDims` × a medida transversal (`p.h` para eixo `"w"`, `p.w` para `"h"`).
Ver `specs/012-qualidade-pecas-identificadas/data-model.md`.

#### Invariantes de conservação (contrato do motor — spec 012)

Sejam `I` as peças físicas oferecidas e `T` a árvore. `folhas(T)` conta `multi`:

*   **INV-1 (Conservação):** `|folhas(T)| + |remaining| == |I|`. Nunca mais.
*   **INV-2 (Fidelidade):** toda folha rotulada tem a medida REAL de uma peça de `I`, nunca a do agregado.
*   **INV-3 (Rastreabilidade):** cada rótulo aparece no máximo uma vez em `T`.
*   **INV-4 (Expansão total):** grupo de `count = n` expande em EXATAMENTE `n` folhas rotuladas.
*   **INV-5 (Não-recomposição):** grupo nunca é entrada de outro agrupamento (expande um único nível).

Validados no limite candidato→plano por `validatePlacementCandidate`
(`tree-utils.ts`, espelhado em `wasm-engine/src/tree_utils.rs`): um candidato que
viole os invariantes é DESCARTADO antes do desempate por área/compactação — senão
o candidato corrompido vence por parecer mais compacto (o bug se disfarçando de
qualidade). O GA aplica `capPhantomLeaves` como defesa equivalente no ramo evoluído.

## 5. Regras de Negócio e Restrições

*   **Corte Guilhotina:** Todos os cortes são retos e vão de uma borda à outra da chapa ou sub-chapa. Não são permitidos cortes em L ou formatos complexos.
*   **Margens (`ml`, `mr`, `mt`, `mb`):** As chapas possuem margens que reduzem a área útil (`usableW`, `usableH`).
*   **`minBreak` ("Quebra Mínima"):** A menor tira que a serra consegue cortar. Restringe o
    posicionamento no motor E, desde a spec 016, é o PISO do resíduo de correção no
    agrupamento em X (ver abaixo). É piso, nunca teto.
*   **Agrupamento em X — `consolidateColumnsX` (`tree-utils.ts`, camada de PLANO, só TS, sem
    espelho Rust):** funde colunas do `ROOT` que contêm uma peça só numa faixa
    `X(Σ colW) → Y(bandH) → Z(w_i)`, transformando N sobras estreitas no topo em UMA tira
    única (que é então preenchida com as peças restantes). Spec 015 exigia alturas IDÊNTICAS;
    a spec 016 aceita alturas PRÓXIMAS sob duas guardas:
    *   **FÍSICA:** a diferença de altura precisa ser NULA ou `>= minBreak` — a peça mais baixa
        recebe um corte de correção `Z(w) → W(h)` que preserva a sua altura ORIGINAL, e o
        resíduo criado precisa ser cortável. NUNCA iguale as alturas para "simplificar": isso
        cria peça fantasma (spec 012).
    *   **ECONÔMICA:** a fusão é descartada se encolher o maior bloco livre, medido com
        `largestFreeRect` num sub-`ROOT` contendo SÓ as colunas do conjunto (métrica LOCAL — na
        chapa inteira o `max` global mascararia a piora) e ANTES do preenchimento da tira.
    Formação de conjuntos gulosa e determinística: altura DESC, desempate pelo índice original,
    semente = a mais alta ainda livre, e a varredura de membros começa DEPOIS da semente (uma
    semente baixa não pode absorver uma coluna mais alta — diferença negativa passaria no teste
    de diferença nula).
*   **Agrupamento de Peças:** O algoritmo tenta agrupar peças com dimensões compatíveis para otimizar os cortes. Por exemplo, `groupPiecesBySameHeight` agrupa peças com a mesma altura para um corte X único, seguido de cortes Z para separar as peças individuais.
*   **Rotação de Peças:** Peças podem ser rotacionadas em 90 graus para melhor encaixe, a menos que explicitamente restrito.

