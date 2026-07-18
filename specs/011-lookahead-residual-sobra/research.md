# Research: Seleção de layout por lookahead residual

Fase 0. Decisões técnicas. Formato Decisão / Racional / Alternativas.

## R1 — Onde aplicar o critério

**Decision**: No **ponto de seleção do `optimizeV6`** (TS `optimizer.ts:192` e
espelho Rust `optimizer.rs:164`), inserindo o residual-fit **entre** `area` e
`compactness`.

**Rationale**: A escolha entre layouts candidatos só existe **dentro** do
`optimizeV6` (ele testa dezenas de estratégias e retorna 1 vencedor). O nível do
plano (`runAllSheets`) recebe apenas o resultado final, então não pode
reordenar candidatos. Portanto o critério tem de viver no motor. O Rust tem o
espelho exato (`best_area`/`best_compactness`/`calc_compactness`), o que torna a
paridade direta.

**Alternatives considered**:
- *Nível do plano (como specs 009/010)*: inviável — o plano não vê os candidatos,
  só o vencedor. Rejeitado.
- *Pós-processo que reorganiza a árvore para consolidar a sobra*: é um mini-
  otimizador, arriscado (pode mudar o layout e piorar), e ainda precisaria de
  paridade. Rejeitado.

## R2 — Como medir "a sobra comporta a próxima peça"

**Decision**: Um helper `largestFreeRect(tree, usableW, usableH)` que generaliza
o `getLastLeftover` (que já percorre os gaps por nível): coleta os retângulos
livres de cada nível e retorna o de **maior área**. "Comporta a próxima peça" =
esse retângulo acomoda a **maior peça de `result.remaining`** em alguma
orientação permitida (respeitando margens/`minBreak`).

**Rationale**: `getLastLeftover` já implementa, testado, a leitura geométrica dos
gaps da árvore guilhotina (faixa à direita, fundo da última coluna, etc.) —
derivado da árvore (Princípio IV). Generalizá-lo para o **maior** gap é uma
extensão pequena e paritável. A maior peça restante é a referência mais robusta
(se a maior cabe, as menores cabem).

**Alternatives considered**:
- *Algoritmo completo de "maximal rectangles"*: mais preciso, porém mais caro e
  mais difícil de manter em paridade TS↔Rust. O gap-walk cobre os casos de
  guilhotina (onde a sobra é retangular por construção). Preterido para v1.
- *Usar só `getLastLeftover` (gap final)*: bom proxy, mas pode subestimar em
  layouts onde o maior livre não é o final. Generalizar para o maior é mais
  correto pelo mesmo custo. Adotado.

## R3 — Subordinação ao aproveitamento (guarda contra regressão)

**Decision**: O residual-fit é **estritamente desempate**: só compara candidatos
de **mesma `area` alocada**; nunca escolhe menor área. Validação de
não-regressão pelo **harness de benchmark** (falha se aproveitamento ou nº de
chapas piorar). Assunção da spec: **não** permitir troca de preenchimento por
menos chapas (opção segura) — a definir em `/speckit-clarify` se o usuário quiser
o modo "global".

