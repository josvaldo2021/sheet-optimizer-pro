

# Melhorias no Algoritmo de Otimizacao - Maximizar Aproveitamento

## Objetivo
Reduzir ao maximo a quantidade de chapas utilizadas, melhorando a logica do algoritmo `optimizeV6` no arquivo `src/lib/cnc-engine.ts` sem alterar a interface visual ou funcionalidades existentes.

---

## Problemas Identificados (da analise)

1. **Natureza gulosa** - decide peca a peca sem voltar atras
2. **Colunas rigidas** - a primeira peca define a largura da coluna permanentemente
3. **Preenchimento W limitado** - so aceita pecas com largura exata igual
4. **Sem lookahead** - nao considera pecas futuras ao decidir
5. **Agrupamento simplista** - so agrupa pares de mesma altura
6. **Poucas estrategias** - apenas 5 ordenacoes testadas

---

## Melhorias Planejadas

### 1. Coluna com largura da maior peca (nao da primeira)
Ao criar uma nova coluna, usar a largura da maior peca que ainda cabe, nao apenas a peca atual. Isso evita colunas estreitas demais.

### 2. Preenchimento W flexivel (largura aproximada, nao exata)
Atualmente o preenchimento vertical dentro de Z so aceita pecas com `wo.w === bestOri.w`. Mudar para `wo.w <= bestOri.w`, permitindo pecas mais estreitas com subdivisao adicional.

### 3. Mais estrategias de ordenacao (de 5 para 10+)
Adicionar estrategias como:
- Ordenar por razao w/h (pecas mais "quadradas" primeiro)
- Ordenar por menor dimensao
- Ordenar pecas "problematicas" (muito longas/estreitas) primeiro
- Variantes com rotacao forcada (sempre w > h ou sempre h > w)

### 4. Scoring com lookahead simples
Ao decidir onde colocar uma peca, considerar se a sobra resultante consegue acomodar pelo menos 1 peca do inventario restante. Penalizar posicoes que geram sobras inutilizaveis.

### 5. Preenchimento recursivo de sobras
Apos o placement principal, varrer todas as sobras (S.Y, S.Z, S.W) e tentar encaixar pecas restantes nelas, como se fossem mini-chapas.

### 6. Agrupamento expandido
Expandir `groupPiecesByHeight` para:
- Agrupar 3+ pecas (nao so pares)
- Considerar agrupamento por largura tambem (pecas lado a lado verticalmente)
- Testar com e sem agrupamento e escolher o melhor

### 7. Tentativa com rotacao global
Adicionar uma rodada extra onde TODAS as pecas sao forcadamente rotacionadas (w e h trocados) antes de entrar nas estrategias. Dobra as combinacoes testadas.

---

## Detalhes Tecnicos

### Arquivo alterado
- `src/lib/cnc-engine.ts` (unico arquivo modificado)

### Funcoes modificadas

**`optimizeV6()`**
- Expandir array `strategies` de 5 para ~12 funcoes de ordenacao
- Rodar cada estrategia 2x: uma normal, uma com todas as pecas rotacionadas
- Rodar com e sem `groupPiecesByHeight` e manter o melhor
- Total: ~48 tentativas em vez de 5

**`runPlacement()`**
- Scoring melhorado: adicionar termo de lookahead que verifica se a sobra gerada cabe alguma peca restante
- Preenchimento W: relaxar condicao de `wo.w === bestOri.w` para `wo.w <= zNode.valor`
- Adicionar passo final de "void filling" - varrer sobras e tentar encaixar pecas restantes

**`groupPiecesByHeight()`**
- Permitir grupos de 3+ pecas (nao so pares)
- Adicionar `groupPiecesByWidth()` como alternativa

### Funcoes novas

**`fillVoids()`**
- Recebe a arvore e lista de pecas nao colocadas
- Identifica retangulos livres (sobras Y, Z, W)
- Tenta encaixar pecas nesses espacos recursivamente

**`scoreFit()`**
- Funcao de scoring unificada com lookahead
- Parametros: espaco disponivel, peca candidata, inventario restante
- Retorna score que penaliza sobras inutilizaveis

### Performance
- ~48 tentativas vs 5 atuais = ~10x mais processamento
- Cada tentativa e O(n^2) no pior caso
- Para 100 pecas: ainda < 100ms no navegador
- Limite de seguranca mantido (max 100 chapas no loop)

