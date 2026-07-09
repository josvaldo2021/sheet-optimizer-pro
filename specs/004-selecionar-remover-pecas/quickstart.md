# Quickstart — Validação: Seleção e Remoção de Peças

**Feature**: `004-selecionar-remover-pecas`

Guia de validação ponta a ponta. Detalhes de design em [plan.md](./plan.md),
contratos em [contracts/ui-selection-removal.md](./contracts/ui-selection-removal.md).

## Pré-requisitos

```bash
npm install        # se ainda não instalado
npm run dev        # abre a SPA (Vite)
```

## Portões automáticos (obrigatórios antes de mesclar)

```bash
npm test           # vitest — inclui novo src/test/remove-piece.test.ts
npx tsc --noEmit   # tipos limpos
```

Os testes novos devem cobrir: `extractLeafPieces`/`previewRemoval` (contagem com
`multi`, sub-cortes aninhados, peças sem label) e `restorePiecesToInventory`
(match por label, fallback com rotação, recriação de item zerado, peça sem label
ignorada).

## Cenários manuais

### V1 — Remoção por botão (US1/P1)

1. Cadastre peças e monte um layout (ex.: `X600`, `Y400`, `Z300`) ou rode uma otimização.
2. Clique em uma peça no viewer → deve surgir a barra de seleção com tipo/dimensões e botão "🗑 Remover N peça(s)".
3. Clique no botão → peça some, aproveitamento/área atualizam, seleção volta para a chapa.
4. **Esperado**: fluxo completo sem tocar na barra de comandos.

### V2 — Remoção por teclado (US1)

1. Selecione uma peça e pressione `Delete` (com o foco fora do input de comando) → peça removida.
2. Clique no input de comando, digite algo e pressione `Backspace` → apaga texto, **não** remove peça.
3. Sem nenhuma peça selecionada, pressione `Delete` → nada acontece, sem erro.

### V3 — Feedback de seleção (US2/P2)

1. Clique em peças diferentes → destaque migra; barra mostra dados da peça clicada (dimensões e etiqueta quando houver).
2. Selecione um recorte com multiplicidade (`M3Z200`) ou com sub-cortes → botão informa o total de peças afetadas (ex.: "Remover 3 peça(s)").
3. Pressione `Esc` (fora de inputs) ou clique em área vazia da chapa → seleção limpa, barra some.
4. Clique de novo na peça já selecionada → a seleção sobe para o recorte que a contém (Z → Y → X e volta à peça); o botão "⬆ Recorte pai" na barra faz o mesmo.
5. Clique na sobra de um recorte → seleciona o recorte diretamente (ex.: sobra no topo de uma coluna seleciona a coluna X; coluna criada com `X600` sem peças é selecionável clicando nela).

### V4 — Consistência de inventário (US3/P3)

1. Cadastre um item com qtd 10 e etiqueta; monte layout com algumas unidades; **salve o layout** (deduz inventário).
2. Reabra a chapa salva (modo edição de chapa existente), selecione uma peça etiquetada e remova.
3. **Esperado**: qtd pendente do item aumenta na mesma medida (inclui peças de sub-cortes removidos juntos). Item que tinha zerado reaparece na lista.
4. Em um layout **novo (não salvo)**, remova uma peça → inventário **não** muda (nada havia sido deduzido).

### V5 — Compatibilidade com comando `U` (FR-010 / SC-002)

1. Selecione uma peça e digite `U` + Enter na barra de comandos.
2. **Esperado**: mesmo resultado do botão/tecla (mesma árvore final, mesma devolução de inventário quando aplicável).

### V6 — Casos extremos

- Remover a última peça da chapa → layout vazio sem erros, indicadores zerados.
- Remover nó com subárvore inteira (X com vários Y/Z) → tudo some junto; contagem anunciada bate com o total removido.
- Em resultado de otimização em lote, remover peça de uma chapa do grupo ativo → apenas essa chapa muda.

## Critérios de aceite (da spec)

- SC-001: remover peça em ≤ 2 interações sem documentação.
- SC-002: zero divergência entre botão/tecla e comando `U`.
- SC-003: seleção sempre identificável visualmente.
- SC-004: `alocadas + pendentes = solicitadas` após qualquer remoção.
