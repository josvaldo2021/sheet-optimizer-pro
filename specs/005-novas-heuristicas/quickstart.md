# Quickstart — Validar as duas novas heurísticas

Guia de validação ponta a ponta. Não contém a implementação (isso é `tasks.md`);
descreve como provar que a feature funciona e não regride.

## Pré-requisitos

- Node instalado; dependências via `npm install`.
- Toolchain Rust + `wasm-pack` para reconstruir o WASM (ver script de build
  portátil já existente no repo — commit `aa949bb`).

## Passos de validação

### 1. Motor TypeScript (referência)

```bash
npx tsc --noEmit      # tipos limpos
npm test              # suíte vitest verde (inclui novos testes desta feature)
```

Esperado:
- `getSortStrategies().length === 14`.
- Cenário-alvo: aproveitamento **≥** baseline em todos; **>** em ao menos um.
- Nenhum cenário de regressão existente piora (área e nº de chapas iguais ou melhores).

### 2. Paridade TS ↔ WASM

```bash
# reconstruir o WASM após editar wasm-engine/src/optimizer.rs
# (usar o script de build do repo), depois:
npm test              # o teste de paridade compara optimizeV6 TS vs WASM
```

Esperado:
- Para as fixtures, plano TS e plano WASM são equivalentes (mesma área ocupada e
  mesma contagem de peças alocadas) — Princípio VI.

### 3. Verificação de validade física (guilhotina)

Coberto pelos asserts da suíte sobre a `TreeNode` resultante:
- Todos os cortes retos de borda a borda; margens e `minBreak` respeitados.
- Folhas representam peças alocadas; desperdício nunca é folha (Princípio IV).

### 4. Sanidade na aplicação (opcional, manual)

```bash
npm run dev
```

- Cadastrar um conjunto que hoje deixa desperdício evitável (cenário-alvo).
- Otimizar e conferir visualmente no `SheetViewer` que o layout melhorou ou empatou.
- Repetir a otimização e confirmar plano idêntico (determinismo).

## Critérios de aceite (mapeados ao spec)

| Verificação | Cobre |
| --- | --- |
| `length === 14` / `NUM_SORT_STRATEGIES === 14` | FR-001 |
| Estratégias ativas sem configuração | FR-002 |
| Asserts guilhotina/margens/minBreak | FR-003, SC-003 |
| Seleção determinística, empate mantém incumbente | FR-004, FR-006, SC-004 |
| Baseline: ≥ em todos, > em ao menos um alvo | FR-005, SC-001, SC-002 |
| Teste de paridade TS↔WASM | FR-007, SC-005 |
| Rotação tratada como hoje (variante `rotatedPieces`) | FR-008 |
| Novos testes de regressão presentes e verdes | FR-009 |
| Tempo de otimização sem aumento perceptível | SC-006 |

## Rollback

Reverter as adições nos dois arquivos (`optimizer.ts`, `optimizer.rs`) restaura o
comportamento anterior — a mudança é puramente aditiva (índices 12–13). Rebuild do
WASM para efetivar.
