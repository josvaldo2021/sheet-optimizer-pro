## Aproveitamento
Preciso que você implemente/ajuste o cálculo de aproveitamento (yield) do plano de corte com base nas seguintes regras:

## regra principal
    As alterações não podem de forma alguma alterar o algoritmo de otimização 

## Definições:
    Área total das chapas: soma das áreas de todas as chapas utilizadas no plano
    Área total das peças: soma das áreas de todas as peças alocadas no plano
    Sobras: regiões retangulares restantes após os cortes
## Regra principal:
    O aproveitamento deve refletir a eficiência do plano atual, e NÃO do estoque futuro.
## Tratamento das sobras:
    O algoritmo já tenta alocar peças em todas as sobras intermediárias
    Se uma sobra não recebeu nenhuma peça, ela deve ser considerada perda real do plano
## Regra crítica:
    Apenas a ÚLTIMA sobra gerada no plano deve ser considerada como potencialmente reaproveitável
    Isso porque ela representa o estado final da chapa após o término das alocações
    Todas as outras sobras anteriores devem ser consideradas como perda, pois já foram testadas e rejeitadas pelo algoritmo
## Fórmula do aproveitamento:

    Aproveitamento = Área total das peças / (Área total das chapas - Área da última sobra reaproveitável)

## Condição adicional:
    A última sobra só deve ser descontada se for considerada reaproveitável
    Para isso, valide critérios mínimos como:
    largura mínima
    altura mínima
    Caso não atenda aos critérios, ela também deve ser considerada perda
## Requisitos de implementação:
    O cálculo deve ser consistente com o sistema de coordenadas existente
    As sobras devem ser tratadas como retângulos (x, y, largura, altura)
    O algoritmo deve identificar corretamente qual é a última sobra gerada
## Objetivo:
    Garantir que o aproveitamento represente a eficiência real do plano de corte atual, sem inflar artificialmente o resultado com sobras que já se provaram inviáveis.