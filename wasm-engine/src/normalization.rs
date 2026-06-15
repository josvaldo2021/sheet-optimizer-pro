use crate::types::{Arena, NodeType, NodeData, ROOT_ID, NO_PARENT};
use crate::tree_utils::children_sum;

#[derive(Clone, Debug)]
struct AbsRect {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    label: Option<String>,
}

fn extract_abs_rects(arena: &Arena, usable_w: f64, usable_h: f64) -> Vec<AbsRect> {
    let mut rects = Vec::new();
    let transposed = arena.get(ROOT_ID).transposed;
    let mut x_off = 0.0f64;

    for &x_id in &arena.nodes[ROOT_ID as usize].children.clone() {
        let x = arena.get(x_id);
        for _ in 0..x.multi {
            let mut y_off = 0.0f64;
            for &y_id in &x.children.clone() {
                let y = arena.get(y_id);
                for _ in 0..y.multi {
                    let mut z_off = 0.0f64;
                    for &z_id in &y.children.clone() {
                        let z = arena.get(z_id);
                        for _ in 0..z.multi {
                            if z.children.is_empty() {
                                rects.push(if transposed {
                                    AbsRect { x: y_off, y: x_off, w: y.valor, h: z.valor, label: z.label.clone() }
                                } else {
                                    AbsRect { x: x_off + z_off, y: y_off, w: z.valor, h: y.valor, label: z.label.clone() }
                                });
                            } else {
                                let mut w_off = 0.0f64;
                                for &w_id in &z.children.clone() {
                                    let w = arena.get(w_id);
                                    for _ in 0..w.multi {
                                        if w.children.is_empty() {
                                            rects.push(if transposed {
                                                AbsRect { x: y_off + w_off, y: x_off + z_off, w: w.valor, h: z.valor, label: w.label.clone() }
                                            } else {
                                                AbsRect { x: x_off + z_off, y: y_off + w_off, w: z.valor, h: w.valor, label: w.label.clone() }
                                            });
                                        } else {
                                            let mut q_off = 0.0f64;
                                            for &q_id in &w.children.clone() {
                                                let q = arena.get(q_id);
                                                for _ in 0..q.multi {
                                                    if q.children.is_empty() {
                                                        rects.push(if transposed {
                                                            AbsRect { x: y_off + w_off, y: x_off + z_off + q_off, w: w.valor, h: q.valor, label: q.label.clone() }
                                                        } else {
                                                            AbsRect { x: x_off + z_off + q_off, y: y_off + w_off, w: q.valor, h: w.valor, label: q.label.clone() }
                                                        });
                                                    } else {
                                                        let mut r_off = 0.0f64;
                                                        for &r_id in &q.children.clone() {
                                                            let r = arena.get(r_id);
                                                            for _ in 0..r.multi {
                                                                rects.push(if transposed {
                                                                    AbsRect { x: y_off + w_off + r_off, y: x_off + z_off + q_off, w: r.valor, h: q.valor, label: r.label.clone() }
                                                                } else {
                                                                    AbsRect { x: x_off + z_off + q_off, y: y_off + w_off + r_off, w: q.valor, h: r.valor, label: r.label.clone() }
                                                                });
                                                                r_off += r.valor;
                                                            }
                                                        }
                                                    }
                                                    q_off += q.valor;
                                                }
                                            }
                                        }
                                        w_off += w.valor;
                                    }
                                }
                            }
                            z_off += z.valor;
                        }
                    }
                    y_off += y.valor;
                }
            }
            x_off += x.valor;
        }
    }
    rects
}

fn enforce_cut_min_break(cuts: &mut Vec<f64>, bound: f64, min_break: f64) {
    if min_break <= 0.0 || cuts.is_empty() { return; }
    cuts.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let mut changed = true;
    while changed {
        changed = false;
        let mut boundaries = vec![0.0];
        boundaries.extend_from_slice(cuts);
        boundaries.push(bound);
        boundaries.dedup();
        boundaries.sort_by(|a, b| a.partial_cmp(b).unwrap());
        for i in 0..boundaries.len() - 1 {
            let gap = boundaries[i + 1] - boundaries[i];
            if gap > 0.0 && gap < min_break {
                if boundaries[i + 1] < bound - 0.5 {
                    let val = boundaries[i + 1];
                    cuts.retain(|&c| (c - val).abs() > 0.5);
                } else {
                    let val = boundaries[i];
                    cuts.retain(|&c| (c - val).abs() > 0.5);
                }
                changed = true;
                break;
            }
        }
    }
}

