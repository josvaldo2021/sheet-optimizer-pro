# Melhorias no Algoritmo de Otimização

## Nova Funcionalidade: Agrupamento de Peças por Altura

### Problema Original
Quando havia 2 peças com a mesma medida em Y (altura), o algoritmo fazia:
- 2 cortes separados em X
- Sobras desnecessárias em cada corte

### Solução Implementada
Agora o algoritmo:

1. **Detecta peças com mesma altura** antes de iniciar a otimização
2. **Agrupa-as em pares** somando as larguras
3. **Cria um único corte em X** com a soma das duas larguras
4. **Faz 2 cortes em Z** (um para cada peça original)

### Exemplo

#### Antes:
```
Peça A: 600 × 1296
Peça B: 610 × 1296
Peça C: 610 × 1296
Peça D: 610 × 1296
Peça E: 919 × 2625

Resultado: 5 cortes em X separados, muita sobra em cima
```

#### Depois:
```
Peças A+B: 1210 × 1296 (somado em 1 X, depois 2 Z)
Peças C+D: 1220 × 1296 (somado em 1 X, depois 2 Z)
Peça E: 919 × 2625

Resultado: 3 cortes em X, muito mais aproveitamento!
```

### Estrutura Técnica

**Função: `groupPiecesByHeight()`**
- Mapeia peças por altura
- Agrupa em pares quando possível
- Retorna lista otimizada

**Modificação: `optimizeV6()`**
- Chama `groupPiecesByHeight()` antes de processar
- Usa peças agrupadas para todas as estratégias

**Modificação: `runPlacement()`**
- Detecta quando uma peça é resultado de agrupamento
- Cria 2 nós Z com `multi: 2` em vez de 1 nó com valor dobrado

### Resultado Esperado
- ✅ Menos cortes em X
- ✅ Melhor aproveitamento da chapa
- ✅ Sobras mais limpas e proveitosas
- ✅ Processo de corte mais eficiente
