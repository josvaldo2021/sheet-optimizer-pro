
# Melhorias no Algoritmo de Otimização - V4

## Melhorias Implementadas (atual)

### 1-6. (V3 mantidas — ver histórico)

### 7. Estratégia Column-Count (OptWay Mirror)
- Nova função `runColumnCountPlacement` que replica a lógica do OptWay
- Para cada tipo dominante de peça, calcula `N = floor(availW / pieceW)`
- Cria coluna X com largura `N × pieceW` e preenche verticalmente com linhas de N peças como Z-nodes
- A largura restante é tratada como sub-problema para o próximo tipo de peça
- Integrado como `placementMode = 2` no motor V6 (3 modos: Colunas, Strip-Pack, Col-Count)
- Testado em 324 combinações: 9 variantes × 12 estratégias × 3 modos de posicionamento
- GA atualizado: `useStrip: boolean` → `placementMode: 0|1|2` com mutação cíclica
- Seeding do GA inclui todos os 3 modos de posicionamento
