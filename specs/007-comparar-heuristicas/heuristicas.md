# Heurísticas para o Problema de Corte 2D Guilhotinado

Este documento compila as principais heurísticas e metaheurísticas utilizadas para resolver o Problema de Corte de Estoque Bidimensional (2D) com a restrição de guilhotina (onde cada corte deve ir de uma extremidade à outra do material).

---

## 1. Heurísticas Construtivas (Gulosas)

As heurísticas construtivas constroem uma solução do zero, adicionando uma peça por vez de forma sequencial com base em regras de ordenação pré-definidas.

*   **Bottom-Left (BL) / Bottom-Left Fill (BLF):** Posiciona os itens de forma sequencial na chapa, empurrando cada peça o máximo possível para baixo e, em seguida, para a esquerda.
*   **First Fit Decreasing Height (FFDH):** Organiza as peças por ordem decrescente de altura e as aloca em níveis (faixas). Se a peça não couber no nível atual, um novo nível é criado.
*   **Next Fit Decreasing Height (NFDH):** Similar ao FFDH, mas avalia apenas o nível atual. Se a peça não couber, fecha o nível permanentemente e cria um novo, gerando mais desperdício.
*   **Best Fit Decreasing Height (BFDH):** Coloca a peça no nível já aberto que gera o menor desperdício de espaço horizontal residual.
*   **Best-Fit (Geral):** Varre todas as posições livres e viáveis da chapa e insere a peça onde o desperdício de área local resultante seja o menor possível.

---

## 2. Heurísticas Estruturais e Baseadas em Estágios

Essas heurísticas limitam o número de orientações de corte para se adequar às limitações físicas de máquinas industriais (como seccionadoras de madeira ou mesas de corte de vidro).

*   **Corte em 2 Estágios (2-Stage):** O primeiro estágio faz apenas cortes verticais (ou horizontais) gerando tiras. O segundo estágio corta as tiras na direção oposta para extrair as peças.
*   **Corte em 3 Estágios (3-Stage):** Adiciona uma terceira etapa de corte (geralmente para separar subpeças ou aparar rebarbas/sucata residual de forma guilhotinada).
*   **Corte com Restrição de Giro (Exact/Non-Exact):** Heurísticas que determinam se as peças podem ou não ser rotacionadas em 90 graus antes do corte.
*   **Abordagem de Busca em Árvore (Tree Search/And-Or Trees):** Modela os padrões de corte como uma estrutura de árvore binária, onde cada nó representa uma linha de corte guilhotina que divide o retângulo atual.

---

## 3. Metaheurísticas (Otimização Global)

Utilizadas para guiar heurísticas construtivas mais simples, buscando as melhores sequências de entrada de peças ou os melhores parâmetros de agrupamento.

*   **Algoritmos Genéticos (AG) / BRKGA:** Codificam a sequência de entrada das peças e suas rotações em cromossomos, evoluindo a população para minimizar a sobra de material.
*   **GRASP (Greedy Randomized Adaptive Search Procedure):** Cria soluções iniciais misturando escolhas gulosas com aleatoriedade e, em seguida, aplica uma busca local para refinar o plano de corte.
*   **Busca Tabu (Tabu Search):** Explora o espaço de soluções alterando a ordem das peças e bloqueia temporariamente (lista tabu) movimentos que retornem a estados anteriores.
*   **Simulated Annealing (Recozimento Simulado):** Explora o plano de corte aceitando soluções piores no início para escapar de ótimos locais, refinando os cortes conforme a "temperatura" do algoritmo esfria.

---

## 4. Heurísticas para Variantes Específicas

Algoritmos focados em variações do problema principal de corte.

*   **Strip Packing (Empacotamento em Faixas):** Heurísticas focadas em minimizar o comprimento total utilizado de uma bobina ou chapa que possui largura fixa e comprimento infinito.
*   **Associação com Geração de Colunas (Heurísticas de Arredondamento):** Utilizam relaxação linear para gerar padrões de corte guilhotinados ótimos e aplicam heurísticas para arredondar as frações de chapas necessárias para números inteiros.
