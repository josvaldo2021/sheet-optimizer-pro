use crate::types::{Arena, NodeData, NodeType, Piece, ROOT_ID, NO_PARENT};

/// Returns the appropriate parent id for inserting a node of the given type
/// starting from `selected_id`.
pub fn find_insert_parent(arena: &Arena, selected_id: u32, tipo: &NodeType) -> u32 {
    match tipo {
        NodeType::X => ROOT_ID,
        NodeType::Y => arena.find_ancestor(selected_id, &NodeType::X).unwrap_or(ROOT_ID),
        NodeType::Z => arena.find_ancestor(selected_id, &NodeType::Y).unwrap_or(ROOT_ID),
        NodeType::W => arena.find_ancestor(selected_id, &NodeType::Z).unwrap_or(ROOT_ID),
        NodeType::Q => arena.find_ancestor(selected_id, &NodeType::W).unwrap_or(ROOT_ID),
        NodeType::R => arena.find_ancestor(selected_id, &NodeType::Q).unwrap_or(ROOT_ID),
        NodeType::Root => ROOT_ID,
    }
}

/// Equivalent to TS insertNode — finds correct parent and adds child.
pub fn insert_node(arena: &mut Arena, selected_id: u32, tipo: NodeType, valor: f64, multi: u32) -> u32 {
    let parent_id = find_insert_parent(arena, selected_id, &tipo);
    arena.add_child(parent_id, tipo, valor, multi)
}

/// Area of all placed pieces in the tree.
pub fn calc_placed_area(arena: &Arena) -> f64 {
    let mut area = 0.0f64;
    for &x_id in &arena.nodes[ROOT_ID as usize].children {
        let x = arena.get(x_id);
        for _ in 0..x.multi {
            for &y_id in &x.children {
                let y = arena.get(y_id);
                for _ in 0..y.multi {
                    area += calc_x_area(arena, x_id, y_id);
                }
            }
        }
    }
    area
}

