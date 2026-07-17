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
