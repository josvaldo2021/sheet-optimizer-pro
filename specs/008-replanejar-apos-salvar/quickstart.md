# Quickstart — Validação: replanejar após salvar layout com repetições

**Feature**: `specs/008-replanejar-apos-salvar`

## Pré-requisitos

```bash
npm install        # se ainda não instalado
```

## 1. Gates automatizados

```bash
npm test                                 # suíte completa (vitest)
npx tsc -p tsconfig.app.json --noEmit    # checagem de tipos real
```

Esperado:

- `src/test/layout-replication.test.ts` verde (contrato C1–C7 + conservação —
  ver [contracts/layout-replication-contract.md](./contracts/layout-replication-contract.md));
- `src/test/heuristics-benchmark.test.ts` e `src/test/ga-determinism.test.ts`
  inalterados e verdes (nenhuma regressão de aproveitamento/determinismo);
- tsc sem erros.

## 2. Validação manual do fluxo (dev server)

```bash
npm run dev
```

Cenário base — inventário que força peças espalhadas entre layouts:

1. Cadastre peças de poucas dimensões distintas com quantidades altas
   (ex.: `600×400 ×30`, `300×200 ×50`, `800×250 ×12`) e gere o plano automático
   ("todas as chapas").
2. Selecione o primeiro layout e verifique repetições — anote o `×N` exibido e o
   BOM (Precisa/Disponível/Máx Rep.).
3. Salve com o `N` máximo. **Esperado** (User Stories 1–3):
   - os layouts automáticos antigos somem da lista;
   - as N cópias aparecem como layouts salvos (manuais);
   - se sobraram peças, um novo plano é gerado automaticamente (indicador de
     progresso visível durante o cálculo) cobrindo só o restante;
   - mensagem final informa cópias salvas, replanejamento, chapas novas e peças
     restantes.
4. Confira a conservação: some as peças das cópias salvas + peças dos novos
   layouts + inventário restante = quantidades cadastradas no passo 1; nenhuma
   quantidade negativa em nenhum momento.
5. Confirme um lote com os layouts do novo plano — deduções fecham sem furo.

Cenários de borda:

- **N consome tudo**: inventário exato para N cópias → após salvar, nenhum plano
  novo é gerado; lista contém apenas os layouts salvos.
- **Sem plano automático ativo**: desenhe um layout manual (sem gerar plano) e
  salve → comportamento legado, sem replanejamento (FR-009).
- **Trocar de variante após salvar**: com cópias salvas presentes, troque o
  grupo de otimização → as cópias salvas permanecem na lista (FR-005 / S6).
- **Determinismo**: repita o cenário base do zero com os mesmos dados → mesmo
  plano replanejado, mesmas quantidades (FR-008).

## Referências

- Regras e transições: [data-model.md](./data-model.md)
- Contrato do módulo puro e do fluxo: [contracts/layout-replication-contract.md](./contracts/layout-replication-contract.md)
- Decisões de desenho: [research.md](./research.md)
