# Quickstart — Validação do agrupamento por altura próxima

## Pré-requisitos

- `npm install` já executado
- Relatório-âncora do usuário disponível para importação (`of_geral_parcial (3).xls`)
- Baseline atual conhecida: **31 chapas** no âncora (spec 015)

## 1. Testes unitários (rápido, obrigatório)

```bash
npx vitest run src/test/consolidate-columns-x.test.ts
```

Esperado: os 5 casos existentes continuam verdes (regressão C9 do contrato) mais os casos novos
G1–G9 de [contracts/column-grouping-contract.md](./contracts/column-grouping-contract.md).

## 2. Checagem de tipos

```bash
npx tsc -p tsconfig.app.json --noEmit
```

(O `tsc --noEmit` na raiz é no-op — use o comando acima.)

## 3. Suíte completa e benchmark de regressão

```bash
npm test
```

Julgue pelo SUMÁRIO, não pelo exit code (há um flake conhecido do worker do vitest).
`heuristics-benchmark.test.ts` não pode regredir em aproveitamento.

## 4. Validação visual do cenário-âncora (SC-001)

1. `npm run dev` e abrir o app
2. Configurar a chapa com a **Quebra Mínima** em 50 mm
3. Importar o relatório-âncora e gerar o plano
4. Localizar a chapa com as peças `02545/26` (altura 2388) e `02554/26` (altura 2320)

**Esperado**: as duas peças aparecem lado a lado numa MESMA faixa de altura 2388; a peça de 2320
mostra um pequeno resíduo de 68 mm acima dela; a sobra acima da faixa é UM bloco contínuo com a
largura somada das duas colunas — não duas sobras separadas.

**Falha típica a procurar**: peça de 2320 desenhada com altura 2388 (peça fantasma — violação
de FR-006). Se aparecer, o corte de correção não foi emitido.

## 5. Medição do número de chapas (SC-002 — decide a feature)

Mesmo plano do passo 4, ler o total de chapas.

- **Aceite**: ≤ 31 chapas
- **Reprovado**: > 31 chapas — reverter ou investigar antes de commitar

Nem o benchmark nem os testes unitários medem número de chapas; só o app decide. Anote o número
medido no `CLAUDE.md` junto com a spec, como nas specs anteriores.

## 6. Verificação de conservação (SC-003)

No plano gerado, conferir que o total de peças alocadas bate com o relatório importado
(268 peças no âncora) e que nenhuma medida exibida difere do inventário.
