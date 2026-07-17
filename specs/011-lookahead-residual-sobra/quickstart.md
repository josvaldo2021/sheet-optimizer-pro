# Quickstart / Validação: Lookahead residual

Guia de validação. Detalhes em `tasks.md`; contrato em
[contracts/residual-lookahead-contract.md](./contracts/residual-lookahead-contract.md).

## 1. Unit do helper + seleção (TS)

```bash
npx vitest run src/test/residual-lookahead.test.ts
```

**Esperado**: casos do helper `largestFreeRect` (L1–L4) e do critério de seleção,
incluindo o **cenário-âncora "Chapa 2"** (S1): o layout escolhido deixa o maior
retângulo livre comportando a próxima peça; e o guarda-corpo (S2): entre áreas
diferentes, vence a maior.

## 2. Regressão de aproveitamento (portão)

```bash
npx vitest run src/test/heuristics-benchmark.test.ts
```

**Esperado**: **nenhuma** regressão de aproveitamento nem de nº de chapas. Se
alguma métrica **melhorar**, regravar a baseline e commitar a melhoria:

```bash
RECORD_BASELINE=1 npx vitest run src/test/heuristics-benchmark.test.ts
```

## 3. Determinismo

```bash
npx vitest run src/test/ga-determinism.test.ts
```

**Esperado**: mesmo input → mesmo plano (o novo critério é determinístico).

## 4. Paridade TS↔WASM

```bash
npm run build:wasm
npm test
```

**Esperado**: com o WASM reconstruído, TS e WASM produzem o mesmo plano nos
cenários de teste (Princípio VI). Se divergirem, o espelho Rust está incompleto.

## 5. Tipos + suíte completa

```bash
npx tsc -p tsconfig.app.json --noEmit
npm test
```

## 6. Validação manual (app, opcional)

Reproduzir o cenário da Chapa 2 (6000×3210; 2× 3748×646, 1× 5766×1618, 1×
3388×189 + uma peça que caiba no bloco `~2252×1592`), otimizar e conferir que a
próxima peça é encaixada no bloco consolidado em vez de gerar chapa/fragmento.

## Critérios de aceite mapeados

| Critério | Onde valida |
|----------|-------------|
| SC-001 (maior livre comporta próxima peça na Chapa 2) | Passo 1 (S1) e 6 |
| SC-002/SC-003 (sem regressão de chapas/aproveitamento) | Passo 2 |
| SC-004 (≥1 peça a mais ou 1 chapa a menos) | Passo 2 (Chapa 2) |
| SC-005 (determinismo) | Passo 3 |
| Paridade TS↔WASM | Passo 4 |
