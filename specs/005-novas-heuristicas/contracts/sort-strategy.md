# Contract — Sort Strategy (interno do motor)

Interface interna (não exposta a rede/usuário). Contratada entre os dois motores
para garantir paridade (Princípio VI).

## TS — `getSortStrategies()` em `src/lib/engine/optimizer.ts`

Retorna `Array<(a: Piece, b: Piece) => number>`. Cada função:

- Recebe duas `Piece` e retorna um número: `<0` se `a` vem antes de `b`, `>0` se
  depois, `0` se equivalentes (deve evitar `0` via desempate).
- É pura e determinística (INV-1..INV-3 do data-model).

**Adições (índices 12 e 13), acrescentadas ao FINAL do array:**

```
// idx 12 — H1: altura ascendente (menor altura primeiro), desempate largura asc
(a, b) => a.h - b.h || a.w - b.w,
// idx 13 — H2: largura ascendente (simétrico de H1), desempate altura asc
(a, b) => a.w - b.w || a.h - b.h,
```

> Nota: uma proposta inicial (`largura↓ || área↓` / `altura↓ || área↓`) foi
> descartada por ser **redundante** com os idx 3 e 2 (com dimensão primária fixa,
> área ordena igual à outra dimensão). As ordenações **ascendentes** acima são
> genuinamente novas — ver `research.md` Decisão 2.

Tamanho do array passa de 12 para 14. Nenhuma entrada 0–11 é alterada ou reordenada.

## Rust — `cmp_by_strategy` / `NUM_SORT_STRATEGIES` em `wasm-engine/src/optimizer.rs`

Assinatura: `pub fn cmp_by_strategy(a: &Piece, b: &Piece, idx: usize) -> std::cmp::Ordering`.

**Adições — novos arms com a MESMA semântica dos índices TS:**

```rust
12 => a.h.partial_cmp(&b.h).unwrap_or(std::cmp::Ordering::Equal)
        .then_with(|| a.w.partial_cmp(&b.w).unwrap_or(std::cmp::Ordering::Equal)),
13 => a.w.partial_cmp(&b.w).unwrap_or(std::cmp::Ordering::Equal)
        .then_with(|| a.h.partial_cmp(&b.h).unwrap_or(std::cmp::Ordering::Equal)),
```

E bump da constante:

```rust
pub const NUM_SORT_STRATEGIES: usize = 14; // era 12
```

`genetic.rs` e `post_processing.rs` consomem `NUM_SORT_STRATEGIES` — herdam sem
edição. Rebuild do WASM necessário após a mudança.

## Invariantes do contrato

1. **Correspondência posicional**: índice do array TS == `idx` do match Rust, para
   toda estratégia (0–13). As novas ocupam 12 e 13 em ambos.
2. **Equivalência de resultado**: para qualquer conjunto de peças, a ordem produzida
   por `getSortStrategies()[i]` (TS) é idêntica à de `cmp_by_strategy(_, _, i)` (Rust).
3. **Aditividade**: 0–11 inalterados; só se acrescenta 12 e 13.
4. **Efeito no torneio**: apenas amplia o conjunto avaliado por `optimizeV6` e pelo
   algoritmo genético (que reusam o registro). Não altera o critério de seleção do
   melhor plano.

## Verificação do contrato

- **Contagem**: `getSortStrategies().length === 14` (TS) e `NUM_SORT_STRATEGIES === 14`
  (Rust) — asserção de teste.
- **Paridade**: para um conjunto de fixtures, `optimizeV6` TS e WASM produzem plano
  equivalente (mesma área ocupada e mesma contagem de peças alocadas).
- **Estabilidade dos existentes**: um teste de regressão fixa o comportamento de
  cenários que já eram ótimos com 0–11 (a saída não muda por causa das adições,
  salvo melhora explícita documentada).
