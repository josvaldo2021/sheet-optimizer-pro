# Phase 0 — Research: Otimização de Plano de Corte

Documento retroativo: registra as decisões de design **já tomadas no código**, em
formato Decisão / Racional / Alternativas. Não há `NEEDS CLARIFICATION` pendentes
(o comportamento existe e está coberto por testes).

## D1 — Representação do resultado como árvore guilhotina (`TreeNode`)

- **Decisão**: o plano de corte é uma árvore de cortes com tipos
  `ROOT → X → Y → Z → W/Q/R`, onde cada nível é um corte reto sucessivo.
- **Racional**: corte guilhotina (Princípio I) é naturalmente hierárquico; a
  árvore torna contagem, área e desperdício deriváveis por travessia (Princípio IV).
- **Alternativas**: grade de coordenadas livres (rejeitada — permitiria
  posicionamento não-guilhotina); lista plana de retângulos (rejeitada — perde a
  hierarquia de cortes necessária para a serra).

## D2 — Duas entradas de otimização: heurística e genética

- **Decisão**: `optimizeV6` (heurístico, síncrono) e `optimizeGeneticAsync` (GA,
  assíncrono com progresso). A UI usa o GA para multi-chapa.
- **Racional**: a heurística é rápida e determinística e alimenta a população
  inicial do GA; o GA explora mais o espaço de soluções e melhora o aproveitamento.
- **Alternativas**: só heurística (aproveitamento menor em casos difíceis); só GA
  (mais lento e sem semente boa de partida).

## D3 — Agrupamento sempre ativo

- **Decisão**: o agrupamento de peças (~20 estratégias em `grouping.ts`) é parte
  integral do `optimizeV6`; `useGrouping=false` só existe para comparação em teste.
- **Racional**: desligar agrupamento remove 50+ estratégias e despenca a qualidade
  (~9 peças/chapa vs 30+) — viola o Princípio III.
- **Alternativas**: agrupamento opcional em produção (rejeitada por regressão de
  qualidade comprovada).

## D4 — Paridade TypeScript ↔ WASM via adapter

- **Decisão**: `engine-adapter.ts` tenta o WASM e cai para a implementação TS de
  referência em caso de erro; a flag `useWasmEngine` (localStorage) controla o uso.
- **Racional**: WASM dá performance; o TS é a referência testável e o fallback de
  segurança. Ambos devem produzir resultados equivalentes (Princípio VI).
- **Alternativas**: só TS (mais lento); só WASM (sem fallback, mais frágil e
  difícil de testar em vitest).

## D5 — Multi-chapa na camada de UI, não no motor

- **Decisão**: `runAllSheets` (em `Index.tsx`) chama o otimizador em loop, gerando
  rótulos únicos por instância de peça (`uid`), deduzindo o que foi alocado a cada
  chapa, até esvaziar o inventário (teto `maxSheets`).
- **Racional**: o loop coordena progresso e estado de UI; manter isso fora do motor
  preserva a pureza (Princípio II). Rótulos únicos garantem rastreabilidade na
  árvore (Princípio IV).
- **Alternativas**: multi-chapa dentro do motor (acoplaria o motor a progresso/UI);
  set-difference com o inventário original (rejeitada — peças podem estar agrupadas).

## D6 — Pós-processamento e preenchimento de vazios

- **Decisão**: após a alocação principal, `normalizeTree`, `postOptimizeRegroup` e
  `fillVoids` consolidam sobras e aproveitam espaços livres com peças restantes.
- **Racional**: melhora o aproveitamento final sem violar o corte guilhotina.
- **Alternativas**: aceitar o resultado bruto da heurística (mais desperdício).
