# Quickstart / Validação: Medida exclusiva por chapa e prioritária

Guia de validação fim-a-fim. Detalhes de implementação em `tasks.md`; contrato em
[contracts/exclusive-priority-contract.md](./contracts/exclusive-priority-contract.md).

## 1. Testes de unidade do módulo puro

```bash
npx vitest run src/test/unique-per-sheet.test.ts
```

**Esperado**: casos E1–E6 verdes (seleção da marcada, fatia exclusiva com ≤1
marcada, marcada primeiro, chave de cache, e a simulação com SC-001/SC-002/
conservação). Os casos C1–C5 da 009 (funções `capForSheet` etc.) continuam
verdes; o antigo caso de coexistência foi atualizado para exclusividade.

## 2. Regressão: planos sem marcação inalterados

```bash
npx vitest run src/test/heuristics-benchmark.test.ts
```

**Esperado**: baseline intacta. Sem peças marcadas, `buildSheetInvExclusive` é
identidade sobre as não marcadas → plano bit-a-bit igual (Princípio III).

## 3. Suíte completa + tipos

```bash
npm test
npx tsc -p tsconfig.app.json --noEmit
```

**Esperado**: suíte verde (julgar pelo sumário — flake do vitest-worker) e tipos
limpos.

## 4. Validação manual na UI (app real)

Rodar o app e:

1. Cadastrar peças, incluindo **duas medidas diferentes** A e B, e marcá-las
   ("1×"), mais várias não marcadas.
2. Gerar o plano multi-chapa.
3. **Esperado**:
   - Nenhuma chapa contém 2+ peças marcadas no total (nem A+B, nem A+A) — SC-001.
   - As **primeiras chapas** contêm 1 peça marcada cada, até esgotar as marcadas
     — SC-002.
   - As não marcadas preenchem o restante — SC-004.
   - Desmarcar e replanejar remove exclusividade/prioridade — US3.

## 5. Interações (specs 006 / 008)

- **Save layout ×N** e **repetição de padrão**: nenhuma chapa produzida contém
  2+ marcadas (FR-009); a replicação de uma chapa-base com 1 marcada gera cópias
  com 1 marcada cada.

## Critérios de aceite mapeados

| Critério | Onde valida |
|----------|-------------|
| SC-001 (≤1 marcada total/chapa) | Passos 1 (E6a) e 4 |
| SC-002 (primeiras N chapas 1 cada) | Passos 1 (E6b) e 4 |
| SC-003 (marcada nunca vira sobra) | Passo 1 (E6c) |
| SC-004 (não marcadas normais) | Passos 2 e 4 |
| SC-005/SC-006 (marcar/desmarcar, persistência) | Passo 4 |
| FR-009 (interação 006/008) | Passo 5 |
