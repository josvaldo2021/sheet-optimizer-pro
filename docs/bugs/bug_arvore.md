## Esse arquivo demonstra um bug na geração da arvore

X5982 (x1)
Y1900 (x1)
Z1258 (x2) [00421/26]
Z1258 (x2)
W1863 (x1) [00421/26]<--até aqui está certo
Q1258 (x1) [00421/26]<--aqui começa o bug, esse Q1258 é redundante, pois o Z e W anteriores já formam as peças.

Z865 (x1)
W1233 (x1) [00421/26]<--aqui está correto, forma uma peça de 865x1233.
Q865 (x1) [00421/26]<--aqui começa o bug, esse Q865 é redundante, pois o Z e W anteriores já formam as peças.

W527 (x1) [00393/26]
Q717 (x1) [00393/26]<--aqui está correto, forma uma peça de 527x717.
R527 (x1) [00393/26]<--aqui começa o bug, esse R527 é redundante, pois o W e Q anteriores já formam as peças.

Y1258 (x1)
Z1863 (x2) [00421/26]
Z2256 (x1)
W866 (x1) [00381/26]
Q2144 (x1) [00381/26]<--aqui está quase certo, forma uma peça de 866x2144. A cordenada está correta mas a medida não.

R866 (x1) [00381/26]<--aqui começa o bug, esse R866 é redundante, pois o W e Q anteriores já formam as peças.
Alem disso no inventario não existe a peça 866x2144.
A medida que tenho é 866x2124 ou 866x2154.
O algoritmo pode estar misturando as medidas.
Pois tenho peças de 799x2144.

W385 (x1) [00421/26]
Q1128 (x2) [00421/26]<--aqui está correto, forma duas peças de 385x1128.
R385 (x1) [00421/26]<--aqui começa o bug, esse R385 é redundante, pois o W e Q anteriores já formam as peças.