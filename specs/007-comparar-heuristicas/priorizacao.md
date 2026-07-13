# Priorização de Oportunidades de Evolução — Feature 007

**Data**: 2026-07-13 | **Base**: [relatorio-comparativo.md](./relatorio-comparativo.md) +
baseline do harness (`src/test/fixtures/benchmark-baseline.json`, versão `baseline-2026-07`:
83,68% / 74,22% / 80,16% / 68,81% / 80,00% em 2/4/5/3/4 chapas).

Regra de adoção: [contrato do benchmark](./contracts/benchmark-contract.md) §3 — nenhuma
oportunidade é "adotada" sem passar o gate de medição; reprovadas ficam registradas aqui
(`resultadoMedicao`), cumprindo FR-005..FR-007.

## Ranking

### C1 — PRNG semeado no GA (de #10 AG) — **status: selecionada-fase-b**

- **Técnicas**: #10 (ressalva de determinismo).
- **Impacto esperado**: neutro em aproveitamento; **crítico em reprodutibilidade** — o
  caminho principal de produção (`optimizeGeneticAsync`) usa `Math.random` sem semente e
  fere o Princípio V da constituição (mesmo input deve gerar o mesmo plano). Também é
  pré-requisito para qualquer medição confiável do GA no benchmark e para C3.
- **Compatibilidade**: total — não altera guilhotina, margens, minBreak nem rotação;
  troca apenas a fonte de aleatoriedade por PRNG determinístico com semente fixa
  (parâmetro opcional, default fixo; API pública preservada).
- **Esforço**: baixo (TS `genetic.ts` + Rust `genetic.rs` + teste de determinismo).
- **Critério de aprovação (exceção do contrato §3.2)**: teste "mesmo input 2× → planos
  idênticos" passa; nenhum cenário do baseline regride.
- **resultadoMedicao**: ✅ **APROVADA (2026-07-13)** — `src/test/ga-determinism.test.ts`
  3/3 verde (mesmo input 2× → planos idênticos, com semente default e explícita);
  harness de benchmark sem regressão (5/5 cenários idênticos ao baseline);
  implementada em TS (`rng.ts` + `genetic.ts`, 23 usos de `Math.random` → `rand()`)
  e Rust (`genetic.rs`, mulberry32 idêntico, semente `0x5EED2026` nos dois lados).

### C2 — Agrupamento best-fit de faixa, BFDH-like (de #4 BFDH + #5 Best-Fit) — **status: selecionada-fase-b**

- **Técnicas**: #4 (parcial), #5 (parcial).
- **Impacto esperado**: médio — em mixes heterogêneos de mesma altura, escolher a faixa
  aberta com menor sobra residual (em vez do preenchimento sequencial do
  `groupPiecesFillRow`) tende a fechar faixas mais justas e liberar sobras maiores e
  mais aproveitáveis. Cenários-alvo do baseline: `misto-realista` (80,16%) e
  `pequenas-em-volume` (83,68%).
