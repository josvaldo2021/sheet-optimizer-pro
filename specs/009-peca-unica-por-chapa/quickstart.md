# Quickstart / Validação: Peça única por chapa

Guia para validar a feature fim-a-fim. Detalhes de implementação ficam em
`tasks.md`; contrato do módulo puro em
[contracts/unique-per-sheet-contract.md](./contracts/unique-per-sheet-contract.md).

## Pré-requisitos

- `npm install` já feito.
- Node/vitest disponíveis (`npm test`).

## 1. Testes de unidade do módulo puro

```bash
npx vitest run src/test/unique-per-sheet.test.ts
```

**Esperado**: casos C1..C7 do contrato verdes — capping por linha, chave de cache
consistente, contagem por árvore e conservação (nenhuma chapa com >1 de uma linha
marcada; nada de peça marcada vira sobra; estoque ≥ chapas ⇒ 1 por chapa).

## 2. Regressão: planos sem marcação inalterados

```bash
npx vitest run src/test/heuristics-benchmark.test.ts
```

**Esperado**: baseline intacta. Nenhuma peça marcada nos cenários ⇒ `capForSheet`
é identidade e o plano é bit-a-bit o mesmo de antes (Princípio III). Se falhar por
regressão de aproveitamento, a integração vazou para o caminho sem marcação.

## 3. Suíte completa + tipos

```bash
npm test
npx tsc -p tsconfig.app.json --noEmit
```

**Esperado**: suíte verde (julgar pelo sumário; ver nota de flake do vitest-worker)
e checagem de tipos limpa com o novo campo `uniquePerSheet`.

## 4. Validação manual na UI (opcional)

Rodar o app (porta 8080/8081) e:

1. Cadastrar algumas peças, incluindo uma linha com `qty` alto (ex.: 6).
2. Marcar essa linha como **"não repetir na chapa"** (controle na lista de peças).
3. Gerar o plano multi-chapa.
4. **Esperado**:
   - Nenhuma chapa exibe 2+ peças da linha marcada (SC-001).
   - Se o estoque marcado ≥ nº de chapas, cada chapa mostra exatamente 1 (SC-002).
   - As demais peças preenchem o restante normalmente (SC-003).
   - Desmarcar e replanejar volta a permitir repetição (US3).
   - Marcação persiste após replanejamentos (SC-005).

## 5. Interações (specs 006 / 008)

- **Save layout ×N** (spec 008) de um layout contendo a linha marcada: cada cópia
  contém no máximo 1 peça marcada; reservas/`effectiveInventory` respeitam o
  estoque marcado (FR-010).
- **Repetição de padrão** (spec 006): a repetição de um padrão com linha marcada é
  limitada pelo estoque; nenhuma chapa replicada excede 1 peça marcada.

## Critérios de aceite mapeados

| Critério | Onde valida |
|----------|-------------|
| SC-001 (≤1/chapa em 100% das chapas) | Passos 1 (C7a) e 4 |
| SC-002 (estoque ≥ chapas ⇒ 1/chapa) | Passos 1 (C7c) e 4 |
| SC-003 (não marcadas normais) | Passos 2 e 4 |
| SC-004 (marcar/desmarcar em 1 ação) | Passo 4 |
| SC-005 (marcação persiste) | Passo 4 |
| FR-010 (interação 006/008) | Passo 5 |
