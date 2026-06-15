# Test-Coverage Checklist: Otimização de Plano de Corte

**Purpose**: Validar se a **cobertura de testes está especificada e completa** para
cada requisito/critério do spec — no estilo Spec Kit ("unit tests for English").
Cada item pergunta se a cobertura existe/está definida; `[Gap]` = lacuna real
(nenhum teste hoje), referência a arquivo = cobertura existente.
**Created**: 2026-06-15
**Feature**: [spec.md](../spec.md) · [plan.md](../plan.md)

## Cobertura dos Critérios de Sucesso (SC)

- [ ] CHK001 - Existe teste que garanta a meta de aproveitamento/densidade de 30+ peças/chapa em cenário denso? [Coverage, Spec §SC-001] (parcial: `quantity-groups.test.ts`, `optimization.test.ts` checam contagens/chapas, mas não há assert explícito de "≥30 peças/chapa")
- [ ] CHK002 - A conservação de peças (soma alocada = inventário, sem perda/duplicação) está coberta por teste? [Coverage, Spec §SC-002] (sim: `phantom-dimension.test.ts` "exact COUNT across all sheets", `quantity-groups.test.ts`)
- [ ] CHK003 - Há teste que verifique ausência de sobreposição e respeito às bordas/margens para um cenário genérico? [Gap, Spec §SC-003] (parcial: `rotation-bug.test.ts`/`rotation-async.test.ts` checam rects in-bounds só no caso de rotação)
- [ ] CHK004 - O determinismo (mesmo input → plano idêntico) está coberto por teste? [Gap, Spec §SC-004] (nenhum teste executa duas vezes e compara os planos)

## Cobertura dos Requisitos Funcionais (FR)

- [ ] CHK005 - Há teste para a derivação da área útil a partir das margens (FR-002)? [Gap, Spec §FR-002] (testes passam `usableW/usableH` já calculados; a aplicação das margens não é exercitada)
- [ ] CHK006 - O corte exclusivamente guilhotina (sem nós de tipo/estrutura inválidos) é assertado em algum teste? [Gap, Spec §FR-003]
- [ ] CHK007 - A rotação 90° para melhor encaixe produzindo rects válidos está coberta? [Coverage, Spec §FR-005] (sim: `rotation-bug.test.ts`, `rotation-async.test.ts`)
- [ ] CHK008 - O agrupamento de peças compatíveis sem alterar a contagem individual está coberto? [Coverage, Spec §FR-006] (sim: `quantity-groups.test.ts`, `regroup-waste.test.ts`)
- [ ] CHK009 - A distribuição multi-chapa com dedução por chapa e sem duplicação está coberta? [Coverage, Spec §FR-007] (sim: `optimization.test.ts`, `regroup-waste.test.ts` "multi-sheet ... reduce total sheet count")
- [ ] CHK010 - A priorização de peças (prioritárias alocadas primeiro) está coberta por teste? [Gap, Spec §FR-008] (nenhum teste de `priority`/`priorityLabels`)
- [ ] CHK011 - O respeito à distância mínima de quebra (`minBreak`) está coberto de forma direta? [Coverage, Spec §FR-009] (parcial: `regroup-waste.test.ts` cobre minBreak em stacking; falta caso base isolado de minBreak)
- [ ] CHK012 - O cálculo/relato de aproveitamento e a separação alocadas vs restantes estão cobertos? [Coverage, Spec §FR-010] (sim: `piece-counting.test.ts` cobre `countAllocatedPieces`; falta assert de utilização %)
- [ ] CHK013 - A reprodutibilidade do resultado (FR-011) tem teste dedicado? [Gap, Spec §FR-011] (ver CHK004)

## Cobertura de Edge Cases

- [ ] CHK014 - Há teste para lista de peças vazia retornando raiz vazia sem erro? [Gap, Spec §"Edge Cases", FR-012]
- [ ] CHK015 - Há teste para peça maior que a chapa útil permanecendo em `remaining` sem travar? [Gap, Spec §"Edge Cases", FR-012]
- [ ] CHK016 - Há teste para grandes quantidades de peças idênticas mantendo a contagem individual correta? [Coverage, Spec §"Edge Cases"] (sim: `quantity-groups.test.ts`, `phantom-dimension.test.ts`)
- [ ] CHK017 - A regressão de "dimensão fantasma" (peça exibida com dimensão errada) está coberta? [Coverage] (sim: `phantom-dimension.test.ts`, `regroup-waste.test.ts`)

## Cobertura de Invariantes da Constituição

- [ ] CHK018 - A paridade TS↔WASM (mesmo input → resultado equivalente) tem teste comparativo? [Gap, Constitution §VI] (nenhum teste compara as duas implementações)
- [ ] CHK019 - Há teste assegurando que desligar agrupamento degrada a qualidade (proteção do Princípio III)? [Gap, Constitution §III]
- [ ] CHK020 - O invariante "folha sempre é peça alocada; desperdício nunca é folha" é assertado? [Coverage, Constitution §IV] (parcial: `piece-counting.test.ts` cobre semântica de contagem; falta assert explícito do invariante de folha/desperdício)

## Rastreabilidade

- [ ] CHK021 - Cada Critério de Sucesso (SC-001..SC-005) tem ao menos um teste rastreável a ele? [Traceability] (lacunas atuais: SC-003 parcial, SC-004 ausente)
- [ ] CHK022 - Cada Requisito Funcional (FR-001..FR-012) tem cobertura ou está marcado como excluído conscientemente? [Traceability] (lacunas atuais: FR-002, FR-003, FR-008, FR-011)

## Notes

- Marque `[x]` quando a lacuna for fechada (teste criado) ou a cobertura confirmada.
- Resumo das maiores lacunas (`[Gap]`) priorizadas por risco:
  1. **Determinismo** (CHK004/CHK013) — barato de cobrir, protege SC-004/FR-011.
  2. **Edge cases** lista vazia e peça grande demais (CHK014/CHK015) — protegem FR-012.
  3. **Priorização** (CHK010) — FR-008 hoje sem nenhum teste.
  4. **Paridade TS↔WASM** (CHK018) — invariante de constituição sem rede de segurança.
  5. **Sem sobreposição/margens genérico** (CHK003) e **derivação de margens** (CHK005).
- Testes existentes mapeados: `optimization.test.ts`, `regroup-waste.test.ts`,
  `phantom-dimension.test.ts`, `piece-counting.test.ts`, `quantity-groups.test.ts`,
  `rotation-bug.test.ts`, `rotation-async.test.ts`.
- Este checklist valida **lacunas de requisito/cobertura**, não executa testes.
  Fechá-las é trabalho de `/speckit-tasks` + implementação.