fn find_vertical_cuts(rects: &[AbsRect], bx: f64, _by: f64, bw: f64, _bh: f64, min_break: f64) -> Vec<f64> {
    let mut edges = std::collections::HashSet::new();
    for r in rects {
        let left = (r.x - bx).round();
        let right = (r.x + r.w - bx).round();
        if left > 0.5 && left < bw - 0.5 { edges.insert(left as i64); }
        if right > 0.5 && right < bw - 0.5 { edges.insert(right as i64); }
    }

    let mut valid: Vec<f64> = edges.iter()
        .map(|&e| e as f64)
        .filter(|&cx| {
            let abs_cx = bx + cx;
            !rects.iter().any(|r| r.x < abs_cx - 0.5 && r.x + r.w > abs_cx + 0.5)
        })
        .collect();
    valid.sort_by(|a, b| a.partial_cmp(b).unwrap());
    enforce_cut_min_break(&mut valid, bw.round(), min_break);
    valid
}

fn find_horizontal_cuts(rects: &[AbsRect], _bx: f64, by: f64, _bw: f64, bh: f64, min_break: f64) -> Vec<f64> {
    let mut edges = std::collections::HashSet::new();
    for r in rects {
        let bottom = (r.y - by).round();
        let top = (r.y + r.h - by).round();
        if bottom > 0.5 && bottom < bh - 0.5 { edges.insert(bottom as i64); }
        if top > 0.5 && top < bh - 0.5 { edges.insert(top as i64); }
    }

    let mut valid: Vec<f64> = edges.iter()
        .map(|&e| e as f64)
        .filter(|&cy| {
            let abs_cy = by + cy;
            !rects.iter().any(|r| r.y < abs_cy - 0.5 && r.y + r.h > abs_cy + 0.5)
        })
        .collect();
    valid.sort_by(|a, b| a.partial_cmp(b).unwrap());
    enforce_cut_min_break(&mut valid, bh.round(), min_break);
    valid
}

fn rects_in_bounds(rects: &[AbsRect], bx: f64, by: f64, bw: f64, bh: f64) -> Vec<AbsRect> {
    rects.iter().filter(|r|
        r.x >= bx - 0.5 && r.x + r.w <= bx + bw + 0.5 &&
        r.y >= by - 0.5 && r.y + r.h <= by + bh + 0.5
    ).cloned().collect()
}

fn build_canonical_tree(rects: &[AbsRect], usable_w: f64, usable_h: f64, min_break: f64) -> Arena {
    let mut arena = Arena::new_root(usable_w);
    if rects.is_empty() { return arena; }

    let level_seq = ["X", "Y", "Z", "W", "Q", "R"];
    let is_vertical = |level: &str| matches!(level, "X" | "Z" | "Q");

    subdivide(&mut arena, ROOT_ID, 0, rects, 0.0, 0.0, usable_w, usable_h, min_break, &level_seq);
    arena
}

