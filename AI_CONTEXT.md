# Contexto Mestre do Projeto: Sheet Optimizer Pro

Este documento serve como um guia abrangente para a inteligência artificial (IA) interagir com o projeto **Sheet Optimizer Pro**. Ele detalha a arquitetura, os algoritmos centrais, as estruturas de dados e as regras de negócio, visando facilitar o entendimento e reduzir a necessidade de tokens em interações futuras.

## 1. Visão Geral do Projeto

O **Sheet Optimizer Pro** é uma aplicação web desenvolvida para otimização de planos de corte (nesting 2D) de peças retangulares em chapas maiores. O objetivo principal é minimizar o desperdício de material e otimizar o processo de corte, utilizando algoritmos avançados de agrupamento e posicionamento de peças.

## 2. Arquitetura Técnica

O projeto é uma aplicação **Single Page Application (SPA)** construída com as seguintes tecnologias:

*   **Frontend:** React com TypeScript, utilizando Vite para o ambiente de desenvolvimento e build.
*   **Estilização:** Tailwind CSS para utilitários de CSS e shadcn/ui para componentes de interface de usuário.
*   **Motor de Otimização (CNC Engine):** Implementado em TypeScript, é o módulo central responsável pelos algoritmos de agrupamento, posicionamento e otimização. Este motor é agnóstico à interface de usuário e pode ser reutilizado.
*   **Exportação:** Funcionalidades de exportação para PDF (via `jspdf`) e Excel (via `xlsx`) para relatórios e integração com outros sistemas.

## 3. Algoritmos Centrais de Otimização

O projeto emprega uma abordagem híbrida para a otimização, combinando heurísticas e algoritmos genéticos para alcançar alta eficiência.

### 3.1. `optimizeV6` (Heurístico)

Esta função implementa diversas estratégias heurísticas para o posicionamento de peças. Ela considera:

*   **Estratégias de Ordenação:** Múltiplas formas de ordenar as peças (por área, maior dimensão, proporção, etc.) para tentar diferentes arranjos.
*   **Agrupamento:** Antes do posicionamento, peças com características semelhantes (ex: mesma largura ou altura) podem ser agrupadas para serem cortadas juntas, reduzindo o número de cortes primários.
*   **Rotação:** As peças podem ser rotacionadas em 90 graus para encontrar um encaixe melhor.

### 3.2. `optimizeGeneticAsync` (Algoritmo Genético)

Este é um otimizador mais avançado que utiliza um algoritmo genético para explorar um espaço de soluções maior. Ele funciona da seguinte forma:

*   **População Inicial:** Gerada a partir de uma combinação de estratégias heurísticas.
*   **Evolução:** Através de gerações, a população de soluções (planos de corte) é aprimorada usando operadores genéticos (seleção, cruzamento, mutação).
*   **Função de Fitness:** Avalia a qualidade de cada plano de corte, geralmente baseada na área utilizada da chapa (aproveitamento) e na complexidade dos cortes.
*   **Otimização Multi-chapa:** Capaz de otimizar o corte de múltiplas chapas, deduzindo peças do inventário à medida que são utilizadas.

## 4. Estruturas de Dados Chave

### 4.1. `TreeNode` (Árvore de Corte)

A `TreeNode` representa a estrutura hierárquica dos cortes e o posicionamento das peças na chapa. É uma árvore que descreve como a chapa é dividida.

*   **`id`:** Identificador único do nó.
*   **`tipo`:** Tipo do nó, indicando o tipo de corte ou região. Os tipos são:
    *   `ROOT`: O nó raiz, representando a chapa inteira.
    *   `X`: Um corte horizontal, dividindo a chapa verticalmente (ao longo do eixo X).
    *   `Y`: Um corte vertical, dividindo a chapa horizontalmente (ao longo do eixo Y).
    *   `Z`: Representa uma peça individual posicionada. Geralmente tem `multi: 1` ou `multi: 2` (para peças agrupadas que foram cortadas juntas).
    *   `W`: Representa uma área de desperdício (waste).
    *   `Q`: Representa uma área de sobra (queda), que pode ser reutilizada.
    *   `R`: Representa uma área de refugo, que é um tipo específico de desperdício.
*   **`valor`:** A dimensão do corte (largura para X, altura para Y) ou a dimensão da peça/desperdício.
*   **`multi`:** Multiplicidade do nó, útil para agrupar peças idênticas ou indicar que um nó `Z` representa múltiplas peças cortadas em conjunto.
*   **`filhos`:** Array de `TreeNode`s, representando os sub-cortes ou peças resultantes.
*   **`label`:** Rótulo opcional para a peça (ex: ID do item).
*   **`transposed`:** Booleano indicando se a peça foi rotacionada.

### 4.2. `Piece` e `PieceItem`

*   **`Piece`:** Representa uma peça a ser cortada, com `w` (largura), `h` (altura), `area`. Pode incluir `count` (se for um agrupamento de peças idênticas), `label`, `labels` (para agrupamentos) e `groupedAxis`.
*   **`PieceItem`:** Representa um item do inventário de peças, com `id`, `qty` (quantidade necessária), `w`, `h`, `label` e `priority` (se deve ser priorizada na otimização).

## 5. Regras de Negócio e Restrições

*   **Corte Guilhotina:** Todos os cortes são retos e vão de uma borda à outra da chapa ou sub-chapa. Não são permitidos cortes em L ou formatos complexos.
*   **Margens (`ml`, `mr`, `mt`, `mb`):** As chapas possuem margens que reduzem a área útil (`usableW`, `usableH`).
*   **`minBreak`:** Uma restrição mínima de corte, que pode influenciar a forma como as peças são posicionadas e os desperdícios são gerados.
*   **Agrupamento de Peças:** O algoritmo tenta agrupar peças com dimensões compatíveis para otimizar os cortes. Por exemplo, `groupPiecesBySameHeight` agrupa peças com a mesma altura para um corte X único, seguido de cortes Z para separar as peças individuais.
*   **Rotação de Peças:** Peças podem ser rotacionadas em 90 graus para melhor encaixe, a menos que explicitamente restrito.

## 6. Problemas Conhecidos e Melhorias Atuais

O projeto está em constante evolução, e alguns pontos de atenção incluem:

*   **`ALGORITHM_IMPROVEMENTS.md`:** Documenta melhorias recentes, como a lógica de agrupamento por altura, que visa reduzir o número de cortes primários e melhorar o aproveitamento.
*   **`BUG ARVORE.MD`:** Descreve um bug na geração da árvore de corte onde nós `Q` e `R` podem ser redundantes após a criação de nós `Z` e `W`, indicando uma possível duplicação ou representação ineficiente de peças/desperdícios na árvore. Além disso, há menção a inconsistências nas medidas de peças geradas, sugerindo um problema na precisão ou na correspondência com o inventário original.

Este contexto deve fornecer uma base sólida para a IA entender o projeto e auxiliar em tarefas como depuração, refatoração ou implementação de novas funcionalidades.
