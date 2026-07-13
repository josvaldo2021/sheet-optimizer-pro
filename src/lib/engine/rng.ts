// CNC Cut Plan Engine — PRNG determinístico (spec 007, candidato C1)
//
// mulberry32: gerador rápido de 32 bits com semente, suficiente para uso em
// metaheurísticas (não é criptográfico). Mesmo algoritmo espelhado no motor
// Rust (wasm-engine/src/genetic.rs) — Princípio VI (paridade TS↔WASM).
//
// Princípio V da constituição: componentes com aleatoriedade devem ser
// reprodutíveis. Todo consumo de aleatoriedade do motor deve passar por aqui
// com semente fixa — nunca por Math.random.

/** Semente default do algoritmo genético (mesma constante no Rust). */
export const DEFAULT_GA_SEED = 0x5eed2026;

/** Retorna um gerador determinístico de números em [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
