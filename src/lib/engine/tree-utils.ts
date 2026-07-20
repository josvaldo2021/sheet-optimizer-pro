// CNC Cut Plan Engine — Tree Manipulation Utilities

import { NodeType, TreeNode, PieceItem, Piece } from './types';

let _c = 0;
export function gid(): string {
  return `n${++_c}_${Math.random().toString(36).substr(2, 4)}`;
}

export function createRoot(w: number, h: number): TreeNode {
  return { id: "root", tipo: "ROOT", valor: w, multi: 1, filhos: [] };
}

export function cloneTree(t: TreeNode): TreeNode {
  return JSON.parse(JSON.stringify(t));
}

export function findNode(n: TreeNode, id: string): TreeNode | null {
  if (n.id === id) return n;
  for (const f of n.filhos) {
    const r = findNode(f, id);
    if (r) return r;
  }
  return null;
}

export function findParentOfType(tree: TreeNode, nodeId: string, tipo: NodeType): TreeNode | null {
  function findParent(n: TreeNode, tid: string): TreeNode | null {
    for (const f of n.filhos) {
      if (f.id === tid) return n;
      const r = findParent(f, tid);
      if (r) return r;
    }
    return null;
  }

  const parent = findParent(tree, nodeId);
  if (!parent) return null;
  return parent.tipo === tipo ? parent : findParentOfType(tree, parent.id, tipo);
}

export function insertNode(tree: TreeNode, selectedId: string, tipo: NodeType, valor: number, multi: number): string {
  const node: TreeNode = { id: gid(), tipo, valor, multi, filhos: [] };
  const target = findNode(tree, selectedId);

  if (tipo === "X") {
    tree.filhos.push(node);
  } else if (tipo === "Y") {
    const p = target?.tipo === "X" ? target : findParentOfType(tree, selectedId, "X");
    if (p) p.filhos.push(node);
  } else if (tipo === "Z") {
    const p = target?.tipo === "Y" ? target : findParentOfType(tree, selectedId, "Y");
    if (p) p.filhos.push(node);
  } else if (tipo === "W") {
    const p = target?.tipo === "Z" ? target : findParentOfType(tree, selectedId, "Z");
    if (p) p.filhos.push(node);
  } else if (tipo === "Q") {
    const p = target?.tipo === "W" ? target : findParentOfType(tree, selectedId, "W");
    if (p) p.filhos.push(node);
  } else if (tipo === "R") {
    const p = target?.tipo === "Q" ? target : findParentOfType(tree, selectedId, "Q");
    if (p) p.filhos.push(node);
  }

  return node.id;
}

export function deleteNode(tree: TreeNode, id: string): void {
  const rm = (n: TreeNode) => {
    n.filhos = n.filhos.filter((f) => f.id !== id);
    n.filhos.forEach(rm);
  };
  rm(tree);
}

export function calcAllocation(
  tree: TreeNode,
  selectedId: string,
  tipo: NodeType,
  valor: number,
  multi: number,
  usableW: number,
  usableH: number,
  minBreak: number = 0,
): { allocated: number; error?: string } {
  const target = findNode(tree, selectedId);
  let free = 0;

  if (tipo === "X") {
    free = usableW - tree.filhos.reduce((a, f) => a + f.valor * f.multi, 0);
  } else if (tipo === "Y") {
    const xP = target?.tipo === "X" ? target : findParentOfType(tree, selectedId, "X");
    if (!xP) return { allocated: 0, error: "Selecione X" };
    free = usableH - xP.filhos.reduce((a, f) => a + f.valor * f.multi, 0);
  } else if (tipo === "Z") {
    const yP = target?.tipo === "Y" ? target : findParentOfType(tree, selectedId, "Y");
    if (!yP) return { allocated: 0, error: "Selecione Y" };
    const xP = findParentOfType(tree, yP.id, "X");
    if (!xP) return { allocated: 0, error: "Selecione Y" };
    free = xP.valor - yP.filhos.reduce((a, f) => a + f.valor * f.multi, 0);
  } else if (tipo === "W") {
    const zP = target?.tipo === "Z" ? target : findParentOfType(tree, selectedId, "Z");
    if (!zP) return { allocated: 0, error: "Selecione Z" };
    const yP = findParentOfType(tree, zP.id, "Y");
    if (!yP) return { allocated: 0, error: "Selecione Z" };
    free = yP.valor - zP.filhos.reduce((a, w) => a + w.valor * w.multi, 0);
  } else if (tipo === "Q") {
    const wP = target?.tipo === "W" ? target : findParentOfType(tree, selectedId, "W");
    if (!wP) return { allocated: 0, error: "Selecione W" };
    const zP = findParentOfType(tree, wP.id, "Z");
    if (!zP) return { allocated: 0, error: "Selecione Z" };
    const occupiedQ = wP.filhos.reduce((a, f) => a + f.valor * f.multi, 0);
    free = zP.valor - occupiedQ;
  } else if (tipo === "R") {
    const qP = target?.tipo === "Q" ? target : findParentOfType(tree, selectedId, "Q");
    if (!qP) return { allocated: 0, error: "Selecione Q" };
    const wP = findParentOfType(tree, qP.id, "W");
    if (!wP) return { allocated: 0, error: "Selecione W" };
    const occupiedR = qP.filhos.reduce((a, f) => a + f.valor * f.multi, 0);
    free = wP.valor - occupiedR;
  }

  const alloc = Math.min(multi, Math.floor(free / valor));
  if (alloc <= 0) return { allocated: 0, error: "Sem espaço" };

  if (minBreak > 0) {
    let siblings: TreeNode[] = [];
    if (tipo === "X") {
      siblings = tree.filhos;
    } else if (tipo === "Y") {
      const xP = target?.tipo === "X" ? target : findParentOfType(tree, selectedId, "X");
      if (xP) siblings = xP.filhos;
    } else if (tipo === "Z") {
      const yP = target?.tipo === "Y" ? target : findParentOfType(tree, selectedId, "Y");
      if (yP) siblings = yP.filhos;
    } else if (tipo === "W") {
      const zP = target?.tipo === "Z" ? target : findParentOfType(tree, selectedId, "Z");
      if (zP) siblings = zP.filhos;
    } else if (tipo === "Q") {
      const wP = target?.tipo === "W" ? target : findParentOfType(tree, selectedId, "W");
      if (wP) siblings = wP.filhos;
    } else if (tipo === "R") {
      const qP = target?.tipo === "Q" ? target : findParentOfType(tree, selectedId, "Q");
      if (qP) siblings = qP.filhos;
    }
    for (const sib of siblings) {
      const diff = Math.abs(sib.valor - valor);
      if (diff > 0 && diff < minBreak) {
        return { allocated: 0, error: `Distância de quebra insuficiente: ${diff}mm < ${minBreak}mm` };
      }
    }
  }

  return { allocated: alloc };
}