fn calc_x_area(arena: &Arena, _x_id: u32, y_id: u32) -> f64 {
    let y = arena.get(y_id);
    let mut area = 0.0f64;
    for &z_id in &y.children {
        let z = arena.get(z_id);
        for _ in 0..z.multi {
            if z.children.is_empty() {
                area += z.valor * y.valor;
            } else {
                for &w_id in &z.children {
                    let w = arena.get(w_id);
                    for _ in 0..w.multi {
                        if w.children.is_empty() {
                            area += z.valor * w.valor;
                        } else {
                            for &q_id in &w.children {
                                let q = arena.get(q_id);
                                for _ in 0..q.multi {
                                    if q.children.is_empty() {
                                        area += q.valor * w.valor;
                                    } else {
                                        for &r_id in &q.children {
                                            let r = arena.get(r_id);
                                            area += q.valor * r.valor * r.multi as f64;
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
    area
}

/// Sum of all children's valor*multi under a node.
pub fn children_sum(arena: &Arena, node_id: u32) -> f64 {
    arena.get(node_id).children.iter()
        .map(|&c| { let n = arena.get(c); n.valor * n.multi as f64 })
        .sum()
}

/// Compute piece area contribution of a Z subtree for clamp/counting.
pub fn calc_z_area(arena: &Arena, z_id: u32, y_height: f64) -> f64 {
    let z = arena.get(z_id);
    if z.children.is_empty() {
        return z.valor * y_height * z.multi as f64;
    }
    let mut area = 0.0f64;
    for &w_id in &z.children {
        let w = arena.get(w_id);
        if w.children.is_empty() {
            area += z.valor * w.valor * w.multi as f64;
        } else {
            for &q_id in &w.children {
                let q = arena.get(q_id);
                if q.children.is_empty() {
                    area += q.valor * w.valor * q.multi as f64;
                } else {
                    for &r_id in &q.children {
                        let r = arena.get(r_id);
                        area += q.valor * r.valor * r.multi as f64;
                    }
                }
            }
        }
    }
    area * z.multi as f64
}

pub fn calc_w_area(arena: &Arena, w_id: u32, z_width: f64) -> f64 {
    let w = arena.get(w_id);
    if w.children.is_empty() {
        return z_width * w.valor * w.multi as f64;
    }
    let mut area = 0.0f64;
    for &q_id in &w.children {
        let q = arena.get(q_id);
        if q.children.is_empty() {
            area += q.valor * w.valor * q.multi as f64;
        } else {
            for &r_id in &q.children {
                let r = arena.get(r_id);
                area += q.valor * r.valor * r.multi as f64;
            }
        }
    }
    area * w.multi as f64
}

pub fn calc_node_area(arena: &Arena, node_id: u32) -> f64 {
    let n = arena.get(node_id);
    if n.children.is_empty() {
        return n.valor * n.multi as f64;
    }
    let mut area = 0.0f64;
    for &c in &n.children {
        area += calc_node_area(arena, c);
    }
    area * n.multi as f64
}

/// Returns true if a subtree has no labels (pure waste).
pub fn is_waste_subtree(arena: &Arena, node_id: u32) -> bool {
    let n = arena.get(node_id);
    if n.label.is_some() {
        return false;
    }
    n.children.iter().all(|&c| is_waste_subtree(arena, c))
}

/// Get all Z cut positions (cumulative) for a Y strip.
pub fn get_z_cut_positions(arena: &Arena, y_id: u32) -> Vec<f64> {
    let y = arena.get(y_id);
    let mut positions = Vec::new();
    let mut acc = 0.0f64;
    for &z_id in &y.children {
        let z = arena.get(z_id);
        acc += z.valor * z.multi as f64;
        positions.push(acc);
    }
    positions
}

/// Get all Z cut positions for every Y strip in a column.
pub fn get_all_z_cut_positions(arena: &Arena, x_id: u32) -> Vec<Vec<f64>> {
    arena.get(x_id).children.iter()
        .map(|&y_id| get_z_cut_positions(arena, y_id))
        .collect()
}

// ─────────────────────────────────────────────────────────────────────────────
// Spec 012 (T011/T024) — Validação de conservação no LIMITE candidato→plano.
// Espelho de tree-utils.ts (validatePlacementCandidate). Sem esta rede no Rust,
// um candidato corrompido pode vencer o desempate por parecer mais compacto —
// e o app roda WASM por padrão. Ver data-model.md, "Regras de validação".
// ─────────────────────────────────────────────────────────────────────────────

/// Chave de medida normalizada (ordem-independente), arredondada ao inteiro.
fn dim_key(w: f64, h: f64) -> (i64, i64) {
    let a = w.min(h).round() as i64;
    let b = w.max(h).round() as i64;
    (a, b)
}

/// Folhas alocadas com medida real e rótulo, expandindo `multi`. Espelha
/// extractLeafPieces (tree-utils.ts): tipos folha Y/Z/W/Q sem filhos e R sempre.
fn extract_leaf_pieces(arena: &Arena) -> Vec<(f64, f64, Option<String>)> {
    let mut out: Vec<(f64, f64, Option<String>)> = Vec::new();
    fn walk(
        arena: &Arena,
        id: u32,
        x_val: f64,
        y_val: f64,
        z_val: f64,
        w_val: f64,
        q_val: f64,
        parent_mult: u32,
        out: &mut Vec<(f64, f64, Option<String>)>,
    ) {
        let n = arena.get(id);
        let total_mult = parent_mult * n.multi;
        let is_empty = n.children.is_empty();
        let (mut pw, mut ph, mut is_leaf) = (0.0f64, 0.0f64, false);
        match n.tipo {
            NodeType::Y if is_empty => { pw = x_val; ph = n.valor; is_leaf = true; }
            NodeType::Z if is_empty => { pw = n.valor; ph = y_val; is_leaf = true; }
            NodeType::W if is_empty => { pw = z_val; ph = n.valor; is_leaf = true; }
            NodeType::Q if is_empty => { pw = n.valor; ph = w_val; is_leaf = true; }
            NodeType::R => { pw = q_val; ph = n.valor; is_leaf = true; }
            _ => {}
        }
        if is_leaf && pw > 0.0 && ph > 0.0 {
            for _ in 0..total_mult {
                out.push((pw, ph, n.label.clone()));
            }
        }
        // Atualiza o valor do ancestral do próprio tipo antes de descer.
        let (nx, ny, nz, nw, nq) = match n.tipo {
            NodeType::X => (n.valor, y_val, z_val, w_val, q_val),
            NodeType::Y => (x_val, n.valor, z_val, w_val, q_val),
            NodeType::Z => (x_val, y_val, n.valor, w_val, q_val),
            NodeType::W => (x_val, y_val, z_val, n.valor, q_val),
            NodeType::Q => (x_val, y_val, z_val, w_val, n.valor),
            _ => (x_val, y_val, z_val, w_val, q_val),
        };
        let children = n.children.clone();
        for c in children {
            walk(arena, c, nx, ny, nz, nw, nq, total_mult, out);
        }
    }
    walk(arena, ROOT_ID, 0.0, 0.0, 0.0, 0.0, 0.0, 1, &mut out);
    out
}

/// Nº de peças FÍSICAS que uma lista de Piece representa (grupo conta `count`).
pub fn physical_count(pieces: &[Piece]) -> u32 {
    pieces.iter().map(|p| p.count.unwrap_or(1)).sum()
}

/// Medidas físicas reais do inventário para o teste de fidelidade (INV-2).
/// `None` DESLIGA a checagem quando algum grupo não é decodificável
/// (`groupedAxis == "2d"` ou sem `individualDims`) — evita falsas rejeições.
pub fn physical_measure_set(pieces: &[Piece]) -> Option<std::collections::HashSet<(i64, i64)>> {
    let mut set = std::collections::HashSet::new();
    for p in pieces {
        let n = p.count.unwrap_or(1);
        if n <= 1 {
            set.insert(dim_key(p.w, p.h));
            continue;
        }
        match (p.grouped_axis.as_deref(), &p.individual_dims) {
            (Some("w"), Some(dims)) => {
                for &d in dims { set.insert(dim_key(d, p.h)); }
            }
            (Some("h"), Some(dims)) => {
                for &d in dims { set.insert(dim_key(p.w, d)); }
            }
            // "2d", eixo ausente ou individual_dims ausente → não decodificável.
            _ => return None,
        }
    }
    Some(set)
}

/// Valida INV-1 (conservação), INV-3 (rastreabilidade) e INV-2 (fidelidade) de
/// um candidato. INV-4 é subsumido por INV-1 + INV-3. `true` = aceitável.
pub fn validate_placement_candidate(
    arena: &Arena,
    remaining: &[Piece],
    expected_physical: u32,
    valid_measures: &Option<std::collections::HashSet<(i64, i64)>>,
) -> bool {
    let leaves = extract_leaf_pieces(arena);

    // INV-1 (Conservação): folhas alocadas + restantes == oferecidas.
    if leaves.len() as u32 + physical_count(remaining) != expected_physical {
        return false;
    }

    // INV-3 (Rastreabilidade): cada rótulo aparece no máximo uma vez.
    let mut seen: std::collections::HashSet<&str> = std::collections::HashSet::new();
    for (_, _, label) in &leaves {
        if let Some(lb) = label {
            if !seen.insert(lb.as_str()) {
                return false;
            }
        }
    }

    // INV-2 (Fidelidade): nenhuma folha rotulada afirma medida inexistente.
    if let Some(vm) = valid_measures {
        for (w, h, label) in &leaves {
            if label.is_some() && !vm.contains(&dim_key(*w, *h)) {
                return false;
            }
        }
    }

    true
}

// ─────────────────────────────────────────────────────────────────────────────
// Spec 011 — Consolidação da sobra: maior retângulo livre da chapa.
// Espelho de `largestFreeRect` (tree-utils.ts). Generaliza o gap-walk coletando
// o gap de cada nível guilhotina e devolvendo o de MAIOR área. Puro; derivado da
// árvore. Usado no desempate por consolidação do optimizer.
// ─────────────────────────────────────────────────────────────────────────────

fn upd(best: &mut Option<(f64, f64)>, w: f64, h: f64) {
    const EPS: f64 = 0.5;
    if w > EPS && h > EPS && best.map_or(true, |(bw, bh)| w * h > bw * bh) {
        *best = Some((w, h));
    }
}

/// Soma de `valor*multi` dos filhos de um nó.
fn children_span(arena: &Arena, id: u32) -> f64 {
    arena
        .get(id)
        .children
        .iter()
        .map(|&c| arena.get(c).valor * arena.get(c).multi as f64)
        .sum()
}

/// Maior retângulo de espaço livre da chapa (por área), ou `None` se não há.
pub fn largest_free_rect(arena: &Arena, usable_w: f64, usable_h: f64) -> Option<(f64, f64)> {
    if arena.get(ROOT_ID).children.is_empty() {
        return Some((usable_w, usable_h));
    }
    let mut best: Option<(f64, f64)> = None;

    // Nível 1: faixa livre à direita, após todas as colunas X.
    let used_col_w = children_span(arena, ROOT_ID);
    upd(&mut best, usable_w - used_col_w, usable_h);

    for &x_id in &arena.get(ROOT_ID).children {
        let x = arena.get(x_id);
        if x.children.is_empty() {
            continue;
        }
        let cw = x.valor;
        // Nível 2: fundo da coluna.
        let used_row_h = children_span(arena, x_id);
        upd(&mut best, cw, usable_h - used_row_h);

        for &y_id in &x.children {
            let y = arena.get(y_id);
            if y.children.is_empty() {
                continue;
            }
            let rh = y.valor;
            // Nível 3: à direita da linha.
            let used_zw = children_span(arena, y_id);
            upd(&mut best, cw - used_zw, rh);

            for &z_id in &y.children {
                let z = arena.get(z_id);
                if z.children.is_empty() {
                    continue;
                }
                let zw = z.valor;
                // Nível 4: fundo do Z.
                let used_wh = children_span(arena, z_id);
                upd(&mut best, zw, rh - used_wh);

                for &w_id in &z.children {
                    let wn = arena.get(w_id);
                    if wn.children.is_empty() {
                        continue;
                    }
                    let wh = wn.valor;
                    // Nível 5: à direita do W.
                    let used_qw = children_span(arena, w_id);
                    upd(&mut best, zw - used_qw, wh);

                    for &q_id in &wn.children {
                        let q = arena.get(q_id);
                        if q.children.is_empty() {
                            continue;
                        }
                        let qw = q.valor;
                        // Nível 6: fundo do Q (R é sempre folha).
                        let used_rh = children_span(arena, q_id);
                        upd(&mut best, qw, wh - used_rh);
                    }
                }
            }
        }
    }

    best
}

// ─────────────────────────────────────────────────────────────────────────────
// Spec 013 — "Cortar até o final primeiro": consolidação da sobra lateral.
// Espelho de `consolidateColumns` (tree-utils.ts). Funde faixas W consecutivas de
// mesma largura (Q-folha) numa só faixa de altura somada, com Q de altura cheia e
// as peças empilhadas como R — isolando a sobra lateral como UM bloco. Peças não
// se movem; só a representação da sobra muda ⇒ conservação preservada.
// ─────────────────────────────────────────────────────────────────────────────

/// Info de uma banda consolidável sob um container: se `band_id` é uma
/// `band_type` (multi=1) com um único filho `subcol_type` (multi=1) segurando uma
/// peça (folha rotulada, direta ou via uma única `subband_type`-folha rotulada),
/// devolve `(largura_da_subcoluna, extensão_real_da_peça, rótulo)`.
fn band_info(
    arena: &Arena, band_id: u32,
    band_type: NodeType, subcol_type: NodeType, subband_type: NodeType,
) -> Option<(f64, f64, String)> {
    let band = arena.get(band_id);
    if band.tipo != band_type || band.multi != 1 || band.children.len() != 1 {
        return None;
    }
    let s = arena.get(band.children[0]);
    if s.tipo != subcol_type || s.multi != 1 {
        return None;
    }
    // `extent` = medida REAL da peça ao longo do eixo da banda. Sub-coluna folha ⇒
    // a peça preenche a banda (extent = altura da banda). Se há uma subband-folha, a
    // peça pode ser MENOR que a banda — a diferença é sobra não-cortável deixada pela
    // normalização (minBreak). Usar a altura da banda aqui INFLARIA a peça (fantasma).
    let (label, extent) = if s.children.is_empty() && s.label.is_some() {
        (s.label.clone(), band.valor)
    } else if s.children.len() == 1 {
        let sb = arena.get(s.children[0]);
        if sb.tipo == subband_type && sb.multi == 1 && sb.children.is_empty() && sb.label.is_some() {
            (sb.label.clone(), sb.valor)
        } else {
            (None, 0.0)
        }
    } else {
        (None, 0.0)
    };
    label.map(|l| (s.valor, extent, l))
}

/// Aloca um nó solto (sem pai) e devolve seu id.
fn alloc_node(arena: &mut Arena, tipo: NodeType, valor: f64, label: Option<String>) -> u32 {
    let id = arena.nodes.len() as u32;
    arena.nodes.push(NodeData {
        tipo,
        valor,
        multi: 1,
        children: Vec::new(),
        parent: NO_PARENT,
        label,
        transposed: false,
    });
    id
}

/// Consolida, dentro de cada `container_type`, corridas de `band_type` cujo único
/// filho é uma `subcol_type` mais estreita (peça de mesma largura empilhada).
fn apply_level(
    arena: &mut Arena,
    container_type: NodeType, band_type: NodeType, subcol_type: NodeType, subband_type: NodeType,
) {
    let container_ids: Vec<u32> = (0..arena.nodes.len() as u32)
        .filter(|&id| arena.get(id).tipo == container_type)
        .collect();

    for c_id in container_ids {
        let cw = arena.get(c_id).valor;
        let children = arena.get(c_id).children.clone();
        let mut new_children: Vec<u32> = Vec::new();
        let mut i = 0;
        while i < children.len() {
            if let Some((width, extent, label)) = band_info(arena, children[i], band_type, subcol_type, subband_type) {
                if width < cw - 0.5 {
                    let mut run: Vec<(u32, f64, String)> = vec![(children[i], extent, label)];
                    let mut j = i + 1;
                    while j < children.len() {
                        match band_info(arena, children[j], band_type, subcol_type, subband_type) {
                            Some((wn, ext_n, ln)) if (wn - width).abs() < 0.5 => {
                                run.push((children[j], ext_n, ln));
                                j += 1;
                            }
                            _ => break,
                        }
                    }
                    if run.len() >= 2 {
                        let total_h: f64 = run.iter().map(|&(b, _, _)| arena.get(b).valor).sum();
                        let merged_band = alloc_node(arena, band_type, total_h, None);
                        let merged_sub = alloc_node(arena, subcol_type, width, None);
                        arena.nodes[merged_band as usize].children.push(merged_sub);
                        arena.nodes[merged_sub as usize].parent = merged_band;
                        // subband carrega a extensão REAL da peça (não a altura da banda):
                        // sobra não-cortável (minBreak) fica implícita no fim da sub-coluna.
                        for (_b_id, ext, lbl) in &run {
                            let sb = alloc_node(arena, subband_type, *ext, Some(lbl.clone()));
                            arena.nodes[merged_sub as usize].children.push(sb);
                            arena.nodes[sb as usize].parent = merged_sub;
                        }
                        arena.nodes[merged_band as usize].parent = c_id;
                        new_children.push(merged_band);
                        i = j;
                        continue;
                    }
                }
            }
            new_children.push(children[i]);
            i += 1;
        }
        arena.get_mut(c_id).children = new_children;
    }
}

/// Consolida in-place a sobra lateral de colunas com peças de mesma largura
/// empilhadas, nos DOIS níveis onde a fragmentação ocorre (X→Y→Z→W do caminho do
/// GA, e Z→W→Q→R do caminho por coluna). Idempotente. Os nós antigos ficam órfãos
/// (ignorados por `to_json_node`, que só percorre a partir da raiz).
pub fn consolidate_columns(arena: &mut Arena) {
    apply_level(arena, NodeType::X, NodeType::Y, NodeType::Z, NodeType::W);
    apply_level(arena, NodeType::Z, NodeType::W, NodeType::Q, NodeType::R);
}
