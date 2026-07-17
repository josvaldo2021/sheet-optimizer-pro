# Quickstart: validar a spec 012 ponta a ponta

**Fase 1** | **Data**: 2026-07-16 | **Plan**: [plan.md](./plan.md)

Guia de validação. Invariantes em [data-model.md](./data-model.md); cláusulas em
[contracts/grouped-expansion-contract.md](./contracts/grouped-expansion-contract.md).

## Pré-requisitos

```bash
npm install
```

## Passo 0 — Reproduzir a falha (antes de corrigir)

O bug está **encoberto** pelo guard `hasLabels` (`optimizer.ts`). Para vê-lo, o guard
precisa ser desligado temporariamente — os gates então falham, e é isso que a Etapa 1
resolve.

```bash
# Com o guard removido temporariamente em optimizer.ts:
npx vitest run src/test/ga-phantom.test.ts     # ESPERADO FALHAR: fantasma 250x800
npx vitest run src/test/quantity-groups.test.ts # ESPERADO FALHAR: 429 no lugar de 385
```

**Resultado esperado hoje** (é o bug):

- `ga-phantom`: `["chapa 2: 250x800 (label __19)", "chapa 2: 250x800 (label __12)"]`
- `quantity-groups`: `expected 429 to be 385`

> Se estes **passarem** com o guard desligado, a Etapa 1 está concluída.

## Passo 1 — Conservação (US1, gate da Etapa 1)

```bash
npx vitest run src/test/quantity-groups.test.ts   # INV-1: 385 entram, 385 saem
npx vitest run src/test/ga-phantom.test.ts        # INV-2: nenhuma folha com medida inexistente
npx vitest run src/test/grouped-expansion.test.ts # C1-C5, V1-V4 (teste novo)
```

**Aprovado quando**: verdes **com o agrupamento ligado** para peças rotuladas. É a
única condição que autoriza a Etapa 2.

## Passo 2 — Cenário-âncora do usuário (US2, SC-004)

A chapa que originou a spec: 4× 2473×1262 + 2× 2634×406 em 5980×3190, **com rótulos**.

**Aprovado quando**: as 6 peças alocadas na mesma chapa, cada folha com o seu rótulo,
`remaining` vazio, e toda folha com medida existente no inventário.

> Referência de comportamento medido: **sem** rótulos o motor já resolve esta chapa
> (todas as 6, `remaining: 0`). Com rótulos, hoje, cai no ramo pobre. A spec 012 é
> aprovada quando **rotulado e anônimo entregam o mesmo resultado** (SC-006).

## Passo 3 — Sem regressão de aproveitamento (FR-006, SC-005)

```bash
npx vitest run src/test/heuristics-benchmark.test.ts
```

- **Verde** ⇒ sem regressão.
- **Melhorou** ⇒ regravar a referência e commitar o novo baseline:
  ```bash
  RECORD_BASELINE=1 npx vitest run src/test/heuristics-benchmark.test.ts
  ```
- **Piorou** ⇒ **falha**. Investigar antes de seguir (a spec exige melhora, não só
  ausência de piora).

## Passo 4 — Determinismo (SC-007)

```bash
npx vitest run src/test/ga-determinism.test.ts
```

## Passo 5 — Suíte completa e tipos

```bash
npm test
npx tsc -p tsconfig.app.json --noEmit
```

> **Nota sobre o `npm test`**: o exit code pode ser 1 mesmo com tudo passando (flake
> conhecido do worker do vitest). Julgar pelo **sumário**, não pelo código de saída.

## Passo 6 — Espera suportável (US3, SC-008)

Medir o tempo do plano de um trabalho típico no app real:

```bash
npm run dev   # porta 8080; se ocupada, Vite cai para 8081 — ler do output
```

Importar/cadastrar um trabalho de centenas de peças e usar **OTIMIZAR TODAS AS
CHAPAS**.

**Aprovado quando**: conclui em ~2 min com progresso visível. **Não otimizar** —
FR-008 aceita o custo explicitamente.

## Passo 7 — Paridade TS ↔ WASM (Princípio VI)

```bash
npm run build:wasm
```

**Aprovado quando**: para o mesmo input, TS e WASM produzem resultados equivalentes.
Divergência é bug, não tolerância.

## Critério de pronto

| # | Verificação | Onde |
|---|---|---|
| 1 | Conservação com agrupamento ligado | Passo 1 |
| 2 | Zero fantasmas com agrupamento ligado | Passo 1 |
| 3 | Cenário-âncora: 6 peças, todas rotuladas | Passo 2 |
| 4 | Rotulado ≥ anônimo em aproveitamento | Passo 2 |
| 5 | Benchmark sem regressão (ou baseline regravado) | Passo 3 |
| 6 | Determinismo mantido | Passo 4 |
| 7 | Suíte verde + tipos limpos | Passo 5 |
| 8 | Plano típico em ~2 min com progresso | Passo 6 |
| 9 | Paridade TS ↔ WASM | Passo 7 |
| 10 | Guard `hasLabels` removido | consequência das Etapas 1-2 |