fn subdivide(
    arena: &mut Arena,
    parent_id: u32,
    level_idx: usize,
    sub_rects: &[AbsRect],
    bx: f64, by: f64, bw: f64, bh: f64,
    min_break: f64,
    level_seq: &[&str],
) {
    if sub_rects.is_empty() || level_idx >= level_seq.len() { return; }

    let level = level_seq[level_idx];
    let vertical = matches!(level, "X" | "Z" | "Q");

    let cuts = if vertical {
        find_vertical_cuts(sub_rects, bx, by, bw, bh, min_break)
    } else {
        find_horizontal_cuts(sub_rects, bx, by, bw, bh, min_break)
    };

    if cuts.is_empty() {
        if sub_rects.len() == 1 {
            let r = &sub_rects[0];
            let (snap_w, snap_h) = (r.w, r.h);
            if vertical {
                let nid = arena.nodes.len() as u32;
                arena.nodes.push(NodeData { tipo: NodeType::from_str(level), valor: snap_w.round(), multi: 1, children: Vec::new(), parent: parent_id, label: r.label.clone(), transposed: false });
                arena.nodes[parent_id as usize].children.push(nid);
                let needs_child = level_idx + 1 < level_seq.len() && (level_idx < 4 || snap_h.round() < bh.round());
                if needs_child {
                    let next = level_seq[level_idx + 1];
                    let child_id = arena.nodes.len() as u32;
                    arena.nodes.push(NodeData { tipo: NodeType::from_str(next), valor: snap_h.round(), multi: 1, children: Vec::new(), parent: nid, label: r.label.clone(), transposed: false });
                    arena.nodes[nid as usize].children.push(child_id);
                }
            } else {
                let nid = arena.nodes.len() as u32;
                arena.nodes.push(NodeData { tipo: NodeType::from_str(level), valor: snap_h.round(), multi: 1, children: Vec::new(), parent: parent_id, label: r.label.clone(), transposed: false });
                arena.nodes[parent_id as usize].children.push(nid);
                let needs_child = level_idx + 1 < level_seq.len() && (level_idx < 3 || snap_w.round() < bw.round());
                if needs_child {
                    let next = level_seq[level_idx + 1];
                    let child_id = arena.nodes.len() as u32;
                    arena.nodes.push(NodeData { tipo: NodeType::from_str(next), valor: snap_w.round(), multi: 1, children: Vec::new(), parent: nid, label: r.label.clone(), transposed: false });
                    arena.nodes[nid as usize].children.push(child_id);
                }
            }
            return;
        }

        if level == "X" {
            let xid = arena.nodes.len() as u32;
            arena.nodes.push(NodeData { tipo: NodeType::X, valor: bw.round(), multi: 1, children: Vec::new(), parent: parent_id, label: None, transposed: false });
            arena.nodes[parent_id as usize].children.push(xid);
            subdivide(arena, xid, level_idx + 1, sub_rects, bx, by, bw, bh, min_break, level_seq);
            return;
        }

        subdivide(arena, parent_id, level_idx + 1, sub_rects, bx, by, bw, bh, min_break, level_seq);
        return;
    }

    let bound = if vertical { bw.round() } else { bh.round() };
    let mut boundaries = vec![0.0f64];
    boundaries.extend_from_slice(&cuts);
    boundaries.push(bound);
    boundaries.dedup();
    boundaries.sort_by(|a, b| a.partial_cmp(b).unwrap());

    for i in 0..boundaries.len() - 1 {
        let seg_start = boundaries[i];
        let seg_end = boundaries[i + 1];
        let seg_size = seg_end - seg_start;
        if seg_size < 1.0 { continue; }

        let (seg_bx, seg_by, seg_bw, seg_bh) = if vertical {
            (bx + seg_start, by, seg_size, bh)
        } else {
            (bx, by + seg_start, bw, seg_size)
        };

        let seg_rects = rects_in_bounds(sub_rects, seg_bx, seg_by, seg_bw, seg_bh);
        if seg_rects.is_empty() { continue; }

        let node_valor = if vertical { seg_bw } else { seg_bh };
        let nid = arena.nodes.len() as u32;
        arena.nodes.push(NodeData {
            tipo: NodeType::from_str(level), valor: node_valor.round(), multi: 1,
            children: Vec::new(), parent: parent_id, label: None, transposed: false,
        });
        arena.nodes[parent_id as usize].children.push(nid);

        if seg_rects.len() == 1 {
            let r = &seg_rects[0];
            let fills_w = (r.w - seg_bw).abs() < 1.0;
            let fills_h = (r.h - seg_bh).abs() < 1.0;
            if fills_w && fills_h {
                arena.get_mut(nid).label = r.label.clone();
                if level_idx + 1 < level_seq.len() && level_idx < 3 {
                    let next = level_seq[level_idx + 1];
                    let child_valor = if vertical { seg_bh.round() } else { seg_bw.round() };
                    let child_id = arena.nodes.len() as u32;
                    arena.nodes.push(NodeData { tipo: NodeType::from_str(next), valor: child_valor, multi: 1, children: Vec::new(), parent: nid, label: r.label.clone(), transposed: false });
                    arena.nodes[nid as usize].children.push(child_id);
                }
                continue;
            }
        }

        subdivide(arena, nid, level_idx + 1, &seg_rects, seg_bx, seg_by, seg_bw, seg_bh, min_break, level_seq);
    }
}

fn compress_multi(arena: &mut Arena, node_id: u32) {
    let children: Vec<u32> = arena.get(node_id).children.clone();
    for &c in &children { compress_multi(arena, c); }

    if arena.get(node_id).children.len() < 2 { return; }

    let child_ids: Vec<u32> = arena.get(node_id).children.clone();
    let mut compressed: Vec<u32> = Vec::new();

    for &c in &child_ids {
        if let Some(&last_id) = compressed.last() {
            if nodes_structurally_equal(arena, last_id, c) {
                let add_multi = arena.get(c).multi;
                arena.get_mut(last_id).multi += add_multi;
                continue;
            }
        }
        compressed.push(c);
    }
    arena.get_mut(node_id).children = compressed;
}