- **Compatibilidade**: total — agrupa apenas peças de altura idêntica (sem "dimensão
  fantasma"), produz grupos guilhotináveis idênticos em forma aos do FillRow; entra como
  candidato adicional no torneio (monotonicidade: nunca piora o melhor).
- **Descoberta que condiciona o desenho** (relatório, descoberta nº 2): produção usa o
  caminho **rotulado**, onde o torneio tem só 2 variantes; e os modos de agrupamento de
  produção vivem no GA. Logo C2 entra em **três pontos**: (i) ramo rotulado do torneio
  do `optimizeV6` (medível pelo harness), (ii) ramo sem labels (consertado nesta
  feature), (iii) novo `GROUPING_MODE` do GA (efeito em produção).
- **Esforço**: médio (TS `grouping.ts` + `optimizer.ts` + `genetic.ts`; Rust espelhado).
- **resultadoMedicao**: ❌ **REPROVADA (2026-07-13)** — implementada nos dois motores
  (variante `bestFitRows` no torneio rotulado/sem labels + modo 15 do GA) e medida:
  - Harness `optimizeV6` (5 cenários): aproveitamento/chapas **idênticos** ao baseline
    (83,68/2 · 74,22/4 · 80,16/5 · 68,81/3 · 80,00/4) — o critério de empate preserva o
    incumbente; best-fit nunca superou as variantes existentes.
  - A/B no GA determinístico (modo 15 vs sem, 1ª chapa, semente default):
    `misto-realista` 98,35% = 98,35%; `pequenas-em-volume` 95,89% = 95,89% — o vencedor
    vem da população semeada pelas heurísticas; o modo extra não alterou o resultado.
  - **Decisão**: revertida conforme contrato §3 (manteria ~3× o custo do torneio
    rotulado sem ganho demonstrado). Hipótese de retomada: só faz sentido reavaliar
    junto com C3/C4, quando a *construção* da faixa deixar de ser dominada pelo
    pós-processamento (`fillVoids`/`postOptimizeRegroup`) que já compacta os layouts.

### C3 — GRASP determinístico (de #11) — **status: condicional**

- **Impacto esperado**: médio/alto em cenários oversubscritos (evidência spec 005: a
  ordem de entrada decide o que entra). Multi-start com perturbação semeada da ordem +
  busca local por swaps, reusando `runPlacement`.
- **Compatibilidade**: exige C1 (infra de PRNG semeado) para respeitar o Princípio V.
- **Esforço**: médio/alto; custo de CPU multiplicativo (N starts × torneio) — risco para
  o orçamento da suíte (~50s hoje) e para a responsividade do app.
- **Decisão desta rodada**: **não implementar agora** — condicionada aos resultados de
  C1/C2 e a uma spec própria de orçamento de tempo. Fica registrada com desenho básico
  para retomada.
- **Nota pós-medição (2026-07-13)**: a reprovação de C2 reforça o desenho do C3 — no
  caminho medido, o torneio semeado + pós-processamento já domina variações
  construtivas locais; a margem restante está em explorar a *ordem* das peças
  (multi-start GRASP) ou a própria árvore (C4), não em mais uma variante gulosa.

### C4 — Busca em árvore com lookahead/beam (de #9) — **status: futura**

- **Impacto esperado**: alto (é a técnica com maior teto teórico — explora a árvore de
  cortes como espaço de busca, não só como saída).
- **Esforço**: alto; risco real de latência interativa; exigiria poda cuidadosa e
  provavelmente confinamento ao WASM.
- **Decisão**: registrar como spec futura; fora da Fase B.

## Descartadas (com motivo, FR-003)

| Técnica | Motivo do descarte |
| --- | --- |
| #12 Busca Tabu | Papel de explorador global já ocupado pelo GA de produção; segundo explorador estocástico duplica CPU no navegador com ganho incremental improvável. Reavaliar só se o GA estagnar em benchmarks futuros. |
| #13 Simulated Annealing | Mesma análise do #12 — sobreposição funcional com o GA. |
| #15 Geração de colunas | Esforço desproporcional (solver LP + reformulação multi-chapa) para SPA interativa; parentesco conceitual já capturado pela repetição de padrão (spec 006). Reavaliar em contexto de lotes industriais muito grandes. |
| #3 NFDH | Dominada pelo equivalente FFDH já presente no torneio — adotar só pioraria ou empataria. |
| #1 BL/BLF | Não aplicável (viola corte guilhotina — Princípio I). |

## Higiene de engenharia (fora de escopo de aproveitamento, registrado)

- **Portão de tipos no-op**: `npx tsc --noEmit` na raiz não checa nada
  (`tsconfig.json` com `files: []` + references). Recomendação: usar
  `npx tsc -p tsconfig.app.json --noEmit` nos portões de qualidade e no CI.
  (Relatório, descoberta nº 3.)
- **Erros de tipo pré-existentes revelados** (2026-07-13): a checagem real
  (`tsc -p tsconfig.app.json --noEmit`) acusa 10 erros, todos em UI —
  `LayoutSummary.tsx` (conflito de import), `OptimizationPanel.tsx` (prop
  `onPrintLayout` duplicada com tipos divergentes), `Index.tsx` (campo
  `deductions` fora do tipo de `chapaList`, atributo JSX duplicado). Nenhum em
  `src/lib/engine/**` ou `src/test/**`. Fora do escopo desta feature (UI);
  corrigir em manutenção própria antes de ativar o gate no CI.
- **Reprodutibilidade dos ids de nó**: `tree-utils.ts` gera `id` com `Math.random` —
  não afeta o plano de corte (ids são identidade de nó, não geometria), por isso fora
  do escopo de C1; normalização de ids já é feita pelo harness na comparação.

## Rastreabilidade

- FR-003: ranking com impacto/compatibilidade/esforço/status acima; descartes
  justificados. SC-002: 4 oportunidades ranqueadas (≥ 3). ✔
- Toda técnica `ausente`/`parcial` do relatório está mapeada: #4/#5→C2, #9→C4, #10→C1,
  #11→C3, #12/#13/#15→descartadas. Técnicas com aleatoriedade (C1, C3) têm mecanismo de
  reprodutibilidade explícito (PRNG com semente fixa). ✔
