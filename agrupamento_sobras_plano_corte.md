# 📐 Agrupamento Inteligente de Sobras em Plano de Corte 2D

## 🎯 Objetivo
Definir regras para que a IA identifique, agrupe e otimize sobras geradas em planos de corte guilhotinados, garantindo reaproveitamento eficiente sem violar a estrutura de coordenadas.

---

## 📌 Contexto
- O plano de corte utiliza cortes guilhotinados representados por coordenadas:
  - Verticais: X, Z, Q
  - Horizontais: Y, W
- A chapa é subdividida dinamicamente, gerando peças e sobras
- As dimensões variam a cada execução (não existem medidas fixas)

---

## ⚠️ Regras Críticas

### 1. Orientação dos Cortes
- Cortes verticais → X, Z, Q
- Cortes horizontais → Y, W

---

### 2. Respeito ao Sistema de Coordenadas (OBRIGATÓRIO)

A IA deve obrigatoriamente respeitar o sistema de coordenadas original.

❌ Não é permitido:
- Agrupar regiões apenas visualmente
- Ignorar a sequência de cortes
- Unir áreas que não sejam contíguas na árvore de cortes
- Recriar geometria fora do modelo

✅ É obrigatório:
- Manter a hierarquia dos cortes
- Trabalhar como extensão da árvore existente
- Garantir representabilidade por coordenadas válidas

---

### 3. Regra de Generalização (ANTI-VIÉS)

❌ Não pode:
- Depender de dimensões específicas

✅ Deve:
- Detectar padrões dinamicamente
- Trabalhar com relações geométricas

---

## 🧠 Estratégia de Agrupamento

### 1. Identificação das Sobras
- Detectar regiões retangulares remanescentes
- Tratar como nós residuais

### 2. Critérios
- Alinhamento
- Contiguidade
- Compatibilidade dimensional
- Validade estrutural

---

### 3. Direção
- Mesma largura → Y/W
- Mesma altura → X/Z/Q

---

### 4. Formação
- Retângulo contínuo
- Representável na árvore

---

## 🔄 Regra de Colapso de Cortes

Y a
Y b
Y c
→ Y (a + b + c)

## Como o algoritmo deve fazer o agrupamento
Sempre que o algorimo identificar uma oportunidade de agrupamento
ele deve refazer as cordenadas que compõe o layout analisado
e refazer o layout somando as dimensoes para obter uma sobra desfragmentada.

## Exemplo sem agrupamento alocando 10 peças de 917x725:
    X3210 (x1)
    Y917 (x1)
    Z725 (x1) 
    Z725 (x1) 
    Z725 (x1) 
    Z725 (x1) 
    Y725 (x1)
    Z917 (x1) 
    Z917 (x1) 
    Z917 (x1) 
    Y758 (x1)
    Z917 (x1) 
    W725 (x1) 
    Z917 (x1) 
    W725 (x1) 
    Z917 (x1) 
    W725 (x1) 

## Exemplo com agrupamento alocando 10 peças de 917x725:
    X3210 (x1)
    Y917 (x1)
    Z725 (x4) 
    -------------------------> aqui acontece o agrupamento  
    Y1483 (x1)
    Z2751 (x1)
    W725 (x2)
    Q917 (x3)

Condições:
- Mesmo eixo
- Mesmo contexto
- Cortes consecutivos
- Regiões contíguas

---

## 🚀 Resultado Esperado
- Redução de fragmentação
- Melhor reaproveitamento
- Sistema genérico
- Compatível com guilhotina

---

## 🧩 Conceito Fundamental
Otimização da árvore de cortes através de colapso estrutural
