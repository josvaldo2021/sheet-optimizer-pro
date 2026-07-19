# Quickstart — Validação: Corte da faixa lateral primeiro

Guia de validação end-to-end. Prova ESTRUTURA + conservação + paridade nos testes, e o
VALOR (nº de chapas) só no app (lição: benchmark/unit não pegam o âncora).

## Pré-requisitos

- `npm install`; motor TS e WASM buildados. **Rebuild wasm obrigatório** após espelhar
  a mudança no Rust: `npm run build:wasm`.
- Fixture real na raiz: `of_geral_parcial (3).xls` (âncora; não versionar).

## 1. Estrutura + conservação + determinismo (TS)

```bash
npx vitest run src/test/lateral-cut.test.ts
```

**Esperado**: L1-L5 verdes. Em especial:
- L1: no cenário-âncora, a faixa lateral vira `Z(926)` de altura cheia (não `Q`) e
  recebe ≥1 peça.
- L3: sem faixa aproveitável ⇒ árvore idêntica ao baseline (gate / não-regressão).
- L4: `validatePlacementCandidate` = true (conservação, zero fantasma).

## 2. Paridade TS↔WASM (Princípio VI)

```bash
npm run build:wasm
npx vitest run src/test/wasm-parity.test.ts
```

**Esperado**: L6 — TS e WASM com a MESMA contagem alocada, MESMO multiset de medidas e a
MESMA estrutura da faixa (Z nos dois). Se divergir: checar `normalizeTree` TS/Rust e
iteração de HashMap sem ordem (memória `wasm-hashmap-determinismo`).

## 3. Não-regressão global (guarda)

```bash
npx vitest run src/test/heuristics-benchmark.test.ts
```

**Esperado**: L7 — todos os cenários com nº de chapas ≤ baseline e aproveitamento ≥
baseline. Se MELHORAR: regravar baseline (`RECORD_BASELINE=1`) e registrar no PR.

## 4. Portões de qualidade

```bash
npx tsc -p tsconfig.app.json --noEmit
npm test
```

> `npm test` pode sair 1 com tudo passando (flake do worker do vitest) — julgar pelo
> sumário.

## 5. PROVA DE VALOR — medição no APP (obrigatória, SC-001/002)

O nº de chapas do âncora só se prova no app (WASM). Receita (memória
`playwright-run-recipe`) ou manual:

1. `npm run dev` (porta 8080/8081).
2. Importar `of_geral_parcial (3).xls`.
3. Gerar o plano (WASM padrão).
4. Conferir:
   - A faixa lateral ~926×1233 (chapas de jumbo) agora aparece **preenchida** com peças,
     não vazia.
   - **Nº de chapas ≤ atual** (o estado atual do plano dá 32) e/ou aproveitamento maior.
   - 268/268 peças, sem peça fantasma.
5. Rodar 2× ⇒ mesmo resultado (determinismo).

> Se a faixa continuar vazia no app: a variante não está sendo escolhida (medir a
> área do candidato) OU o `Q` profundo vem de outro caminho não coberto (voltar ao
> R1 e cobrir o caminho certo — eco da spec 013).