export function calcPlacedArea(tree: TreeNode): number {
  let area = 0;

  function procX(x: TreeNode) {
    for (let ix = 0; ix < x.multi; ix++) {
      for (const y of x.filhos) {
        for (let iy = 0; iy < y.multi; iy++) {
          if (y.filhos.length === 0) {
            // Y-folha = peça (largura da coluna X × altura da linha Y). Ocorre quando
            // um corte Z redundante é colapsado (collapseRedundantCuts).
            area += x.valor * y.valor;
            continue;
          }
          for (const z of y.filhos) {
            for (let iz = 0; iz < z.multi; iz++) {
              if (z.filhos.length === 0) {
                area += z.valor * y.valor;
              } else {
                for (const w of z.filhos) {
                  for (let iw = 0; iw < w.multi; iw++) {
                    if (w.filhos.length === 0) {
                      area += z.valor * w.valor;
                    } else {
                      for (const q of w.filhos) {
                        for (let iq = 0; iq < q.multi; iq++) {
                          if (q.filhos.length === 0) {
                            area += q.valor * w.valor;
                          } else {
                            for (const r of q.filhos) {
                              for (let ir = 0; ir < r.multi; ir++) {
                                area += q.valor * r.valor;
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  tree.filhos.forEach(procX);
  return area;
}

// ─── Yield (aproveitamento) helpers ──────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Spec 013 — "Cortar até o final primeiro": consolidação da sobra lateral.
//
// Numa coluna Z, o placement abre uma faixa W da ALTURA EXATA de cada peça e
// deixa um retalho à direita de CADA faixa. Quando peças de MESMA largura se
// empilham, esses retalhos são fatias do MESMO bloco. Esta passada funde as
// faixas W (mesma largura de Q-folha) numa só faixa de altura somada, com um Q de
// altura cheia e as peças empilhadas como R — isolando a sobra lateral como UM
// bloco reutilizável. As peças NÃO se movem (mesma posição/medida); só a
// representação da sobra muda ⇒ conservação preservada (validável por spec 012).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Consolida in-place a sobra lateral de colunas com peças de mesma largura
 * empilhadas ("cortar até o final primeiro"). Idempotente.
 *
 * O padrão de fragmentação ocorre em DOIS níveis da hierarquia guilhotina
 * (X→Y→Z→W→Q→R), conforme a orientação do corte que o motor escolheu:
 *   - `X → Y-linhas → Z` (o caminho do GA / strip horizontal): cada peça numa
 *     linha `Y` própria, com um `Z` mais estreito que a coluna deixando um gap.
 *   - `Z → W-bandas → Q` (o caminho por coluna): cada peça numa banda `W`, com um
 *     `Q` mais estreito que o `Z`.
 * Os dois são o MESMO fenômeno num nível diferente e são consolidados igual:
 * fundir a corrida de bandas de mesma largura numa só banda de altura somada, com
 * a sub-coluna cheia e as peças empilhadas na sub-banda seguinte.
 */
export function consolidateColumns(tree: TreeNode): void {
  // Consolida, dentro de cada nó `containerType`, corridas de `bandType` cujo
  // único filho é uma `subColType` (mais estreita que o container) segurando uma
  // peça (folha rotulada, direta ou via uma única `subBandType`-folha).
  const applyLevel = (
    containerType: NodeType, bandType: NodeType, subColType: NodeType, subBandType: NodeType,
  ) => {
    const containers: TreeNode[] = [];
    const collect = (n: TreeNode) => { if (n.tipo === containerType) containers.push(n); n.filhos.forEach(collect); };
    collect(tree);

    for (const container of containers) {
      const cw = container.valor;
      // Info da banda consolidável: { banda, largura da sub-coluna, rótulo }.
      const info = (band: TreeNode): { band: TreeNode; width: number; label: string } | null => {
        if (band.tipo !== bandType || band.multi !== 1 || band.filhos.length !== 1) return null;
        const s = band.filhos[0];
        if (s.tipo !== subColType || s.multi !== 1) return null;
        let label: string | undefined;
        if (s.filhos.length === 0 && s.label) label = s.label;
        else if (s.filhos.length === 1 && s.filhos[0].tipo === subBandType &&
                 s.filhos[0].multi === 1 && s.filhos[0].filhos.length === 0 && s.filhos[0].label) {
          label = s.filhos[0].label;
        }
        if (!label) return null;
        return { band, width: s.valor, label };
      };

      const out: TreeNode[] = [];
      let i = 0;
      while (i < container.filhos.length) {
        const bi = info(container.filhos[i]);
        if (bi && bi.width < cw - 0.5) {
          const run = [bi];
          let j = i + 1;
          while (j < container.filhos.length) {
            const nj = info(container.filhos[j]);
            if (nj && Math.abs(nj.width - bi.width) < 0.5) { run.push(nj); j++; }
            else break;
          }
          if (run.length >= 2) {
            const totalH = run.reduce((s, r) => s + r.band.valor, 0);
            const subBands: TreeNode[] = run.map((r) => ({
              id: gid(), tipo: subBandType, valor: r.band.valor, multi: 1, filhos: [], label: r.label,
            }));
            const mergedSub: TreeNode = { id: gid(), tipo: subColType, valor: bi.width, multi: 1, filhos: subBands };
            out.push({ id: gid(), tipo: bandType, valor: totalH, multi: 1, filhos: [mergedSub] });
            i = j;
            continue;
          }
        }
        out.push(container.filhos[i]);
        i++;
      }
      container.filhos = out;
    }
  };

  applyLevel("X", "Y", "Z", "W"); // Y-linhas sob X (caminho do GA)
  applyLevel("Z", "W", "Q", "R"); // W-bandas sob Z (caminho por coluna)
}

/**
 * Returns the dimensions of the LAST leftover generated by the plan.
 *
 * Generation order (earliest → latest):
 *   W/Q/R-gaps  →  Z-gaps  →  row-gaps  →  column-gap
 *
 * So we check from outermost inward: column-gap is the most recently generated
 * leftover; if absent we recurse into the last column, last row, last Z, etc.
 */
export function getLastLeftover(
  tree: TreeNode,
  usableW: number,
  usableH: number,
): { w: number; h: number } | null {
  if (tree.filhos.length === 0) {
    // Empty plan — full sheet is leftover
    return { w: usableW, h: usableH };
  }

  // ── Level 1: column gap (right-side strip after all X columns) ──
  const usedColW = tree.filhos.reduce((s, x) => s + x.valor * x.multi, 0);
  if (usedColW < usableW) {
    return { w: usableW - usedColW, h: usableH };
  }

  // ── Level 2: row gap at the bottom of the LAST column ──
  const lastX = tree.filhos[tree.filhos.length - 1];
  if (lastX.filhos.length === 0) {
    // Column exists but has no rows → entire column height is leftover
    return { w: lastX.valor, h: usableH };
  }
  const usedRowH = lastX.filhos.reduce((s, y) => s + y.valor * y.multi, 0);
  if (usedRowH < usableH) {
    return { w: lastX.valor, h: usableH - usedRowH };
  }

  // ── Level 3: Z gap at the right of the LAST row in the last column ──
  const lastY = lastX.filhos[lastX.filhos.length - 1];
  if (lastY.filhos.length === 0) {
    // Row exists but has no Z pieces → full row width is leftover
    return { w: lastX.valor, h: lastY.valor };
  }
  const usedZW = lastY.filhos.reduce((s, z) => s + z.valor * z.multi, 0);
  if (usedZW < lastX.valor) {
    return { w: lastX.valor - usedZW, h: lastY.valor };
  }

  // ── Level 4: W gap at the bottom of the LAST Z ──
  const lastZ = lastY.filhos[lastY.filhos.length - 1];
  if (lastZ.filhos.length === 0) {
    // Z is a leaf piece — no sub-structure, no further gap
    return null;
  }
  const usedWH = lastZ.filhos.reduce((s, w) => s + w.valor * w.multi, 0);
  if (usedWH < lastY.valor) {
    return { w: lastZ.valor, h: lastY.valor - usedWH };
  }

  // ── Level 5: Q gap at the right of the LAST W ──
  const lastW = lastZ.filhos[lastZ.filhos.length - 1];
  if (lastW.filhos.length === 0) return null;
  const usedQW = lastW.filhos.reduce((s, q) => s + q.valor * q.multi, 0);
  if (usedQW < lastZ.valor) {
    return { w: lastZ.valor - usedQW, h: lastW.valor };
  }

  // ── Level 6: R gap at the bottom of the LAST Q ──
  const lastQ = lastW.filhos[lastW.filhos.length - 1];
  if (lastQ.filhos.length === 0) return null;
  const usedRH = lastQ.filhos.reduce((s, r) => s + r.valor * r.multi, 0);
  if (usedRH < lastW.valor) {
    return { w: lastQ.valor, h: lastW.valor - usedRH };
  }

  return null; // Fully packed — no leftover
}

// ─────────────────────────────────────────────────────────────────────────────
// Spec 011 — Lookahead residual: consolidar a sobra que recebe a próxima peça.
//
// `getLastLeftover` devolve só o gap gerado por ÚLTIMO. Para o critério de
// seleção precisamos do MAIOR retângulo livre da chapa inteira — então
// `largestFreeRect` varre TODOS os níveis coletando cada gap e devolve o de maior
// área. Puro, derivado 100% da árvore (Princípio IV). Ver
// specs/011-lookahead-residual-sobra/contracts/residual-lookahead-contract.md.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maior retângulo de espaço livre da chapa (por área), ou `null` se não há
 * espaço livre. Generaliza `getLastLeftover`: em vez de só o gap final, coleta o
 * gap de cada nível guilhotina (faixa à direita das colunas X; fundo de cada
 * coluna; direita de cada linha; fundo de cada Z; direita de cada W; fundo de
 * cada Q) e retorna o maior.
 */
export function largestFreeRect(
  tree: TreeNode,
  usableW: number,
  usableH: number,
): { w: number; h: number } | null {
  if (tree.filhos.length === 0) return { w: usableW, h: usableH };

  const EPS = 0.5;
  let best: { w: number; h: number } | null = null;
  const consider = (w: number, h: number) => {
    if (w > EPS && h > EPS && (!best || w * h > best.w * best.h)) best = { w, h };
  };

  // Nível 1: faixa livre à direita, após todas as colunas X (altura cheia).
  const usedColW = tree.filhos.reduce((s, x) => s + x.valor * x.multi, 0);
  consider(usableW - usedColW, usableH);

  for (const X of tree.filhos) {
    if (X.filhos.length === 0) continue; // coluna-folha (peça): sem sub-gaps
    const cw = X.valor;
    // Nível 2: fundo da coluna (largura da coluna × altura livre).
    const usedRowH = X.filhos.reduce((s, y) => s + y.valor * y.multi, 0);
    consider(cw, usableH - usedRowH);

    for (const Y of X.filhos) {
      if (Y.filhos.length === 0) continue; // Y folha = peça
      const rh = Y.valor;
      // Nível 3: à direita da linha (largura livre × altura da linha).
      const usedZW = Y.filhos.reduce((s, z) => s + z.valor * z.multi, 0);
      consider(cw - usedZW, rh);

      for (const Z of Y.filhos) {
        if (Z.filhos.length === 0) continue; // Z folha = peça
        const zw = Z.valor;
        // Nível 4: fundo do Z.
        const usedWH = Z.filhos.reduce((s, w) => s + w.valor * w.multi, 0);
        consider(zw, rh - usedWH);

        for (const Wn of Z.filhos) {
          if (Wn.filhos.length === 0) continue; // W folha = peça
          const wh = Wn.valor;
          // Nível 5: à direita do W.
          const usedQW = Wn.filhos.reduce((s, q) => s + q.valor * q.multi, 0);
          consider(zw - usedQW, wh);

          for (const Q of Wn.filhos) {
            if (Q.filhos.length === 0) continue; // Q folha = peça
            const qw = Q.valor;
            // Nível 6: fundo do Q (R é sempre folha, sem gap abaixo).
            const usedRH = Q.filhos.reduce((s, r) => s + r.valor * r.multi, 0);
            consider(qw, wh - usedRH);
          }
        }
      }
    }
  }

  return best;
}

/**
 * AGRUPAMENTO EM X (irmão horizontal da consolidação da spec 013). No nível ROOT, o
 * placement guloso deixa peças de MESMA ALTURA lado a lado como N colunas
 * INDEPENDENTES de altura cheia — cada uma com sua sobrinha no topo (fragmentação).
 * Ex.: 6× `X(393)→…→(peça 393×2500)` ⇒ 6 sobras de 393×690. Este passo agrupa
 * CORRIDAS de colunas adjacentes, cada uma com UMA peça que preenche a largura da
 * coluna e a MESMA altura `h < usableH`, numa faixa comum `X(Σw)→Y(h)→Z(w_i)[peça]`,
 * deixando a sobra do topo (`usableH−h`) como UMA tira única IMPLÍCITA (largura Σw).
 * Peças não se movem (mesma medida/posição relativa) ⇒ conservação preservada. Muta a
 * árvore. Pós-processo PURO no plano (não muda o motor).
 */
/** Coluna candidata a agrupamento (spec 016). `colW` = largura da COLUNA (conserva a
 *  largura da chapa na soma); `w`/`h` = medida da PEÇA; `idx` = posição original. */
type ColumnInfo = { colW: number; w: number; h: number; label?: string; idx: number };

export type XFill = {
  pool: Piece[];
  minBreak: number;
  optimize: (pieces: Piece[], w: number, h: number, minBreak: number) => { tree: TreeNode };
  // `normalize` injetado (evita import circular tree-utils↔normalization); deixa o
  // sub-preenchimento RASO antes do remap X→Z (senão estoura o teto de 6 níveis).
  normalize: (tree: TreeNode, w: number, h: number, minBreak: number) => TreeNode;
};

export function consolidateColumnsX(
  tree: TreeNode, usableW: number, usableH: number, fill?: XFill, tol?: number,
): void {
  if (tree.tipo !== "ROOT" || tree.filhos.length < 2) return;
  const EPS = 0.5;
  // Spec 016 — três estados de `tol` (ver contracts/column-grouping-contract.md):
  //   omitido  → agrupamento por altura PRÓXIMA DESLIGADO (só alturas idênticas: spec 015)
  //   0        → sem piso físico; só a guarda econômica decide
  //   > 0      → piso de MAQUINABILIDADE: o resíduo de correção (a diferença de altura)
  //              precisa ter ao menos `tol` para a serra conseguir cortá-lo.
  // O piso NÃO é um teto: diferenças grandes são barradas pela guarda econômica.
  const nearEnabled = tol !== undefined;
  const floor = tol ?? 0;
  // Coluna X com UMA peça, altura `h < usableH`. Aceita coluna MAIS LARGA que a peça
  // (ex.: última coluna que absorveu o resíduo de largura, X414 p/ peça de 393): o
  // total usa a largura da COLUNA (`colW`, conserva a largura da chapa) e a faixa usa
  // a largura da PEÇA (`w`); a diferença vira uma sobrinha à direita na faixa.
  const single = (x: TreeNode, idx: number): ColumnInfo | null => {
    if (x.tipo !== "X" || x.multi !== 1) return null;
    const leaves = extractLeafPieces(x);
    if (leaves.length !== 1) return null;
    const lf = leaves[0];
    if (lf.w > x.valor + EPS) return null;   // a peça precisa caber na largura da coluna
    if (lf.h >= usableH - EPS) return null;  // precisa haver sobra no topo
    return { colW: x.valor, w: lf.w, h: lf.h, label: lf.label, idx };
  };

  // Monta a faixa agrupada de um conjunto (sem preencher a tira). Peça de altura
  // igual à da faixa é folha `Z`; peça mais BAIXA ganha o CORTE DE CORREÇÃO
  // `Z(w) → W(h)`, que preserva a altura ORIGINAL e deixa o resíduo
  // `w × (bandH − h)` livre acima dela, dentro da própria sub-coluna.
  const buildBandX = (members: ColumnInfo[]): TreeNode => {
    const bandH = members.reduce((m, r) => Math.max(m, r.h), 0);
    const wSum = members.reduce((a, r) => a + r.colW, 0);
    const band: TreeNode = {
      id: gid(), tipo: "Y", valor: bandH, multi: 1,
      filhos: members.map((r) => {
        const z: TreeNode = { id: gid(), tipo: "Z", valor: r.w, multi: 1, filhos: [] };
        if (r.h >= bandH - EPS) { z.label = r.label; return z; }
        z.filhos.push({ id: gid(), tipo: "W", valor: r.h, multi: 1, filhos: [], label: r.label });
        return z;
      }),
    };
    return { id: gid(), tipo: "X", valor: wSum, multi: 1, filhos: [band] };
  };

  // Já-colocadas na chapa toda (não reusar ao preencher a tira).
  const placed = new Set<string>();
  if (fill) for (const lf of extractLeafPieces(tree)) if (lf.label) placed.add(lf.label);

  // Preenche a tira do topo (wSum × stripH) da coluna agrupada, se `fill` dado.
  const fillStrip = (groupedX: TreeNode, wSum: number, stripH: number) => {
    if (!fill || stripH <= fill.minBreak) return;
    const cand = fill.pool.filter(
      (p) => p.label !== undefined && !placed.has(p.label) &&
        ((p.w <= wSum && p.h <= stripH) || (p.h <= wSum && p.w <= stripH)),
    );
    if (cand.length === 0) return;
    const sub = fill.normalize(fill.optimize(cand, wSum, stripH, fill.minBreak).tree, wSum, stripH, fill.minBreak);
    if (sub.filhos.length === 0) return;
    const yStrip: TreeNode = { id: gid(), tipo: "Y", valor: stripH, multi: 1, filhos: [] };
    for (const x of sub.filhos) {
      const z = remapXToZ(x, 2); // X→Z (delta 2): a tira é rasa (Y sob X) ⇒ cabe
      if (z) yStrip.filhos.push(z);
    }
    if (yStrip.filhos.length > 0) {
      for (const lf of extractLeafPieces(yStrip)) if (lf.label) placed.add(lf.label);
      groupedX.filhos.push(yStrip);
    }
  };

  // Classifica cada coluna e forma os conjuntos (mesmo NÃO-adjacentes: colunas só se
  // reordenam horizontalmente, o que é geometricamente válido). A faixa nasce na
  // posição da PRIMEIRA coluna do conjunto; as demais são puxadas para ela.
  //
  // Formação GULOSA determinística (spec 016, research R5): agrupar por tolerância NÃO
  // é relação de equivalência (não é transitiva), então "quem forma conjunto com quem"
  // depende da ORDEM. Ordem total: altura DESC, desempate pelo índice original ASC.
  // A semente é sempre a coluna MAIS ALTA ainda livre — é ela que dita a altura da
  // faixa ("agrupamento baseado na maior").
  const info = tree.filhos.map(single);
  const cands = info.filter((s): s is ColumnInfo => s !== null);
  const order = [...cands].sort((a, b) => b.h - a.h || a.idx - b.idx);

  const clusterOf = new Map<number, ColumnInfo[]>(); // idx da PRIMEIRA coluna → membros
  const consumed = new Set<number>();
  for (let s = 0; s < order.length; s++) {
    const seed = order[s];
    if (consumed.has(seed.idx)) continue;
    const members = [seed];
    // Varre só a partir de `s`: um candidato ANTERIOR é MAIS ALTO que a semente e não
    // pode ser absorvido por ela (a faixa é dimensionada pela semente). Sem esse corte,
    // uma semente baixa "adotaria" a alta com diferença NEGATIVA, que passa no teste de
    // diferença nula — e o agrupamento aconteceria mesmo com a feature desligada.
    for (let k = s + 1; k < order.length; k++) {
      const c = order[k];
      if (consumed.has(c.idx)) continue;
      const diff = seed.h - c.h; // ≥ 0 por construção
      // Admissão FÍSICA: diferença nula (caso da spec 015) ou resíduo cortável.
      if (diff <= EPS || (nearEnabled && diff >= floor - EPS)) members.push(c);
    }
    if (members.length < 2) continue;
    // Guarda ECONÔMICA (spec 016 FR-004): a fusão não pode encolher o maior bloco
    // livre DESTAS colunas. Medida num sub-ROOT com as colunas do conjunto (métrica
    // LOCAL: um bloco grande alheio na chapa mascararia a piora) e ANTES do
    // preenchimento da tira (medir depois reprovaria justo os casos bem-sucedidos).
    if (members.some((m) => m.h < members[0].h - EPS)) {
      const wSum = members.reduce((a, r) => a + r.colW, 0);
      const subRoot = (kids: TreeNode[]): TreeNode =>
        ({ id: gid(), tipo: "ROOT", valor: wSum, multi: 1, filhos: kids });
      const before = largestFreeRect(subRoot(members.map((m) => tree.filhos[m.idx])), wSum, usableH);
      const after = largestFreeRect(subRoot([buildBandX(members)]), wSum, usableH);
      const areaOf = (r: { w: number; h: number } | null) => (r ? r.w * r.h : 0);
      if (areaOf(after) < areaOf(before)) continue; // não compensa: colunas ficam como estão
    }
    members.forEach((m) => consumed.add(m.idx));
    clusterOf.set(Math.min(...members.map((m) => m.idx)), members);
  }

  const out: TreeNode[] = [];
  for (let i = 0; i < tree.filhos.length; i++) {
    const members = clusterOf.get(i);
    if (members) {
      // Membros na ordem ORIGINAL das colunas (a faixa nasce na posição da primeira).
      const ordered = [...members].sort((a, b) => a.idx - b.idx);
      const groupedX = buildBandX(ordered);
      fillStrip(groupedX, groupedX.valor, usableH - groupedX.filhos[0].valor);
      out.push(groupedX);
    } else if (!consumed.has(i)) {
      out.push(tree.filhos[i]); // coluna intacta (não agrupada ou conjunto rejeitado)
    }
  }
  tree.filhos = out;
}

/** Reindexa uma subárvore N níveis para baixo (X→Z p/ delta=2). `null` se passar de R. */
function remapXToZ(n: TreeNode, delta: number): TreeNode | null {
  const BY_LEVEL: Record<number, NodeType> = { 1: "X", 2: "Y", 3: "Z", 4: "W", 5: "Q", 6: "R" };
  const LEVEL: Record<string, number> = { X: 1, Y: 2, Z: 3, W: 4, Q: 5, R: 6 };
  const l = LEVEL[n.tipo];
  if (l === undefined) return null;
  const nl = l + delta;
  if (nl > 6) return null;
  const kids: TreeNode[] = [];
  for (const c of n.filhos) {
    const rc = remapXToZ(c, delta);
    if (!rc) return null;
    kids.push(rc);
  }
  return { id: gid(), tipo: BY_LEVEL[nl], valor: n.valor, multi: n.multi, filhos: kids, label: n.label };
}

/**
 * Colapsa CORTES REDUNDANTES: um nó com um ÚNICO filho-folha cujo corte NÃO
 * subdivide (a folha preenche a dimensão INTEIRA do pai naquele eixo) é uma
 * coordenada desperdiçada — a serra faria um corte na borda, sem efeito. Ex.:
 * `Z(2570)→W(742)→Q(2570 folha)`: o `Q(2570)` repete a largura de `Z(2570)` ⇒
 * removido, `W(742)` vira a folha (peça 2570×742, mesma geometria). NÃO colapsa
 * quando a folha de fato corta (`Z(948)→W(670)→Q(937)`: 937≠948, o Q trima a
 * largura da peça — mantido). Muta a árvore. Bottom-up ⇒ cascateia. Pós-processo
 * PURO no plano (não muda medida/posição de peça); não precisa de espelho WASM.
 */
export function collapseRedundantCuts(tree: TreeNode, usableW: number, usableH: number): void {
  const LEVEL: Record<string, number> = { ROOT: 0, X: 1, Y: 2, Z: 3, W: 4, Q: 5, R: 6 };
  const EPS = 0.5;
  const visit = (n: TreeNode, wn: number, hn: number) => {
    const childLevel = (LEVEL[n.tipo] ?? 0) + 1;
    const widthTiled = childLevel % 2 === 1; // filhos X/Z/Q cortam a LARGURA
    for (const c of n.filhos) {
      if (c.filhos.length === 0) continue; // folha = peça
      if (widthTiled) visit(c, c.valor, hn);
      else visit(c, wn, c.valor);
    }
    // Colapso (após descer): 1 filho-folha que preenche a dimensão inteira do pai.
    // NÃO colapsa ROOT nem X: um X-folha não tem altura de contexto p/ a contagem de
    // área. Y-folha É contada (calcPlacedArea/extractLeafPieces).
    if (n.tipo !== "ROOT" && n.tipo !== "X" && n.filhos.length === 1) {
      const c = n.filhos[0];
      if (c.filhos.length === 0 && c.multi === 1) {
        const spans = widthTiled
          ? Math.abs(c.valor - wn) < EPS
          : Math.abs(c.valor - hn) < EPS;
        if (spans) {
          n.filhos = [];
          if (c.label !== undefined) n.label = c.label;
        }
      }
    }
  };
  visit(tree, usableW, usableH);
}

/**
 * Computes plan utilization according to the aproveitamento.md specification:
 *
 *   Aproveitamento = Área total das peças / (Área total das chapas − Área da última sobra reaproveitável)
 *
 * Only the LAST leftover of the LAST chapa is eligible for reuse discount.
 * All other leftovers are treated as real loss (already tested by the optimizer).
 *
 * @param chapas        All chapas in the plan (tree + usedArea per sheet)
 * @param usableW       Sheet usable width (mm)
 * @param usableH       Sheet usable height (mm)
 * @param minReusableW  Minimum width for a leftover to be considered reusable (default 200 mm)
 * @param minReusableH  Minimum height for a leftover to be considered reusable (default 200 mm)
 * @returns Utilization percentage [0, 100]
 */
export function calcPlanUtilization(
  chapas: Array<{ tree: TreeNode; usedArea: number }>,
  usableW: number,
  usableH: number,
  minReusableW = 200,
  minReusableH = 200,
): number {
  if (chapas.length === 0 || usableW <= 0 || usableH <= 0) return 0;

  const totalPiecesArea = chapas.reduce((s, c) => s + c.usedArea, 0);
  const totalSheetArea = chapas.length * usableW * usableH;

  // Only the last chapa can contribute a reusable leftover
  const lastChapa = chapas[chapas.length - 1];
  const lastLeftover = getLastLeftover(lastChapa.tree, usableW, usableH);

  let reusableArea = 0;
  if (
    lastLeftover &&
    lastLeftover.w >= minReusableW &&
    lastLeftover.h >= minReusableH
  ) {
    reusableArea = lastLeftover.w * lastLeftover.h;
  }

  const denominator = totalSheetArea - reusableArea;
  if (denominator <= 0) return 100;

  return Math.min(100, (totalPiecesArea / denominator) * 100);
}

export function annotateTreeLabels(tree: TreeNode, pieces: PieceItem[]): void {
  const pool: Array<{ w: number; h: number; label: string }> = [];
  pieces.forEach((p) => {
    if (p.label) {
      for (let i = 0; i < p.qty; i++) {
        pool.push({ w: p.w, h: p.h, label: p.label });
      }
    }
  });

  if (pool.length === 0) return;

  function walk(n: TreeNode, parents: TreeNode[]) {
    const yAncestor = [...parents].reverse().find((p) => p.tipo === "Y");
    const zAncestor = [...parents].reverse().find((p) => p.tipo === "Z");
    const wAncestor = [...parents].reverse().find((p) => p.tipo === "W");

    let pieceW = 0, pieceH = 0;
    let isLeaf = false;

    if (n.tipo === "Z" && n.filhos.length === 0) {
      pieceW = n.valor; pieceH = yAncestor?.valor || 0; isLeaf = true;
    } else if (n.tipo === "W" && n.filhos.length === 0) {
      pieceW = zAncestor?.valor || 0; pieceH = n.valor; isLeaf = true;
    } else if (n.tipo === "Q" && n.filhos.length === 0) {
      pieceW = n.valor; pieceH = wAncestor?.valor || 0; isLeaf = true;
    } else if (n.tipo === "R") {
      const qAncestor = [...parents].reverse().find((p) => p.tipo === "Q");
      pieceW = qAncestor?.valor || 0; pieceH = n.valor; isLeaf = true;
    }

    if (isLeaf && pieceW > 0 && pieceH > 0) {
      for (let i = 0; i < pool.length; i++) {
        const p = pool[i];
        if (
          (Math.round(p.w) === Math.round(pieceW) && Math.round(p.h) === Math.round(pieceH)) ||
          (Math.round(p.w) === Math.round(pieceH) && Math.round(p.h) === Math.round(pieceW))
        ) {
          n.label = p.label;
          pool.splice(i, 1);
          break;
        }
      }
    }

    n.filhos.forEach((f) => walk(f, [...parents, n]));
  }

  walk(tree, []);
}

/** Check if a subtree is pure waste (no labels anywhere) */
export function isWasteSubtree(node: TreeNode): boolean {
  if (node.label) return false;
  return node.filhos.every(c => isWasteSubtree(c));
}

/** Calculate area of a Z subtree */
export function calculateZArea(zNode: TreeNode, yHeight: number): number {
  if (zNode.filhos.length === 0) return zNode.valor * yHeight * zNode.multi;
  let area = 0;
  for (const w of zNode.filhos) {
    if (w.filhos.length === 0) {
      area += zNode.valor * w.valor * w.multi;
    } else {
      for (const q of w.filhos) {
        if (q.filhos.length === 0) {
          area += q.valor * w.valor * q.multi;
        } else {
          for (const r of q.filhos) {
            area += q.valor * r.valor * r.multi;
          }
        }
      }
    }
  }
  return area * zNode.multi;
}

/** Calculate area of a W subtree */
export function calculateWArea(wNode: TreeNode, zWidth: number): number {
  if (wNode.filhos.length === 0) return zWidth * wNode.valor * wNode.multi;
  let area = 0;
  for (const q of wNode.filhos) {
    if (q.filhos.length === 0) {
      area += q.valor * wNode.valor * q.multi;
    } else {
      for (const r of q.filhos) {
        area += q.valor * r.valor * r.multi;
      }
    }
  }
  return area * wNode.multi;
}

/** Recursively calculate the area of pieces in a subtree */
export function calculateNodeArea(node: TreeNode): number {
  if (node.filhos.length === 0) {
    return node.valor * node.multi;
  }
  let area = 0;
  for (const child of node.filhos) {
    area += calculateNodeArea(child) * node.multi;
  }
  return area;
}
// ─── Leaf-piece extraction & removal preview ─────────────────────────────────

export interface LeafPiece {
  w: number;
  h: number;
  label?: string;
}

/**
 * Extracts every allocated piece (leaf node) of the tree with its real
 * dimensions resolved from ancestor context (a Y leaf's width comes from its
 * X ancestor, etc.). Ignores `label` and expands `multi` — one entry per
 * physical piece. Leaf types: Y/Z/W/Q without children, R always.
 */
export function extractLeafPieces(tree: TreeNode): LeafPiece[] {
  const pieces: LeafPiece[] = [];
  const traverse = (n: TreeNode, parents: TreeNode[], parentMultiplier: number) => {
    const xAncestor = parents.find((p) => p.tipo === "X");
    const yAncestor = parents.find((p) => p.tipo === "Y");
    const zAncestor = parents.find((p) => p.tipo === "Z");
    const wAncestor = parents.find((p) => p.tipo === "W");
    let pieceW = 0,
      pieceH = 0,
      isLeaf = false;

    const totalMulti = parentMultiplier * n.multi;

    if (n.tipo === "Y" && n.filhos.length === 0) {
      pieceW = xAncestor?.valor || 0;
      pieceH = n.valor;
      isLeaf = true;
    } else if (n.tipo === "Z" && n.filhos.length === 0) {
      pieceW = n.valor;
      pieceH = yAncestor?.valor || 0;
      isLeaf = true;
    } else if (n.tipo === "W" && n.filhos.length === 0) {
      pieceW = zAncestor?.valor || 0;
      pieceH = n.valor;
      isLeaf = true;
    } else if (n.tipo === "Q" && n.filhos.length === 0) {
      pieceW = n.valor;
      pieceH = wAncestor?.valor || 0;
      isLeaf = true;
    } else if (n.tipo === "R") {
      const qAncestor = parents.find((p) => p.tipo === "Q");
      pieceW = qAncestor?.valor || 0;
      pieceH = n.valor;
      isLeaf = true;
    }

    if (isLeaf && pieceW > 0 && pieceH > 0) {
      for (let m = 0; m < totalMulti; m++) {
        pieces.push({ w: pieceW, h: pieceH, label: n.label });
      }
    }
    n.filhos.forEach((f) => traverse(f, [...parents, n], totalMulti));
  };
  traverse(tree, [], 1);
  return pieces;
}

/**
 * Pieces that cease to exist if `nodeId` (and its whole subtree) is removed.
 * Computed as a multiset diff of extractLeafPieces before/after a simulated
 * deleteNode on a clone — the input tree is never mutated.
 */
export function previewRemoval(tree: TreeNode, nodeId: string): LeafPiece[] {
  const before = extractLeafPieces(tree);
  const clone = cloneTree(tree);
  deleteNode(clone, nodeId);
  const after = extractLeafPieces(clone);

  const key = (p: LeafPiece) => `${p.w}x${p.h}|${p.label ?? ""}`;
  const surviving = new Map<string, number>();
  for (const p of after) {
    const k = key(p);
    surviving.set(k, (surviving.get(k) || 0) + 1);
  }

  const removed: LeafPiece[] = [];
  for (const p of before) {
    const k = key(p);
    const c = surviving.get(k) || 0;
    if (c > 0) {
      surviving.set(k, c - 1);
    } else {
      removed.push(p);
    }
  }
  return removed;
}

// ─────────────────────────────────────────────────────────────────────────────
// Spec 012 (T011) — Validação de conservação no LIMITE candidato→plano.
//
// A classe de bug desta spec é o candidato corrompido VENCER o desempate por
// parecer mais compacto (menos nós). A defesa é validar os invariantes ANTES de
// aceitar um resultado como o melhor e DESCARTAR o inválido (nunca reparar — a
// jusante a informação já se perdeu). Ver data-model.md, "Regras de validação".
// Compartilhado entre optimizer e GA (ambos usam a mesma expansão).
// ─────────────────────────────────────────────────────────────────────────────

/** Chave de medida normalizada (ordem-independente), arredondada ao inteiro. */
function dimKey(w: number, h: number): string {
  const a = Math.round(Math.min(w, h));
  const b = Math.round(Math.max(w, h));
  return `${a}x${b}`;
}

/** Nº de peças FÍSICAS que uma lista de Piece representa (grupo conta `count`). */
export function physicalCount(pieces: Piece[]): number {
  let n = 0;
  for (const p of pieces) n += p.count ?? 1;
  return n;
}

/**
 * Conjunto de medidas físicas REAIS presentes no inventário `pieces`, para o
 * teste de fidelidade (INV-2). Devolve `null` — que DESLIGA a checagem de
 * fidelidade — quando algum grupo não é decodificável em medidas por peça
 * (`groupedAxis === "2d"` ou sem `individualDims`), evitando falsas rejeições.
 */
export function physicalMeasureSet(pieces: Piece[]): Set<string> | null {
  const set = new Set<string>();
  for (const p of pieces) {
    const n = p.count ?? 1;
    if (n <= 1) {
      set.add(dimKey(p.w, p.h));
      continue;
    }
    // Grupo: as medidas reais vêm de individualDims × a medida transversal.
    if (p.groupedAxis === "2d" || !p.individualDims || p.groupedAxis === undefined) {
      return null; // não decodificável → não arriscar rejeição indevida
    }
    const transverse = p.groupedAxis === "w" ? p.h : p.w;
    for (const d of p.individualDims) {
      set.add(p.groupedAxis === "w" ? dimKey(d, transverse) : dimKey(transverse, d));
    }
  }
  return set;
}

/**
 * Valida INV-1 (conservação), INV-2 (fidelidade de medida) e INV-3
 * (rastreabilidade) de um candidato. INV-4 (expansão total) é subsumido por
 * INV-1 + INV-3. Devolve `true` se o candidato é ACEITÁVEL como plano.
 *
 * @param expectedPhysical nº de peças físicas oferecidas ao motor.
 * @param validMeasures    medidas reais para o teste de fidelidade, ou `null`
 *                         para pular INV-2 (ver `physicalMeasureSet`).
 */
export function validatePlacementCandidate(
  tree: TreeNode,
  remaining: Piece[],
  expectedPhysical: number,
  validMeasures: Set<string> | null,
): boolean {
  const leaves = extractLeafPieces(tree);

  // INV-1 (Conservação): folhas alocadas + restantes == oferecidas. Nunca mais.
  if (leaves.length + physicalCount(remaining) !== expectedPhysical) return false;

  // INV-3 (Rastreabilidade): cada rótulo aparece no máximo uma vez.
  const seen = new Set<string>();
  for (const leaf of leaves) {
    if (!leaf.label) continue;
    if (seen.has(leaf.label)) return false;
    seen.add(leaf.label);
  }

  // INV-2 (Fidelidade): nenhuma folha rotulada afirma medida inexistente.
  if (validMeasures) {
    for (const leaf of leaves) {
      if (!leaf.label) continue;
      if (!validMeasures.has(dimKey(leaf.w, leaf.h))) return false;
    }
  }

  return true;
}

/** Recursively count labeled pieces in a subtree, accounting for multipliers */
export function countAllocatedPieces(node: TreeNode): number {
  if (node.filhos.length === 0) {
    return node.label ? node.multi : 0;
  }
  let count = 0;
  for (const child of node.filhos) {
    count += countAllocatedPieces(child);
  }
  return count * node.multi;
}
