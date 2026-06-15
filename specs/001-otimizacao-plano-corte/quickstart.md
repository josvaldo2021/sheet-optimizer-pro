# Quickstart — Validar o Motor de Otimização

Guia de validação retroativo. Mostra como exercitar e verificar o motor sem
duplicar detalhes de implementação (ver [contracts/engine-api.md](./contracts/engine-api.md)
e [data-model.md](./data-model.md)).

## Pré-requisitos

```bash
npm install
```

## Rodar a suíte de testes

```bash
npm test                 # vitest — testes de regressão do motor
npx tsc --noEmit         # checagem de tipos
```

Cenários de referência cobertos em `src/test/`:
- `optimization.test.ts` — cenários complexos de otimização.
- `regroup-waste.test.ts` — reagrupamento de sobras e edge cases.

## Validação manual rápida (uso do contrato)

Importar do barrel `src/lib/cnc-engine.ts`:

```ts
import { optimizeV6, calcPlacedArea } from "@/lib/cnc-engine";

const pieces = [
  { w: 400, h: 300, area: 120000, label: "A" },
  { w: 400, h: 300, area: 120000, label: "B" },
];
const { tree, remaining } = optimizeV6(pieces, 2750, 1830, 0);
const aproveitamento = calcPlacedArea(tree) / (2750 * 1830);
```

## O que verificar (mapeado aos critérios do spec)

| Verificação | Critério |
| ----------- | -------- |
| Todas as peças que cabem ficam alocadas; `remaining` vazio | FR-003, SC-002 |
| Nenhuma alocação fora das margens / sem sobreposição | SC-003 |
| Aproveitamento alto; com agrupamento, 30+ peças/chapa em cenários densos | SC-001 |
| Rodar duas vezes o mesmo input → planos idênticos (`optimizeV6`) | FR-011, SC-004 |
| Lista vazia → raiz vazia, sem erro | FR-012 (edge case) |
| Peça maior que a chapa → permanece em `remaining`, sem travar | FR-012 (edge case) |

## Multi-chapa

A orquestração multi-chapa é exercitada pela UI (`runAllSheets` em `Index.tsx`):
rode `npm run dev`, cadastre peças que excedam uma chapa e confirme que o número
de chapas e a conservação de peças (FR-007, SC-002) se mantêm.
