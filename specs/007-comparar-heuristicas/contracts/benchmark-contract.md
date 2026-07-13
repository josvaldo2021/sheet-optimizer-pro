# Contrato — Harness de Benchmark e Regras de Adoção

Interface entre o harness (`src/test/heuristics-benchmark.test.ts`), o baseline
persistido (`src/test/fixtures/benchmark-baseline.json`) e qualquer evolução futura do
motor. Vale para esta feature e para as próximas que mexam em aproveitamento.

## 1. Formato do baseline (`benchmark-baseline.json`)

```jsonc
{
  "versao": "baseline-2026-07",        // identificação da versão do algoritmo medida
  "geradoEm": "2026-07-XX",
  "cenarios": [
    {
      "nome": "pequenas-alto-volume",
      "perfil": "alto-volume",
      "chapa": { "w": 2750, "h": 1830, "ml": 10, "mr": 10, "mt": 10, "mb": 10, "minBreak": 10 },
      "permiteRotacao": true,
      "pecas": [ { "w": 300, "h": 200, "qty": 120 } ]
    }
  ],
  "baseline": [
    {
      "cenario": "pequenas-alto-volume",
      "aproveitamento": 91.37,          // %, 2 casas, derivado da árvore
      "chapas": 3,
      "pecasAlocadas": 120
    }
  ]
}
```

Invariantes:

- ≥ 5 cenários cobrindo os perfis: `pecas-pequenas`, `pecas-grandes`, `misto`,
  `alto-volume`, `restricoes-agressivas`.
- Métricas derivadas exclusivamente da `TreeNode` (área posicionada e percurso de
  folhas ignorando `label`). Set-difference com inventário é proibido (Princípio IV).
- Baseline mede o caminho **determinístico** do motor. O GA só entra quando semeado.

## 2. Comportamento do harness (contrato de teste)

Para cada cenário, o harness:

1. Executa o plano multi-chapa completo (loop equivalente ao `runAllSheets`) com o
   motor atual.
2. Compara com a entrada correspondente em `baseline`:
   - **FALHA** se `aproveitamento` < baseline − 0,005 p.p. (tolerância só de
     arredondamento) em qualquer cenário;
   - **FALHA** se `chapas` > baseline em qualquer cenário;
   - **FALHA** se `pecasAlocadas` < baseline em qualquer cenário.
3. Executa o cenário **duas vezes** e **FALHA** se os planos não forem idênticos
   (determinismo, SC-006).

O harness roda dentro de `npm test` — regressão de aproveitamento quebra a build como
qualquer teste.

## 3. Regras de adoção de uma técnica candidata (gate da Fase B)

Uma mudança de motor motivada por técnica candidata só é adotada se, com a mudança
aplicada:

1. O harness passa integralmente (nenhuma regressão, item 2).
2. Ao menos 1 cenário melhora de forma **mensurável**: ≥ 0,5 p.p. de aproveitamento
   **ou** ≥ 1 chapa a menos (SC-005). Exceção C1 (PRNG semeado): o critério é o teste
   de determinismo do GA, não ganho de aproveitamento.
3. Determinismo preservado (item 2.3); técnica com aleatoriedade exige semente fixa.
4. Paridade TS↔WASM: os dois motores mudam no mesmo PR; teste de paridade passa.
5. Melhora legítima que altera a saída de um cenário (mais área ou mesma área com
   melhor compacidade) exige **atualização explícita do baseline** com nova `versao` e
   nota no PR justificando como melhora — nunca atualização silenciosa.

Candidata reprovada: mudança revertida, resultado da medição registrado em
`priorizacao.md` (campo `resultadoMedicao`) — FR-007.

## 4. Restrições às mudanças de motor (herdadas da spec 005)

- Novas estratégias/variantes entram **no fim** dos conjuntos existentes
  (correspondência posicional TS ↔ Rust preservada; nada de reordenar índices 0..13).
- Critério de seleção do torneio (`>` de área, `<` de compacidade, empate preserva
  incumbente) **não muda** nesta feature.
- API pública do motor (`optimizeV6`, `optimizeGeneticAsync`) não muda de assinatura;
  C1 pode adicionar parâmetro **opcional** de semente com default fixo.