fn nodes_structurally_equal(arena: &Arena, a: u32, b: u32) -> bool {
    let na = arena.get(a);
    let nb = arena.get(b);
    if na.tipo != nb.tipo { return false; }
    if (na.valor - nb.valor).abs() > 0.5 { return false; }
    if na.multi != nb.multi { return false; }
    if na.label != nb.label { return false; }
    if na.children.len() != nb.children.len() { return false; }
    for (&ca, &cb) in na.children.iter().zip(nb.children.iter()) {
        if !nodes_structurally_equal(arena, ca, cb) { return false; }
    }
    true
}

fn deep_clone_subtree(src: &Arena, dst: &mut Arena, src_id: u32, dst_parent: u32) -> u32 {
    let src_node = src.get(src_id);
    let new_id = dst.nodes.len() as u32;
    dst.nodes.push(NodeData {
        tipo: src_node.tipo.clone(),
        valor: src_node.valor,
        multi: src_node.multi,
        children: Vec::new(),
        parent: dst_parent,
        label: src_node.label.clone(),
        transposed: src_node.transposed,
    });
    dst.nodes[dst_parent as usize].children.push(new_id);
    let src_children: Vec<u32> = src.get(src_id).children.clone();
    for &sc in &src_children {
        deep_clone_subtree(src, dst, sc, new_id);
    }
    new_id
}

fn expand_x_multi_to_z(arena: &mut Arena) {
    let x_ids: Vec<u32> = arena.nodes[ROOT_ID as usize].children.clone();
    for x_id in x_ids {
        let n_multi = arena.get(x_id).multi;
        if n_multi <= 1 { continue; }

        let x_valor = arena.get(x_id).valor;
        arena.get_mut(x_id).valor = x_valor * n_multi as f64;
        arena.get_mut(x_id).multi = 1;

        let y_ids: Vec<u32> = arena.get(x_id).children.clone();
        for y_id in y_ids {
            let original_z: Vec<u32> = arena.get(y_id).children.clone();
            arena.get_mut(y_id).children.clear();

            // First copy: use original Z nodes
            for &z_id in &original_z {
                arena.get_mut(y_id).children.push(z_id);
            }

            // Subsequent copies: clone each Z subtree
            for _rep in 1..n_multi {
                // We need to clone from an immutable view - use the original IDs
                let clone_src_ids: Vec<u32> = original_z.clone();
                for &z_src in &clone_src_ids {
                    // Clone the Z subtree
                    let new_z_id = arena.nodes.len() as u32;
                    let src = arena.get(z_src).clone();
                    arena.nodes.push(NodeData {
                        tipo: src.tipo,
                        valor: src.valor,
                        multi: src.multi,
                        children: Vec::new(),
                        parent: y_id,
                        label: src.label,
                        transposed: src.transposed,
                    });
                    arena.nodes[y_id as usize].children.push(new_z_id);
                    // Clone children recursively
                    let src_children: Vec<u32> = arena.get(z_src).children.clone();
                    for &sc in &src_children {
                        clone_subtree_into(arena, sc, new_z_id);
                    }
                }
            }
        }
    }
}

fn clone_subtree_into(arena: &mut Arena, src_id: u32, dst_parent: u32) {
    let src = arena.get(src_id).clone();
    let new_id = arena.nodes.len() as u32;
    arena.nodes.push(NodeData {
        tipo: src.tipo, valor: src.valor, multi: src.multi,
        children: Vec::new(), parent: dst_parent,
        label: src.label, transposed: src.transposed,
    });
    arena.nodes[dst_parent as usize].children.push(new_id);
    let src_children: Vec<u32> = arena.get(src_id).children.clone();
    for &sc in &src_children {
        clone_subtree_into(arena, sc, new_id);
    }
}

pub fn normalize_tree(arena: Arena, usable_w: f64, usable_h: f64, min_break: f64) -> Arena {
    let rects = extract_abs_rects(&arena, usable_w, usable_h);
    if rects.is_empty() { return arena; }

    let mut canonical = build_canonical_tree(&rects, usable_w, usable_h, min_break);
    compress_multi(&mut canonical, ROOT_ID);
    expand_x_multi_to_z(&mut canonical);
    compress_multi(&mut canonical, ROOT_ID);
    canonical.get_mut(ROOT_ID).transposed = false;

    // Extend last X column to absorb residual
    let x_ids: Vec<u32> = canonical.nodes[ROOT_ID as usize].children.clone();
    if !x_ids.is_empty() {
        let used_w: f64 = x_ids.iter().map(|&x| { let n = canonical.get(x); n.valor * n.multi as f64 }).sum();
        let residual = (usable_w.round() - used_w.round()).max(0.0);
        if residual > 0.0 {
            let last_x = *x_ids.last().unwrap();
            if canonical.get(last_x).multi == 1 {
                canonical.get_mut(last_x).valor += residual;
            }
        }
    }

    canonical
}
