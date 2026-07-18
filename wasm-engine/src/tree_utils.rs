use crate::types::{Arena, NodeData, NodeType, Piece, ROOT_ID};

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
