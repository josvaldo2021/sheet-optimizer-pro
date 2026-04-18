## problema

    Esse arquivo comprova que a distancia de quebra não está sendo respeitada.

## Parametros utilizados
    Bordas: 0 mm
    Distancia de quebra: 30 mm
    Dimensão da chapa: 6000 x 3210 mm

## Lista de peças
    A lista de peças está no arquivo: teste min breack.xlsx

## Arvore gerada pelo algoritmo

    Peça 1:
    X2102 (x1)
    Y1381 (x1) [00381/26]
    ---------------------------
    Peça 2:
    Y1381 (x1) [00381/26]
    Z2092 (x1) [00381/26] <--- aqui está o problema o Z2092 está dento do X2102, resultando em uma diferença de 10 mm
    ---------------------------
    Daqui para baixo está tudo certo
    
    X2651 (x1)
    Y1059 (x2) [00381/26]
    Y1059 (x1) [00381/26]
    X1059 (x1) [00381/26]
    Y2651 (x1) [00381/26]