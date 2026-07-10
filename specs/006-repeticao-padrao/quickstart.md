# Quickstart — Validar a maximização de repetição de padrão

Guia de validação ponta a ponta. Implementação fica em `tasks.md`.

## Pré-requisitos

- `npm install`. Motor via WASM no navegador (`npm run build:wasm` se necessário).

## 1. Módulo puro (testes determinísticos, sem UI)

```bash
npx tsc --noEmit
npm test -- pattern-repetition
```

Esperado (`src/test/pattern-repetition.test.ts`):
- **Escolha por repetição**: entre candidatos ≥ piso, vence o de maior `reps`.
- **Piso é restrição dura**: candidato de altíssima repetição mas `util < piso` NÃO é escolhido.
- **Empate**: `reps` igual → desempata por `util`; depois por `key` (estável).
- **Fallback**: nenhum candidato ≥ piso → escolhe maior `util`, `floorReached=false`.
- **`reps=0`**: quando o inventário não comporta repetição, `coverage=1`.
- **Determinismo**: mesma entrada → mesma escolha (candidatos injetados).
- **Pureza**: `remaining`/`candidate` não são mutados.

## 2. Não-regressão (opção desligada)

```bash
npm test
```

Esperado: suíte completa verde. Com `enabled=false`, `runAllSheets` segue o caminho
atual — cenários de `src/test/optimization.test.ts` inalterados (SC-003).

## 3. Sanidade na aplicação (manual)

```bash
npm run dev
```

- Cadastrar um pedido multi-chapa com um tipo de peça abundante que ladrilha bem +
  alguns tipos variados.
- **Opção desligada**: otimizar; anotar nº de padrões distintos e aproveitamento médio.
- **Opção ligada** (piso 85%): otimizar; conferir que o nº de **padrões distintos cai**
  e todos os padrões ficam ≥ 85%.
- Aumentar o piso e reotimizar: aproveitamento médio **não diminui** (SC-004).
- Conferir o **resumo de padrões**: nº de padrões distintos + chapas por padrão (SC-007).
- Reotimizar com as mesmas configurações e conferir estabilidade da escolha de padrão.

## Critérios de aceite (mapa)

| Verificação | Cobre |
| --- | --- |
| Vence maior `reps` entre ≥ piso | FR-002, FR-011, SC-001 |
| Nenhum padrão `< piso` (salvo fallback) | FR-003, SC-002 |
| `enabled=false` → idêntico ao atual | FR-005, SC-003 |
| Piso maior ⇒ aproveitamento médio não cai | SC-004 |
| Fallback sinalizado quando piso inatingível | FR-006 |
| Seleção determinística | FR-007, SC-005 |
| Resumo de padrões visível | FR-008, SC-007 |
| Padrões/chapas repetidas válidos (guilhotina) | FR-009, FR-010, SC-006 |

## Rollback

Remover o novo módulo e reverter as edições de `Index.tsx`/`SidebarSection.tsx`. Como
a opção é OFF por padrão, o risco em produção é mínimo mesmo antes do rollback.
