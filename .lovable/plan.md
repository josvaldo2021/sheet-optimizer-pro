
# Melhorias no Algoritmo de Otimização - V3

## Melhorias Implementadas (atual)

### 1. Fitness GA corrigido - Minimizar chapas
- `simulateSheets` agora simula TODAS as chapas (não apenas 1-3)
- Fitness = `(1/sheetsUsed) * 0.7 + avgUtil * 0.3` — prioriza menos chapas

### 2. Bug Pass 2 Z redundante corrigido
- Pass 2 lateral agora cria Z manualmente e passa como `zNodeToUse` ao `createPieceNodes`
- Eliminado nó Z vazio/dangling

### 3. Continuação vertical expandida
- Aceita QUALQUER peça que caiba (não apenas idênticas)
- Aplica scoring para escolher melhor candidata
- Inclui Pass 1 (mesma altura) e Pass 2 (mais curta com subdivisão W) em cada fita nova
- Aplica dominância residual no Y

### 4. W-stacking no Pass 2
- Empilhamento de peças idênticas via `multi++` antes de preencher com peças diferentes
- Maximiza densidade vertical

### 5. optimizeV6 comparação global
- Agora simula todas as chapas para cada estratégia
- Compara por `sheetsUsed` primeiro, depois `area` da primeira chapa

### 6. GA tunado
- População: 40 (era 30), gerações: 30 (era 20), elite: 3 (era 2)
- Taxa de mutação base: 0.15 (era 0.02)
- Mutação adaptativa: 3x quando diversidade < 30%
- Yield a cada 3 gerações (era 5)
- Injeção de indivíduos aleatórios quando duplicatas aparecem