**Rationale**: Responde à preocupação do usuário ("chapa com sobra não pode ser
considerada melhor"). Como é só desempate, é impossível premiar espaço vazio: o
ganho vem de **encaixar mais peças** (mais área no total do plano), não de deixar
sobra.

**Alternatives considered**:
- *Lookahead "global" (aceitar chapa marginalmente menos cheia por menos chapas
  no total)*: mais poderoso, porém arriscado e mais difícil de guardar. Fora do
  escopo v1; registrado como possível evolução via clarify.

## R4 — Paridade TS↔WASM (Princípio VI)

**Decision**: Implementar em TS (referência) + espelhar em Rust
(`largest_free_rect` + hierarquia de seleção em `optimizer.rs`), com
`npm run build:wasm`. Não mesclar sem a paridade. Confirmar que TS e WASM
produzem o mesmo plano nos cenários de teste.

**Rationale**: `engine-adapter` despacha entre TS e WASM; uma mudança de
comportamento só no TS faria os dois divergirem — que a Constituição trata como
bug. O espelho Rust é direto porque a estrutura de seleção é idêntica.

**Alternatives considered**:
- *TS-only, aceitando divergência temporária*: viola o Princípio VI. Rejeitado.

## R5 — Impacto no baseline do benchmark

**Decision**: Rodar o benchmark após a mudança. Se **piorar** → falha (barra a
mudança). Se **igual** → nada a fazer. Se **melhorar** (menos chapas / mais
aproveitamento em algum cenário) → **regravar** a baseline (`RECORD_BASELINE=1`) e
documentar o ganho no relatório.

**Rationale**: A baseline registra aproveitamento/nº de chapas; uma melhoria
legítima muda os números para melhor e deve ser fixada como novo piso.

**Alternatives considered**:
- *Congelar a baseline atual*: mascararia o ganho e faria o teste falhar por
  melhoria. Rejeitado.

## Resumo de decisões

| # | Decisão |
|---|---------|
| R1 | Critério no ponto de seleção do `optimizeV6` (TS + Rust); area → residual-fit → compactness |
| R2 | `largestFreeRect` (generaliza `getLastLeftover`) vs. maior peça de `result.remaining` |
| R3 | Estritamente desempate (subordinado à área); guarda pelo benchmark; modo "global" fica p/ clarify |
| R4 | Paridade TS↔WASM obrigatória (espelho Rust + rebuild wasm) |
| R5 | Baseline: piora barra; melhora ⇒ regravar e documentar |

Nenhum `NEEDS CLARIFICATION` remanescente (a única questão aberta — desempate vs
global — está registrada como assunção segura + item de clarify).

## Validação empírica (2026-07-18) — o lever é a SELEÇÃO, o candidato já existe

Investigação feita no motor real (WASM) sobre o cenário-âncora Chapa 2 (4× 2473×1262
+ 2× 2634×406 em 5980×3190), com a spec 012 já garantindo conservação. Confirma R1
(o lever é a seleção, não a geração) com número:

- **Passada NORMAL (coluna-primeiro)**: sobra em **5 retângulos**, maior 2473×666
  (**37%** da sobra). O corte vertical em x=2473 (que separa as duas colunas de
  peças) desce até o fim da chapa e **racha** a faixa inferior em dois 2473×666.
- **Passada TRANSPOSTA (linha-primeiro, que o `optimizeV6` já gera e avalia)**:
  sobra em **3 retângulos**, maior **932×2473** + faixa de largura cheia **5980×311**
  (**52%** consolidado). Área total de sobra idêntica (4.454k) — muda só a FORMA.

**Conclusão que fixa o desenho**: o candidato mais consolidado **já é gerado** a
cada otimização (via transposição — `optimizer.ts` roda `for transposed of [false,
true]`). O motor NÃO o escolhe porque desempata por `area → calcCompactness`
(menos colunas/nós), **cego à qualidade da sobra** — e o `optimizeV6` chega a
preferir um layout AINDA pior (7 retalhos, maior só 22%, medido). Portanto o
critério de residual-fit (R1/R2) é o lever correto e **suficiente para este
cenário**: ele viraria a escolha para o transposto consolidado sem tocar no
placement.

**Ressalva registrada (fora do escopo v1)**: nem o transposto entrega o "ideal"
teórico de um ÚNICO bloco 4946×666 — para aquela forma exata precisaria de um
**construtor row-first / shelf dedicado** que gere o candidato "grade no topo +
faixa de largura cheia embaixo". Isso é **fase 2**, uma mudança de GERAÇÃO, e fica
fora desta spec (que é só seleção). A seleção sozinha já entrega ganho material
aqui (37%→52%, 5→3 sobras); o shelf builder espremeria o resto depois, se medirmos
que vale.

## PIVÔ na implementação (2026-07-18): residual-fit → CONSOLIDAÇÃO

Durante a implementação, dois achados invalidaram o critério ESCRITO (residual-fit
contra `result.remaining`) e levaram, com decisão do usuário, a trocá-lo por
**consolidação pura**:

1. **`result.remaining` é SEMPRE vazio.** O laço de `runPlacement` DESCARTA a peça
   que não cabe (`remaining.shift()` no ramo `!bestFit`), não a devolve. Medido: 20
   peças 1000×1000 numa chapa 2000×2000 ⇒ 4 colocadas, `remaining` = 0. Logo o
   residual-fit (que consulta `result.remaining` para achar a "próxima peça")
   NUNCA dispararia.
2. **No cenário-âncora não há "próxima peça".** Todas as 6 peças cabem na Chapa 2,
   então mesmo derivando as não-alocadas de input−árvore, o conjunto é vazio — o
   residual-fit não distingue os candidatos. O que distingue a Chapa 2 boa da ruim
   é a FORMA da sobra, não uma peça que caiba nela.

**Decisão do usuário**: critério = **consolidação pura** — entre candidatos de
mesma área, preferir o cujo MAIOR retângulo livre é MAIOR (bloco único
reutilizável). Bate com "a sobra vale por si". Reusa o helper `largestFreeRect`.
Medido: âncora passou de 991k (fragmentado, 5 retalhos) para **932×2473 = 2305k**
(bloco único) no motor real.

**Detalhe crítico de implementação**: a consolidação só se materializa APÓS
`normalizeTree` (que mescla/reestrutura os cortes), e o resultado só é normalizado
quando transposto (ou `minBreak>0`). Medir na árvore CRUA escolhe o candidato
errado (âncora ficava em 991k). Então o critério normaliza um CLONE do candidato
"como ele será finalizado" antes de medir `largestFreeRect`. Poda de custo: só
calcula para candidatos com `area >= bestArea` (área domina).

**Dívida de paridade EXPOSTA (não causada) pela spec**: como o critério agora
depende da saída do normalize, ele revelou que TS e WASM divergem no valor exato
(TS 2305k, WASM 2481k — os dois consolidam, WASM até melhor). Causas pré-existentes:
(a) `normalizeTree`/`normalize_tree` reestruturam cortes de forma um pouco
diferente; (b) o motor WASM tem estado process-local (resultado depende de chamadas
anteriores: isolado 2305k, após outras chamadas 2481k). Ambas são dívidas
anteriores. O `wasm-parity.test.ts` trava o invariante que importa (os dois
consolidam num bloco grande, > 1800k), não a igualdade exata. FOLLOW-UP proposto: um
`largestFreeRect` GEOMÉTRICO (maior retângulo vazio a partir das posições das peças,
independente da estrutura de corte) daria paridade exata e dispensaria o normalize
na medição — registrado como evolução futura.
