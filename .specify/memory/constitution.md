<!--
Sync Impact Report
==================
Version change: (template) → 1.0.0
Bump rationale: Primeira ratificação da constituição com princípios concretos
  derivados do código e da documentação existente (docs/AI_CONTEXT.md,
  docs/CONTEXT_MAP.md, CLAUDE.md). MAJOR=1 por ser a adoção inicial.

Principles defined:
  I.   Corte Guilhotina é Lei Física
  II.  Motor Puro e Agnóstico de UI
  III. Qualidade do Corte é o Objetivo Primário (NON-NEGOTIABLE)
  IV.  A Árvore de Corte é a Fonte da Verdade
  V.   Determinismo e Cobertura de Testes
  VI.  Paridade entre TypeScript e WASM

Added sections:
  - Restrições Técnicas (stack + invariantes de domínio)
  - Fluxo de Desenvolvimento e Portões de Qualidade
  - Governança

Templates / artifacts checked:
  ✅ .specify/templates/plan-template.md — "Constitution Check" é genérico, compatível
  ✅ .specify/templates/spec-template.md — sem conflito; specs permanecem livres de implementação
  ✅ .specify/templates/tasks-template.md — categorias de tarefa compatíveis (testes/regressão)
  ✅ CLAUDE.md — princípios alinhados às "Armadilhas críticas" já documentadas

Deferred TODOs: nenhum.
-->

# Sheet Optimizer Pro — Constituição

Princípios invioláveis do projeto. Todo `spec.md` e `plan.md` deve respeitá-los.
Esta constituição prevalece sobre qualquer outra prática. Uma violação só é
admissível quando justificada explicitamente na seção "Constitution Check" do
`plan.md` correspondente.

## Princípios Centrais

### I. Corte Guilhotina é Lei Física

Todo corte MUST ser reto e atravessar a chapa (ou sub-chapa) de uma borda à
outra. Não existem cortes em L, recortes internos ou formatos não retangulares.
Qualquer spec que assuma posicionamento livre (não-guilhotina) está fora do
escopo do produto e MUST ser rejeitado.

**Racional:** o produto modela uma serra de corte real (CNC/seccionadora), cujo
processo físico é estritamente guilhotinado. A árvore de corte (`TreeNode`)
codifica exatamente essa sequência de cortes de borda a borda.

### II. Motor Puro e Agnóstico de UI

O código em `src/lib/engine/**` MUST permanecer puro: recebe dados e retorna
dados (`TreeNode`, `Piece[]`). NÃO conhece React, DOM, rede ou qualquer I/O, e
NÃO produz efeitos colaterais observáveis. A UI consome o motor; o motor nunca lê
estado de UI.

**Racional:** pureza garante testes determinísticos, reutilização (inclusive pela
ponte WASM) e raciocínio local. Acoplar o motor à UI quebraria a paridade
TS↔WASM (Princípio VI) e a testabilidade (Princípio V).

### III. Qualidade do Corte é o Objetivo Primário (NON-NEGOTIABLE)

A métrica que governa decisões é o **aproveitamento de material** — menos
desperdício e menos chapas. Performance e elegância de código vêm depois.
Especificamente:

- O otimizador NUNCA MUST ser executado em produção com agrupamento desligado
  (`useGrouping=false`). Desligar agrupamento remove 50+ estratégias e despenca a
  qualidade (~9 peças/chapa vs 30+).
- Mudanças que melhoram código mas pioram aproveitamento MUST ser revertidas ou
  justificadas com dados de regressão.

### IV. A Árvore de Corte é a Fonte da Verdade

O resultado de uma otimização É a `TreeNode`. Contagem de peças, área utilizada e
extração de peças MUST derivar da árvore — NUNCA de set-difference com o
inventário original, porque peças podem estar agrupadas (`count>1`,
`individualDims`, `labels`). Invariantes:

- Folhas da árvore sempre representam peças alocadas; desperdício NUNCA é folha.
- Para contagem interna, percorrer a árvore ignorando `label` (`extractAll`);
  funções que filtram por `label` (`countAllocatedPieces`,
  `extractUsedPiecesWithContext`) retornam 0 para peças não rotuladas.

### V. Determinismo e Cobertura de Testes

O mesmo input MUST produzir o mesmo plano de corte. Toda mudança no motor MUST
ser coberta por testes de regressão em `src/test/` (vitest). Componentes que
introduzem aleatoriedade (ex.: algoritmo genético) MUST especificar como o
comportamento é tornado reprodutível ou tolerado nos testes (semente fixa,
asserts sobre limites, etc.).

### VI. Paridade entre TypeScript e WASM

Existe uma implementação TypeScript de referência e uma ponte WASM;
`engine-adapter.ts` despacha entre as duas. Para o mesmo input, ambas MUST
produzir resultados equivalentes. Uma mudança de comportamento no motor vale para
as duas implementações; divergências são bugs e MUST ser tratadas como tal.

## Restrições Técnicas

- **Stack:** SPA React + TypeScript, Vite, Tailwind + shadcn/ui. Motor de
  otimização em TypeScript puro (`src/lib/engine/`), com ponte WASM.
- **Invariantes de domínio:** chapas têm margens (`ml`, `mr`, `mt`, `mb`) que
  reduzem a área útil (`usableW`, `usableH`); `minBreak` é a restrição mínima de
  corte; peças podem ser rotacionadas 90° salvo restrição explícita.
- **Economia de contexto:** specs e docs (`docs/AI_CONTEXT.md`,
  `docs/CONTEXT_MAP.md`) existem para evitar leitura de arquivos grandes e
  prevenir alucinação. Mantê-los concisos e apontando para o arquivo certo faz
  parte do contrato. Não modificar `src/components/ui/**` sem pedido explícito.

## Fluxo de Desenvolvimento e Portões de Qualidade

- Toda feature nova segue o fluxo Spec Kit: `/speckit-specify` → (`/speckit-clarify`)
  → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`.
- `spec.md` descreve O QUÊ e POR QUÊ — MUST permanecer livre de detalhes de
  implementação (nomes de função, arquivos, estruturas). Implementação é `plan.md`.
- Portões antes de mesclar: `npm test` verde, `npx tsc --noEmit` limpo, e nenhuma
  regressão de aproveitamento em cenários de `src/test/`.
- Specs de comportamento já existente são carimbados como retroativos: descrevem
  o que o sistema faz hoje, não trabalho a fazer.

## Governança

Esta constituição prevalece sobre todas as outras práticas. Emendas MUST ser
documentadas neste arquivo, com versionamento semântico e data de alteração:

- **MAJOR:** remoção ou redefinição incompatível de um princípio/governança.
- **MINOR:** adição de princípio/seção ou expansão material de orientação.
- **PATCH:** esclarecimentos, correções de texto, refinamentos não semânticos.

Todo `plan.md` MUST conter uma verificação de conformidade ("Constitution
Check"); complexidade ou violação MUST ser justificada explicitamente ali. Em
caso de conflito entre um spec e esta constituição, a constituição vence até que
uma emenda seja ratificada.

**Version**: 1.0.0 | **Ratified**: 2026-06-15 | **Last Amended**: 2026-06-15
