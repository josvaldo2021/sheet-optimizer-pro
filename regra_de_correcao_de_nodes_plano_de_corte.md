# 📐 Regra de geração de Nodes - Plano de Corte

## 🎯 Objetivo

Este documento define as regras obrigatórias para geração e padronização dos **nodes gerados pelo algoritmo de corte**.

A inteligência artificial deve interpretar corretamente o tipo de corte (vertical ou horizontal) e gerar os identificadores dos nodes de acordo com essas regras.

---

## ⚠️ Problema Identificado

Os nodes atualmente gerados não seguem um padrão coerente com o layout físico da chapa.

Principais falhas:

- Uso incorreto dos identificadores (X, Y, Z, W, Q)
- Mistura de orientação de corte
- Nodes que não representam corretamente a geometria do corte

---

## 🧠 Regra Fundamental

A classificação dos nodes deve ser baseada **EXCLUSIVAMENTE na orientação do corte**.

## regra fundamental, hierarquia de cortes
Um corte em Q é vertical e vem sempre depois de um corte em W
Um corte em W é horizontal e vem sempre depois de um corte em Z
Um corte em Z é vertical e vem sempre depois de um corte em Y
Um corte em Y é horizontal e vem sempre depois de um corte em X


---

## 📏 Classificação por Tipo de Corte

### 🔵 Cortes Verticais

Para qualquer corte vertical, os nodes devem utilizar apenas os seguintes identificadores:

- `X`
- `Z`
- `Q`

📌 Regra:
> se uma chapa for cortada ao meio na horizontal, o primeiro corte deve ser x sendo o tamanho da chapa

---

### 🟢 Cortes Horizontais

Para qualquer corte horizontal, os nodes devem utilizar apenas os seguintes identificadores:

- `Y`
- `W`

---

## 🚫 Restrições Obrigatórias

A inteligência artificial **NÃO PODE**:

- Atribuir `Y` ou `W` para cortes verticais
- Atribuir `X`, `Z` ou `Q` para cortes horizontais
- Misturar identificadores sem respeitar a orientação geométrica

---

## Exemplo de Aplicação da Regra

- Quero uma peça de 1000x1000
   x1000
   y1000
   caso eu queira cortar a peça ao meio na vertical, o node deve ser:
   z500
   z500
   caso eu queira cortar a peça ao meio na horizontal, o node deve ser:
   y500
   y500
---
## ✅ Resultado Esperado

Uma lista de nodes que:

- Respeita a orientação dos cortes
- Está padronizada
- Representa corretamente o layout
---

## 🚀 Observação Final

Esta regra é obrigatória para garantir que o plano de corte seja:

- Interpretável
- Reprodutível
- Compatível com processos industriais

Qualquer violação dessas regras deve ser considerada erro crítico.

