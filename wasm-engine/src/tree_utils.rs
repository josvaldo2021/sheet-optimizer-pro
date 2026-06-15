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
