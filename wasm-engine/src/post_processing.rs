use crate::types::{Arena, NodeType, Piece, ROOT_ID};
use crate::tree_utils::{children_sum, is_waste_subtree, calc_z_area, calc_w_area, calc_node_area};
use crate::scoring::{oris, z_residual_violates_min_break, violates_z_min_break, sibling_violates_min_break};
use crate::placement::create_piece_nodes;

// ========== UNIFY COLUMN WASTE ==========

pub fn unify_column_waste(
    arena: &mut Arena,
    remaining: &mut Vec<Piece>,
    usable_w: f64,
    usable_h: f64,
    min_break: f64,
) -> f64 {
    let mut added = 0.0f64;
    if remaining.is_empty() { return 0.0; }

    // LEVEL 1: X→Y
    let col_ids: Vec<u32> = arena.nodes[ROOT_ID as usize].children.clone();
    for col_id in col_ids {
        if remaining.is_empty() { break; }
        if arena.get(col_id).children.len() < 2 { continue; }

        let y_ids: Vec<u32> = arena.get(col_id).children.clone();
        let y_wastes: Vec<f64> = y_ids.iter().map(|&y| {
            let used_z = children_sum(arena, y);
            arena.get(col_id).valor - used_z
        }).collect();

        let min_waste = y_wastes.iter().cloned().fold(f64::INFINITY, f64::min);
        if min_waste < 50.0 { continue; }
        if min_break > 0.0 && y_wastes.iter().any(|&w| { let r = w - min_waste; r > 0.0 && r < min_break }) { continue; }

        let total_h: f64 = y_ids.iter().map(|&y| { let n = arena.get(y); n.valor * n.multi as f64 }).sum();
        let can_fit = remaining.iter().any(|p| {
            oris(p).iter().any(|&(ow, oh)| (ow <= min_waste && oh <= total_h) || (oh <= min_waste && ow <= total_h))
        });
        if !can_fit { continue; }

        // Shrink the column, create new column for the waste strip
        arena.get_mut(col_id).valor -= min_waste;
        let new_col_id = arena.add_child(ROOT_ID, NodeType::X, min_waste, 1);
        let filled = fill_area_x(arena, remaining, new_col_id, min_waste, usable_h, min_break);
        added += filled;

        if arena.get(new_col_id).children.is_empty() {
            arena.get_mut(col_id).valor += min_waste;
            arena.nodes[ROOT_ID as usize].children.retain(|&x| x != new_col_id);
        }
    }

    // LEVEL 2: Y→Z
    let col_ids: Vec<u32> = arena.nodes[ROOT_ID as usize].children.clone();
    for col_id in col_ids {
        if remaining.is_empty() { break; }
        let y_ids: Vec<u32> = arena.get(col_id).children.clone();
        for y_id in y_ids {
            if remaining.is_empty() { break; }
            if arena.get(y_id).children.len() < 2 { continue; }

            let z_ids: Vec<u32> = arena.get(y_id).children.clone();
            let z_wastes: Vec<f64> = z_ids.iter().map(|&z| {
                let used_w = children_sum(arena, z);
                arena.get(y_id).valor - used_w
            }).collect();
            let min_waste = z_wastes.iter().cloned().fold(f64::INFINITY, f64::min);
            if min_waste < 50.0 { continue; }
            if min_break > 0.0 && z_wastes.iter().any(|&w| { let r = w - min_waste; r > 0.0 && r < min_break }) { continue; }

            let total_w: f64 = z_ids.iter().map(|&z| { let n = arena.get(z); n.valor * n.multi as f64 }).sum();
            let can_fit = remaining.iter().any(|p| {
                oris(p).iter().any(|&(ow, oh)| (ow <= total_w && oh <= min_waste) || (oh <= total_w && ow <= min_waste))
            });
            if !can_fit { continue; }

            arena.get_mut(y_id).valor -= min_waste;
            let new_y_id = arena.add_child(col_id, NodeType::Y, min_waste, 1);
            let col_valor = arena.get(col_id).valor;
            let filled = fill_area_y(arena, remaining, new_y_id, col_valor, min_waste, min_break);
            added += filled;

            if arena.get(new_y_id).children.is_empty() {
                arena.get_mut(y_id).valor += min_waste;
                arena.nodes[col_id as usize].children.retain(|&y| y != new_y_id);
            }
        }
    }

    // LEVEL 3: Z→W
    let col_ids: Vec<u32> = arena.nodes[ROOT_ID as usize].children.clone();
    for col_id in col_ids {
        if remaining.is_empty() { break; }
        let y_ids: Vec<u32> = arena.get(col_id).children.clone();
        for y_id in y_ids {
            if remaining.is_empty() { break; }
            let z_ids: Vec<u32> = arena.get(y_id).children.clone();
            for z_id in z_ids {
                if remaining.is_empty() { break; }
                if arena.get(z_id).children.len() < 2 { continue; }

                let w_ids: Vec<u32> = arena.get(z_id).children.clone();
                let w_wastes: Vec<f64> = w_ids.iter().map(|&w_id| {
                    let used_q = children_sum(arena, w_id);
                    if used_q > 0.0 { arena.get(z_id).valor - used_q } else { 0.0 }
                }).collect();

                let min_waste = w_wastes.iter().cloned().fold(f64::INFINITY, f64::min);
                if min_waste < 50.0 { continue; }

                let total_h: f64 = w_ids.iter().map(|&w| { let n = arena.get(w); n.valor * n.multi as f64 }).sum();
                let can_fit = remaining.iter().any(|p| {
                    oris(p).iter().any(|&(ow, oh)| (ow <= min_waste && oh <= total_h) || (oh <= min_waste && ow <= total_h))
                });
                if !can_fit { continue; }

                arena.get_mut(z_id).valor -= min_waste;
                let y_valor = arena.get(y_id).valor;
                let new_z_id = arena.add_child(y_id, NodeType::Z, min_waste, 1);
                let filled = fill_area_z(arena, remaining, new_z_id, min_waste, y_valor, min_break);
                added += filled;

                if arena.get(new_z_id).children.is_empty() {
                    arena.get_mut(z_id).valor += min_waste;
                    arena.nodes[y_id as usize].children.retain(|&z| z != new_z_id);
                }
            }
        }
    }

    added
}

fn fill_area_x(
    arena: &mut Arena,
    remaining: &mut Vec<Piece>,
    col_id: u32,
    area_w: f64,
    usable_h: f64,
    min_break: f64,
) -> f64 {
    let mut filled = 0.0f64;
    let mut free_h = usable_h;
    let mut i = 0;

    while i < remaining.len() && free_h > 0.0 {
        let pc = remaining[i].clone();
        let mut best_ori: Option<(f64, f64)> = None;
        let mut best_score = f64::INFINITY;

        for (ow, oh) in oris(&pc) {
            if ow <= area_w && oh <= free_h {
                if min_break > 0.0 && z_residual_violates_min_break(area_w, ow, min_break) { continue; }
                let score = (area_w - ow) + (free_h - oh) * 0.1;
                if score < best_score { best_score = score; best_ori = Some((ow, oh)); }
            }
        }

        if let Some((ow, oh)) = best_ori {
            let mut effective_h = oh;
            let residual_h = free_h - oh;
            if residual_h > 0.0 {
                let can_fit_more = remaining.iter().skip(i + 1).any(|p| oris(p).iter().any(|&(pw, ph)| pw <= area_w && ph <= residual_h));
                if !can_fit_more { effective_h = free_h; }
            }

            let y_id = arena.add_child(col_id, NodeType::Y, effective_h, 1);
            filled += create_piece_nodes(arena, y_id, &pc, ow, oh, (ow - pc.w).abs() > 0.5, None);

            let mut free_zw = area_w - ow;
            let mut j = 0;
            while j < remaining.len() && free_zw > 0.0 {
                if j == i { j += 1; continue; }
                let lpc = remaining[j].clone();
                let mut placed = false;
                for (lw, lh) in oris(&lpc) {
                    if lw <= free_zw && lh <= effective_h {
                        if min_break > 0.0 && z_residual_violates_min_break(free_zw, lw, min_break) { continue; }
                        filled += create_piece_nodes(arena, y_id, &lpc, lw, lh, (lw - lpc.w).abs() > 0.5, None);
                        free_zw -= lw;
                        remaining.remove(j);
                        if j < i { /* i adjustment needed */ }
                        placed = true;
                        break;
                    }
                }
                if !placed { j += 1; }
            }

            free_h -= effective_h;
            remaining.remove(i);
        } else {
            i += 1;
        }
    }

    filled
}

fn fill_area_y(
    arena: &mut Arena,
    remaining: &mut Vec<Piece>,
    y_id: u32,
    area_w: f64,
    area_h: f64,
    min_break: f64,
) -> f64 {
    let mut filled = 0.0f64;
    let mut free_h = area_h;
    let mut i = 0;

    while i < remaining.len() && free_h > 0.0 {
        let pc = remaining[i].clone();
        let mut best_ori: Option<(f64, f64)> = None;
        let mut best_score = f64::INFINITY;

        for (ow, oh) in oris(&pc) {
            if ow <= area_w && oh <= free_h {
                if min_break > 0.0 && z_residual_violates_min_break(area_w, ow, min_break) { continue; }
                let score = (area_w - ow) + (free_h - oh) * 0.1;
                if score < best_score { best_score = score; best_ori = Some((ow, oh)); }
            }
        }

        if let Some((ow, oh)) = best_ori {
            let mut effective_h = oh;
            let residual_h = free_h - oh;
            if residual_h > 0.0 {
                let can_fit_more = remaining.iter().skip(i + 1).any(|p| oris(p).iter().any(|&(pw, ph)| pw <= area_w && ph <= residual_h));
                if !can_fit_more { effective_h = free_h; }
            }

            let z_id = arena.add_child(y_id, NodeType::Z, ow, 1);
            let w_id = arena.add_child(z_id, NodeType::W, oh, 1);
            if let Some(l) = &pc.label {
                arena.get_mut(z_id).label = Some(l.clone());
                arena.get_mut(w_id).label = Some(l.clone());
            }
            filled += ow * oh;

            let mut free_wh = effective_h - oh;
            let mut j = 0;
            while j < remaining.len() && free_wh > 0.0 {
                if j == i { j += 1; continue; }
                let lpc = remaining[j].clone();
                let mut placed = false;
                for (lw, lh) in oris(&lpc) {
                    if lw <= ow && lh <= free_wh {
                        if min_break > 0.0 {
                            let lat_res = ow - lw;
                            if lat_res > 0.0 && lat_res < min_break { continue; }
                            let h_res = free_wh - lh;
                            if h_res > 0.0 && h_res < min_break { continue; }
                            let existing_w: Vec<f64> = arena.get(z_id).children.iter().map(|&w| arena.get(w).valor).collect();
                            if sibling_violates_min_break(&existing_w, lh, min_break) { continue; }
                        }
                        let w2_id = arena.add_child(z_id, NodeType::W, lh, 1);
                        if let Some(l) = &lpc.label { arena.get_mut(w2_id).label = Some(l.clone()); }
                        if lw < ow {
                            let q_id = arena.add_child(w2_id, NodeType::Q, lw, 1);
                            if let Some(l) = &lpc.label { arena.get_mut(q_id).label = Some(l.clone()); }
                        }
                        filled += lw * lh;
                        free_wh -= lh;
                        remaining.remove(j);
                        placed = true;
                        break;
                    }
                }
                if !placed { j += 1; }
            }

            free_h -= effective_h;
            remaining.remove(i);
        } else {
            i += 1;
        }
    }

    filled
}

fn fill_area_z(
    arena: &mut Arena,
    remaining: &mut Vec<Piece>,
    z_id: u32,
    area_w: f64,
    area_h: f64,
    min_break: f64,
) -> f64 {
    let mut filled = 0.0f64;
    let mut free_h = area_h;
    let mut i = 0;

    while i < remaining.len() && free_h > 0.0 {
        let pc = remaining[i].clone();
        let mut best_ori: Option<(f64, f64)> = None;
        let mut best_score = f64::INFINITY;

        for (ow, oh) in oris(&pc) {
            if ow <= area_w && oh <= free_h {
                if min_break > 0.0 && z_residual_violates_min_break(area_w, ow, min_break) { continue; }
                let score = (area_w - ow) + (free_h - oh) * 0.1;
                if score < best_score { best_score = score; best_ori = Some((ow, oh)); }
            }
        }

        if let Some((ow, oh)) = best_ori {
            let mut effective_h = oh;
            let residual_h = free_h - oh;
            if residual_h > 0.0 {
                let can_fit_more = remaining.iter().skip(i + 1).any(|p| oris(p).iter().any(|&(pw, ph)| pw <= area_w && ph <= residual_h));
                if !can_fit_more { effective_h = free_h; }
            }

            // Use oh (actual piece height), not effective_h (slot height), so that
            // extractUsedPiecesWithContext reads the correct piece dimensions from W.valor.
            // effective_h is only used for free_h accounting (claiming the remaining slot space).
            let w_id = arena.add_child(z_id, NodeType::W, oh, 1);
            if let Some(l) = &pc.label { arena.get_mut(w_id).label = Some(l.clone()); }
            if ow < area_w - 0.5 {
                let q_id = arena.add_child(w_id, NodeType::Q, ow, 1);
                if let Some(l) = &pc.label { arena.get_mut(q_id).label = Some(l.clone()); }
            }
            filled += ow * oh;

            free_h -= effective_h;
            remaining.remove(i);
        } else {
            i += 1;
        }
    }

    filled
}

// ========== COLLAPSE TREE WASTE ==========

pub fn collapse_tree_waste(
    arena: &mut Arena,
    remaining: &mut Vec<Piece>,
    _usable_w: f64,
    _usable_h: f64,
    min_break: f64,
) -> f64 {
    let mut added = 0.0f64;
    if remaining.is_empty() { return 0.0; }

    // LEVEL Y
    let col_ids: Vec<u32> = arena.nodes[ROOT_ID as usize].children.clone();
    for col_id in col_ids {
        if remaining.is_empty() { break; }
        let col_valor = arena.get(col_id).valor;
        added += collapse_level_y(arena, remaining, col_id, col_valor, min_break);
    }

    // LEVEL Z
    let col_ids: Vec<u32> = arena.nodes[ROOT_ID as usize].children.clone();
    for col_id in col_ids {
        if remaining.is_empty() { break; }
        let y_ids: Vec<u32> = arena.get(col_id).children.clone();
        for y_id in y_ids {
            if remaining.is_empty() { break; }
            let y_valor = arena.get(y_id).valor;
            added += collapse_level_z(arena, remaining, y_id, y_valor, min_break);
        }
    }

    added
}

fn collapse_level_y(arena: &mut Arena, remaining: &mut Vec<Piece>, col_id: u32, col_valor: f64, min_break: f64) -> f64 {
    let mut added = 0.0f64;
    let mut modified = true;

    while modified && !remaining.is_empty() {
        modified = false;
        let children: Vec<u32> = arena.get(col_id).children.clone();

        let mut i = 0;
        while i < children.len() {
            if !is_waste_subtree(arena, children[i]) { i += 1; continue; }

            let mut j = i;
            let mut total_val = 0.0f64;
            while j < children.len() && is_waste_subtree(arena, children[j]) {
                let n = arena.get(children[j]);
                total_val += n.valor * n.multi as f64;
                j += 1;
            }

            let run = j - i;
            if run < 2 || total_val < 50.0 { i = j; continue; }

            let can_fit = remaining.iter().any(|p| oris(p).iter().any(|&(ow, oh)| ow <= col_valor && oh <= total_val));
            if !can_fit { i = j; continue; }

            // Create merged Y node
            let new_y_id = {
                let new_id = arena.nodes.len() as u32;
                arena.nodes.push(crate::types::NodeData {
                    tipo: NodeType::Y,
                    valor: total_val,
                    multi: 1,
                    children: Vec::new(),
                    parent: col_id,
                    label: None,
                    transposed: false,
                });
                new_id
            };

            // Remove waste Y nodes from parent and insert merged node
            let col_children = &mut arena.nodes[col_id as usize].children;
            col_children.drain(i..j);
            col_children.insert(i, new_y_id);

            let filled = fill_collapsed_y(arena, remaining, new_y_id, col_valor, total_val, min_break);
            added += filled;

            if filled > 0.0 {
                modified = true;
                break;
            } else {
                // Revert: remove merged node, re-insert originals
                arena.nodes[col_id as usize].children.remove(i);
                // Can't easily revert detached nodes, just continue
                break;
            }
        }
    }

    added
}

fn fill_collapsed_y(arena: &mut Arena, remaining: &mut Vec<Piece>, y_id: u32, space_w: f64, space_h: f64, min_break: f64) -> f64 {
    let mut filled = 0.0f64;
    let mut free_h = space_h;

    while free_h > 0.0 && !remaining.is_empty() {
        let mut best_idx = usize::MAX;
        let mut best_ori: Option<(f64, f64)> = None;
        let mut best_area = 0.0f64;

        for i in 0..remaining.len() {
            for (ow, oh) in oris(&remaining[i]) {
                if ow <= space_w && oh <= free_h && ow * oh > best_area {
                    if min_break > 0.0 {
                        if z_residual_violates_min_break(space_w, ow, min_break) { continue; }
                        let h_res = free_h - oh;
                        if h_res > 0.0 && h_res < min_break { continue; }
                    }
                    best_area = ow * oh;
                    best_idx = i;
                    best_ori = Some((ow, oh));
                }
            }
        }

        if best_idx == usize::MAX { break; }
        let pc = remaining[best_idx].clone();
        let (ow, oh) = best_ori.unwrap();

        let z_id = arena.nodes.len() as u32;
        arena.nodes.push(crate::types::NodeData {
            tipo: NodeType::Z, valor: ow, multi: 1, children: Vec::new(),
            parent: y_id, label: pc.label.clone(), transposed: false,
        });
        arena.nodes[y_id as usize].children.push(z_id);

        let w_id = arena.add_child(z_id, NodeType::W, oh, 1);
        arena.get_mut(w_id).label = pc.label.clone();

        filled += ow * oh;
        free_h -= oh;
        remaining.remove(best_idx);
    }

    filled
}

fn collapse_level_z(arena: &mut Arena, remaining: &mut Vec<Piece>, y_id: u32, y_valor: f64, min_break: f64) -> f64 {
    let mut added = 0.0f64;
    let mut modified = true;

    while modified && !remaining.is_empty() {
        modified = false;
        let children: Vec<u32> = arena.get(y_id).children.clone();

        let mut i = 0;
        while i < children.len() {
            if !is_waste_subtree(arena, children[i]) { i += 1; continue; }

            let mut j = i;
            let mut total_val = 0.0f64;
            while j < children.len() && is_waste_subtree(arena, children[j]) {
                let n = arena.get(children[j]);
                total_val += n.valor * n.multi as f64;
                j += 1;
            }

            let run = j - i;
            if run < 2 || total_val < 50.0 { i = j; continue; }

            let can_fit = remaining.iter().any(|p| oris(p).iter().any(|&(ow, oh)| ow <= total_val && oh <= y_valor));
            if !can_fit { i = j; continue; }

            let new_z_id = {
                let new_id = arena.nodes.len() as u32;
                arena.nodes.push(crate::types::NodeData {
                    tipo: NodeType::Z, valor: total_val, multi: 1, children: Vec::new(),
                    parent: y_id, label: None, transposed: false,
                });
                new_id
            };

            arena.nodes[y_id as usize].children.drain(i..j);
            arena.nodes[y_id as usize].children.insert(i, new_z_id);

            let filled = fill_collapsed_z(arena, remaining, new_z_id, total_val, y_valor, min_break);
            added += filled;

            if filled > 0.0 { modified = true; break; }
            else {
                arena.nodes[y_id as usize].children.remove(i);
                break;
            }
        }
    }

    added
}

fn fill_collapsed_z(arena: &mut Arena, remaining: &mut Vec<Piece>, z_id: u32, space_w: f64, space_h: f64, min_break: f64) -> f64 {
    let mut filled = 0.0f64;
    let mut free_h = space_h;

    while free_h > 0.0 && !remaining.is_empty() {
        let mut best_idx = usize::MAX;
        let mut best_ori: Option<(f64, f64)> = None;
        let mut best_area = 0.0f64;

        for i in 0..remaining.len() {
            for (ow, oh) in oris(&remaining[i]) {
                if min_break > 0.0 {
                    let lat_res = space_w - ow;
                    if lat_res > 0.0 && lat_res < min_break { continue; }
                    let h_res = free_h - oh;
                    if h_res > 0.0 && h_res < min_break { continue; }
                    let existing_w: Vec<f64> = arena.get(z_id).children.iter().map(|&w| arena.get(w).valor).collect();
                    if sibling_violates_min_break(&existing_w, oh, min_break) { continue; }
                }
                if ow <= space_w && oh <= free_h && ow * oh > best_area {
                    best_area = ow * oh;
                    best_idx = i;
                    best_ori = Some((ow, oh));
                }
            }
        }

        if best_idx == usize::MAX { break; }
        let pc = remaining[best_idx].clone();
        let (ow, oh) = best_ori.unwrap();

        if (oh - space_h).abs() < 0.5 && (ow - space_w).abs() < 0.5 && (free_h - space_h).abs() < 0.5 {
            arena.get_mut(z_id).label = pc.label.clone();
        } else {
            let w_id = arena.add_child(z_id, NodeType::W, oh, 1);
            arena.get_mut(w_id).label = pc.label.clone();
            if ow < space_w - 0.5 {
                let q_id = arena.add_child(w_id, NodeType::Q, ow, 1);
                arena.get_mut(q_id).label = pc.label.clone();
                arena.get_mut(w_id).label = None;
            }
        }

        filled += space_w * oh;
        free_h -= oh;
        remaining.remove(best_idx);
    }

    filled
}

// ========== REGROUP ADJACENT STRIPS ==========

pub fn regroup_adjacent_strips(
    arena: &mut Arena,
    remaining: &mut Vec<Piece>,
    usable_w: f64,
    _usable_h: f64,
    min_break: f64,
) -> f64 {
    let mut total_added = 0.0f64;

    let col_ids: Vec<u32> = arena.nodes[ROOT_ID as usize].children.clone();
    for col_id in col_ids {
        if arena.get(col_id).children.len() < 2 { continue; }
        let col_valor = arena.get(col_id).valor;

        let mut modified = true;
        while modified {
            modified = false;
            let y_count = arena.get(col_id).children.len();

            'outer: for i in 0..y_count.saturating_sub(1) {
                for group_size in (2..=5.min(y_count - i)).rev() {
                    let y_ids: Vec<u32> = arena.get(col_id).children[i..i+group_size].to_vec();
                    let combined_h: f64 = y_ids.iter().map(|&y| { let n = arena.get(y); n.valor * n.multi as f64 }).sum();

                    // Extract pieces from the group
                    let extracted = extract_pieces_from_group(arena, &y_ids);
                    if extracted.is_empty() { continue; }

                    let waste_area = col_valor * combined_h - extracted.iter().map(|p| p.area).sum::<f64>();
                    let has_waste = group_size >= 2 && y_ids.iter().any(|&y| {
                        let used = children_sum(arena, y);
                        used < col_valor - 0.5
                    });
                    let can_fit_new = !remaining.is_empty() && remaining.iter().any(|p|
                        oris(p).iter().any(|&(ow, oh)| ow * oh <= waste_area && ow <= col_valor && oh <= combined_h)
                    );

                    if !can_fit_new && !has_waste { continue; }

                    // Try to repack the group + new pieces into a single Y strip
                    let mut new_y_id = {
                        let nid = arena.nodes.len() as u32;
                        arena.nodes.push(crate::types::NodeData {
                            tipo: NodeType::Y, valor: combined_h, multi: 1, children: Vec::new(),
                            parent: col_id, label: None, transposed: false,
                        });
                        nid
                    };

                    let mut all_candidates: Vec<Piece> = extracted.clone();
                    let candidate_from_remaining: Vec<usize> = (0..remaining.len())
                        .filter(|&ri| oris(&remaining[ri]).iter().any(|&(ow, oh)| ow <= col_valor && oh <= combined_h))
                        .collect();
                    for &ri in &candidate_from_remaining {
                        all_candidates.push(remaining[ri].clone());
                    }

                    let (placed, used_from_remaining) = pack_into_y(arena, new_y_id, &mut all_candidates, &extracted, col_valor, combined_h, remaining, &candidate_from_remaining, min_break);

                    let all_extracted_placed = extracted.iter().all(|ep| placed.contains(&ep.label));
                    if !all_extracted_placed { continue; }
                    if used_from_remaining.is_empty() && !has_waste { continue; }

                    // Commit: replace the Y group with the merged Y
                    arena.nodes[col_id as usize].children.drain(i..i+group_size);
                    arena.nodes[col_id as usize].children.insert(i, new_y_id);
                    arena.get_mut(new_y_id).parent = col_id;

                    let mut sorted_rem = used_from_remaining.clone();
                    sorted_rem.sort_unstable_by(|a, b| b.cmp(a));
                    let mut area_added = 0.0f64;
                    for idx in sorted_rem {
                        area_added += remaining[idx].area;
                        remaining.remove(idx);
                    }
                    total_added += area_added;
                    modified = true;
                    break 'outer;
                }
            }
        }
    }

    // Z-level regrouping
    let col_ids: Vec<u32> = arena.nodes[ROOT_ID as usize].children.clone();
    for col_id in col_ids {
        let col_valor = arena.get(col_id).valor;
        let y_ids: Vec<u32> = arena.get(col_id).children.clone();
        for y_id in y_ids {
            if arena.get(y_id).children.len() < 2 { continue; }
            let strip_h = arena.get(y_id).valor;

            let mut z_modified = true;
            while z_modified {
                z_modified = false;
                let z_count = arena.get(y_id).children.len();

                'z_outer: for i in 0..z_count.saturating_sub(1) {
                    for group_size in (2..=4.min(z_count - i)).rev() {
                        let z_ids: Vec<u32> = arena.get(y_id).children[i..i+group_size].to_vec();

                        let has_waste = z_ids.iter().any(|&z| is_waste_subtree(arena, z));
                        if !has_waste { continue; }

                        let combined_w: f64 = z_ids.iter().map(|&z| { let n = arena.get(z); n.valor * n.multi as f64 }).sum();
                        if combined_w > col_valor { continue; }

                        let can_fit = remaining.iter().any(|p|
                            oris(p).iter().any(|&(ow, oh)| ow <= combined_w && oh <= strip_h)
                        );
                        if !can_fit { continue; }

                        // Extract pieces from the Z group
                        let pieces_in_group = extract_pieces_from_z_group(arena, &z_ids, strip_h);

                        // Create merged Z node
                        let new_z_id = {
                            let nid = arena.nodes.len() as u32;
                            arena.nodes.push(crate::types::NodeData {
                                tipo: NodeType::Z, valor: combined_w, multi: 1, children: Vec::new(),
                                parent: y_id, label: None, transposed: false,
                            });
                            nid
                        };

                        let mut all_to_place: Vec<Piece> = pieces_in_group.clone();
                        let new_from_remaining_candidates: Vec<usize> = (0..remaining.len())
                            .filter(|&ri| oris(&remaining[ri]).iter().any(|&(ow, oh)| ow <= combined_w && oh <= strip_h))
                            .collect();
                        for &ri in &new_from_remaining_candidates {
                            all_to_place.push(remaining[ri].clone());
                        }

                        let (placed_labels, new_from_remaining) = pack_into_z(
                            arena, new_z_id, &all_to_place, &pieces_in_group, combined_w, strip_h,
                            remaining, &new_from_remaining_candidates, min_break
                        );

                        let all_orig_placed = pieces_in_group.iter().all(|p| placed_labels.contains(&p.label));
                        if !all_orig_placed { continue; }
                        let z_waste_consolidated = group_size > 1 && has_waste;
                        if new_from_remaining.is_empty() && !z_waste_consolidated { continue; }

                        // Commit
                        arena.nodes[y_id as usize].children.drain(i..i+group_size);
                        arena.nodes[y_id as usize].children.insert(i, new_z_id);
                        arena.get_mut(new_z_id).parent = y_id;

                        let mut sorted_rem = new_from_remaining.clone();
                        sorted_rem.sort_unstable_by(|a, b| b.cmp(a));
                        sorted_rem.dedup();
                        let mut area_added = 0.0f64;
                        for idx in sorted_rem {
                            area_added += remaining[idx].area;
                            remaining.remove(idx);
                        }
                        total_added += area_added;
                        z_modified = true;
                        break 'z_outer;
                    }
                }
            }
        }
    }

    // W-level regrouping
    let col_ids: Vec<u32> = arena.nodes[ROOT_ID as usize].children.clone();
    for col_id in col_ids {
        let y_ids: Vec<u32> = arena.get(col_id).children.clone();
        for y_id in y_ids {
            let strip_h = arena.get(y_id).valor;
            let z_ids: Vec<u32> = arena.get(y_id).children.clone();
            for z_id in z_ids {
                if arena.get(z_id).children.len() < 2 { continue; }
                let z_width = arena.get(z_id).valor;

                let mut w_modified = true;
                while w_modified {
                    w_modified = false;
                    let w_count = arena.get(z_id).children.len();

                    'w_outer: for i in 0..w_count.saturating_sub(1) {
                        for group_size in (2..=4.min(w_count - i)).rev() {
                            let w_ids: Vec<u32> = arena.get(z_id).children[i..i+group_size].to_vec();

                            let has_waste = w_ids.iter().any(|&w| is_waste_subtree(arena, w));
                            if !has_waste { continue; }

                            let combined_h: f64 = w_ids.iter().map(|&w| { let n = arena.get(w); n.valor * n.multi as f64 }).sum();
                            if combined_h > strip_h { continue; }

                            let can_fit = remaining.iter().any(|p|
                                oris(p).iter().any(|&(ow, oh)| ow <= z_width && oh <= combined_h)
                            );
                            if !can_fit { continue; }

                            // Extract pieces from W group
                            let pieces_in_group = extract_pieces_from_w_group(arena, &w_ids, z_width);

                            // All pieces in group must fit in the merged W height
                            let all_fit = pieces_in_group.iter().all(|p|
                                oris(p).iter().any(|&(ow, oh)| ow <= z_width && (oh - combined_h).abs() < 0.5)
                            );
                            if !all_fit { continue; }

                            // Create merged W node
                            let new_w_id = {
                                let nid = arena.nodes.len() as u32;
                                arena.nodes.push(crate::types::NodeData {
                                    tipo: NodeType::W, valor: combined_h, multi: 1, children: Vec::new(),
                                    parent: z_id, label: None, transposed: false,
                                });
                                nid
                            };

                            let mut all_to_place: Vec<Piece> = pieces_in_group.clone();
                            let new_from_remaining_candidates: Vec<usize> = (0..remaining.len())
                                .filter(|&ri| oris(&remaining[ri]).iter().any(|&(ow, oh)| ow <= z_width && (oh - combined_h).abs() < 0.5))
                                .collect();
                            for &ri in &new_from_remaining_candidates {
                                all_to_place.push(remaining[ri].clone());
                            }

                            let (placed_labels, new_from_remaining) = pack_into_w(
                                arena, new_w_id, &all_to_place, &pieces_in_group, z_width, combined_h,
                                remaining, &new_from_remaining_candidates, min_break
                            );

                            let all_orig_placed = pieces_in_group.iter().all(|p| placed_labels.contains(&p.label));
                            if !all_orig_placed { continue; }
                            let w_waste_consolidated = group_size > 1 && has_waste;
                            if new_from_remaining.is_empty() && !w_waste_consolidated { continue; }

                            // Commit
                            arena.nodes[z_id as usize].children.drain(i..i+group_size);
                            arena.nodes[z_id as usize].children.insert(i, new_w_id);
                            arena.get_mut(new_w_id).parent = z_id;

                            let mut sorted_rem = new_from_remaining.clone();
                            sorted_rem.sort_unstable_by(|a, b| b.cmp(a));
                            sorted_rem.dedup();
                            let mut area_added = 0.0f64;
                            for idx in sorted_rem {
                                area_added += remaining[idx].area;
                                remaining.remove(idx);
                            }
                            total_added += area_added;
                            w_modified = true;
                            break 'w_outer;
                        }
                    }
                }
            }
        }
    }

    total_added
}

fn extract_pieces_from_z_group(arena: &Arena, z_ids: &[u32], strip_h: f64) -> Vec<Piece> {
    let mut pieces = Vec::new();
    for &z_id in z_ids {
        let z_valor = arena.get(z_id).valor;
        if arena.get(z_id).children.is_empty() {
            if let Some(l) = &arena.get(z_id).label {
                pieces.push(Piece { w: z_valor, h: strip_h, area: z_valor * strip_h, label: Some(l.clone()), count: None, labels: None, grouped_axis: None, individual_dims: None });
            }
        } else {
            for &w_id in &arena.get(z_id).children.clone() {
                let w_valor = arena.get(w_id).valor;
                if arena.get(w_id).children.is_empty() {
                    if let Some(l) = &arena.get(w_id).label {
                        pieces.push(Piece { w: z_valor, h: w_valor, area: z_valor * w_valor, label: Some(l.clone()), count: None, labels: None, grouped_axis: None, individual_dims: None });
                    }
                } else {
                    for &q_id in &arena.get(w_id).children.clone() {
                        let q_valor = arena.get(q_id).valor;
                        if arena.get(q_id).children.is_empty() {
                            if let Some(l) = &arena.get(q_id).label {
                                pieces.push(Piece { w: q_valor, h: w_valor, area: q_valor * w_valor, label: Some(l.clone()), count: None, labels: None, grouped_axis: None, individual_dims: None });
                            }
                        } else {
                            for &r_id in &arena.get(q_id).children.clone() {
                                let r_valor = arena.get(r_id).valor;
                                if let Some(l) = &arena.get(r_id).label {
                                    pieces.push(Piece { w: q_valor, h: r_valor, area: q_valor * r_valor, label: Some(l.clone()), count: None, labels: None, grouped_axis: None, individual_dims: None });
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    pieces
}

fn extract_pieces_from_w_group(arena: &Arena, w_ids: &[u32], z_width: f64) -> Vec<Piece> {
    let mut pieces = Vec::new();
    for &w_id in w_ids {
        let w_valor = arena.get(w_id).valor;
        if arena.get(w_id).children.is_empty() {
            if let Some(l) = &arena.get(w_id).label {
                pieces.push(Piece { w: z_width, h: w_valor, area: z_width * w_valor, label: Some(l.clone()), count: None, labels: None, grouped_axis: None, individual_dims: None });
            }
        } else {
            for &q_id in &arena.get(w_id).children.clone() {
                let q_valor = arena.get(q_id).valor;
                if arena.get(q_id).children.is_empty() {
                    if let Some(l) = &arena.get(q_id).label {
                        pieces.push(Piece { w: q_valor, h: w_valor, area: q_valor * w_valor, label: Some(l.clone()), count: None, labels: None, grouped_axis: None, individual_dims: None });
                    }
                } else {
                    for &r_id in &arena.get(q_id).children.clone() {
                        let r_valor = arena.get(r_id).valor;
                        if let Some(l) = &arena.get(r_id).label {
                            pieces.push(Piece { w: q_valor, h: r_valor, area: q_valor * r_valor, label: Some(l.clone()), count: None, labels: None, grouped_axis: None, individual_dims: None });
                        }
                    }
                }
            }
        }
    }
    pieces
}

fn pack_into_z(
    arena: &mut Arena,
    z_id: u32,
    all_candidates: &[Piece],
    extracted: &[Piece],
    z_w: f64,
    strip_h: f64,
    remaining: &[Piece],
    candidate_indices: &[usize],
    min_break: f64,
) -> (Vec<Option<String>>, Vec<usize>) {
    let mut placed: Vec<Option<String>> = Vec::new();
    let mut used_from_remaining: Vec<usize> = Vec::new();
    let mut used_h = 0.0f64;
    let mut placed_pieces: Vec<usize> = Vec::new();

    while used_h < strip_h && placed_pieces.len() < all_candidates.len() {
        let free_h = strip_h - used_h;
        let mut best_idx = usize::MAX;
        let mut best_ori: Option<(f64, f64)> = None;
        let mut best_area = 0.0f64;

        for (ci, p) in all_candidates.iter().enumerate() {
            if placed_pieces.contains(&ci) { continue; }
            for (ow, oh) in oris(p) {
                if ow <= z_w && oh <= free_h {
                    if min_break > 0.0 {
                        let lat_res = z_w - ow;
                        if lat_res > 0.0 && lat_res < min_break { continue; }
                        let h_res = free_h - oh;
                        if h_res > 0.0 && h_res < min_break { continue; }
                        let existing_w: Vec<f64> = arena.get(z_id).children.iter().map(|&w| arena.get(w).valor).collect();
                        if sibling_violates_min_break(&existing_w, oh, min_break) { continue; }
                    }
                    if ow * oh > best_area {
                        best_area = ow * oh;
                        best_idx = ci;
                        best_ori = Some((ow, oh));
                    }
                }
            }
        }

        if best_idx == usize::MAX { break; }

        let (ow, oh) = best_ori.unwrap();
        let w_id = arena.add_child(z_id, NodeType::W, oh, 1);
        arena.get_mut(w_id).label = all_candidates[best_idx].label.clone();
        if ow < z_w - 0.5 {
            let q_id = arena.add_child(w_id, NodeType::Q, ow, 1);
            arena.get_mut(q_id).label = all_candidates[best_idx].label.clone();
            arena.get_mut(w_id).label = None;
        }

        placed.push(all_candidates[best_idx].label.clone());

        let is_from_remaining = !extracted.iter().any(|ep| ep.label == all_candidates[best_idx].label);
        if is_from_remaining {
            if let Some(ri) = candidate_indices.iter().find(|&&ri| remaining[ri].label == all_candidates[best_idx].label) {
                if !used_from_remaining.contains(ri) {
                    used_from_remaining.push(*ri);
                }
            }
        }

        placed_pieces.push(best_idx);
        used_h += oh;
    }

    (placed, used_from_remaining)
}

fn pack_into_w(
    arena: &mut Arena,
    w_id: u32,
    all_candidates: &[Piece],
    extracted: &[Piece],
    z_w: f64,
    combined_h: f64,
    remaining: &[Piece],
    candidate_indices: &[usize],
    min_break: f64,
) -> (Vec<Option<String>>, Vec<usize>) {
    let mut placed: Vec<Option<String>> = Vec::new();
    let mut used_from_remaining: Vec<usize> = Vec::new();
    let mut used_w = 0.0f64;
    let mut placed_pieces: Vec<usize> = Vec::new();

    while used_w < z_w && placed_pieces.len() < all_candidates.len() {
        let free_w = z_w - used_w;
        let mut best_idx = usize::MAX;
        let mut best_ori: Option<(f64, f64)> = None;
        let mut best_area = 0.0f64;

        for (ci, p) in all_candidates.iter().enumerate() {
            if placed_pieces.contains(&ci) { continue; }
            for (ow, oh) in oris(p) {
                if (oh - combined_h).abs() > 0.5 { continue; }
                if ow <= free_w {
                    if min_break > 0.0 {
                        let q_res = free_w - ow;
                        if q_res > 0.0 && q_res < min_break { continue; }
                        let existing_q: Vec<f64> = arena.get(w_id).children.iter().map(|&q| arena.get(q).valor).collect();
                        if sibling_violates_min_break(&existing_q, ow, min_break) { continue; }
                    }
                    if ow * oh > best_area {
                        best_area = ow * oh;
                        best_idx = ci;
                        best_ori = Some((ow, oh));
                    }
                }
            }
        }

        if best_idx == usize::MAX { break; }

        let (ow, _oh) = best_ori.unwrap();
        let q_id = arena.add_child(w_id, NodeType::Q, ow, 1);
        arena.get_mut(q_id).label = all_candidates[best_idx].label.clone();

        placed.push(all_candidates[best_idx].label.clone());

        let is_from_remaining = !extracted.iter().any(|ep| ep.label == all_candidates[best_idx].label);
        if is_from_remaining {
            if let Some(ri) = candidate_indices.iter().find(|&&ri| remaining[ri].label == all_candidates[best_idx].label) {
                if !used_from_remaining.contains(ri) {
                    used_from_remaining.push(*ri);
                }
            }
        }

        placed_pieces.push(best_idx);
        used_w += ow;
    }

    (placed, used_from_remaining)
}

fn extract_pieces_from_group(arena: &Arena, y_ids: &[u32]) -> Vec<Piece> {
    let mut pieces = Vec::new();
    for &y_id in y_ids {
        let y_valor = arena.get(y_id).valor;
        for &z_id in &arena.get(y_id).children.clone() {
            let z_valor = arena.get(z_id).valor;
            if arena.get(z_id).children.is_empty() {
                if let Some(l) = &arena.get(z_id).label {
                    pieces.push(Piece { w: z_valor, h: y_valor, area: z_valor * y_valor, label: Some(l.clone()), count: None, labels: None, grouped_axis: None, individual_dims: None });
                }
            } else {
                for &w_id in &arena.get(z_id).children.clone() {
                    let w_valor = arena.get(w_id).valor;
                    if arena.get(w_id).children.is_empty() {
                        if let Some(l) = &arena.get(w_id).label {
                            pieces.push(Piece { w: z_valor, h: w_valor, area: z_valor * w_valor, label: Some(l.clone()), count: None, labels: None, grouped_axis: None, individual_dims: None });
                        }
                    } else {
                        for &q_id in &arena.get(w_id).children.clone() {
                            let q_valor = arena.get(q_id).valor;
                            if arena.get(q_id).children.is_empty() {
                                if let Some(l) = &arena.get(q_id).label {
                                    pieces.push(Piece { w: q_valor, h: w_valor, area: q_valor * w_valor, label: Some(l.clone()), count: None, labels: None, grouped_axis: None, individual_dims: None });
                                }
                            } else {
                                for &r_id in &arena.get(q_id).children.clone() {
                                    let r_valor = arena.get(r_id).valor;
                                    if let Some(l) = &arena.get(r_id).label {
                                        pieces.push(Piece { w: q_valor, h: r_valor, area: q_valor * r_valor, label: Some(l.clone()), count: None, labels: None, grouped_axis: None, individual_dims: None });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    pieces
}

fn pack_into_y(
    arena: &mut Arena,
    y_id: u32,
    all_candidates: &mut Vec<Piece>,
    extracted: &[Piece],
    col_w: f64,
    combined_h: f64,
    remaining: &[Piece],
    candidate_indices: &[usize],
    min_break: f64,
) -> (Vec<Option<String>>, Vec<usize>) {
    let mut placed: Vec<Option<String>> = Vec::new();
    let mut used_from_remaining: Vec<usize> = Vec::new();
    let mut used_w = 0.0f64;
    let mut placed_pieces: Vec<usize> = Vec::new();

    while used_w < col_w && !all_candidates.is_empty() {
        let avail_w = col_w - used_w;
        let mut best_idx = usize::MAX;
        let mut best_ori: Option<(f64, f64)> = None;
        let mut best_score = f64::INFINITY;

        for (ci, p) in all_candidates.iter().enumerate() {
            if placed_pieces.contains(&ci) { continue; }
            for (ow, oh) in oris(p) {
                if ow <= avail_w && oh <= combined_h {
                    if min_break > 0.0 {
                        if z_residual_violates_min_break(avail_w, ow, min_break) { continue; }
                        let h_res = combined_h - oh;
                        if h_res > 0.0 && h_res < min_break { continue; }
                    }
                    let score = (avail_w - ow) + (combined_h - oh) * 0.5;
                    if score < best_score { best_score = score; best_idx = ci; best_ori = Some((ow, oh)); }
                }
            }
        }

        if best_idx == usize::MAX { break; }

        let (ow, oh) = best_ori.unwrap();
        let z_id = arena.nodes.len() as u32;
        arena.nodes.push(crate::types::NodeData {
            tipo: NodeType::Z, valor: ow, multi: 1, children: Vec::new(),
            parent: y_id, label: all_candidates[best_idx].label.clone(), transposed: false,
        });
        arena.nodes[y_id as usize].children.push(z_id);

        let w_id = arena.add_child(z_id, NodeType::W, oh, 1);
        arena.get_mut(w_id).label = all_candidates[best_idx].label.clone();

        placed.push(all_candidates[best_idx].label.clone());

        // Check if this candidate came from remaining
        let is_from_remaining = !extracted.iter().any(|ep| ep.label == all_candidates[best_idx].label);
        if is_from_remaining {
            if let Some(ri) = candidate_indices.iter().find(|&&ri| remaining[ri].label == all_candidates[best_idx].label) {
                if !used_from_remaining.contains(ri) {
                    used_from_remaining.push(*ri);
                }
            }
        }

        placed_pieces.push(best_idx);
        used_w += ow;
    }

    (placed, used_from_remaining)
}

// ========== CLAMP TREE HEIGHTS ==========

pub fn clamp_tree_heights(arena: &mut Arena, _usable_w: f64, usable_h: f64, mut placed_area: f64) -> f64 {
    let col_ids: Vec<u32> = arena.nodes[ROOT_ID as usize].children.clone();

    for col_id in col_ids {
        let col_valor = arena.get(col_id).valor;
        let mut total_h = 0.0f64;
        let mut valid_y: Vec<u32> = Vec::new();

        let y_ids: Vec<u32> = arena.get(col_id).children.clone();
        for y_id in y_ids {
            let y_h = arena.get(y_id).valor * arena.get(y_id).multi as f64;
            if total_h + y_h <= usable_h + 0.5 {
                valid_y.push(y_id);
                total_h += y_h;
            } else {
                let multi = arena.get(y_id).multi;
                let valor = arena.get(y_id).valor;
                if multi > 1 {
                    let can_fit = ((usable_h - total_h) / valor) as u32;
                    if can_fit > 0 {
                        arena.get_mut(y_id).multi = can_fit;
                        valid_y.push(y_id);
                        total_h += valor * can_fit as f64;
                    }
                } else if total_h + valor <= usable_h + 0.5 {
                    valid_y.push(y_id);
                    total_h += valor;
                }
            }
        }

        let orig_count = arena.get(col_id).children.len();
        if valid_y.len() < orig_count {
            let removed: Vec<u32> = arena.get(col_id).children.iter()
                .filter(|y| !valid_y.contains(y)).cloned().collect();
            for ry in removed {
                placed_area -= calc_node_area(arena, ry);
            }
            arena.get_mut(col_id).children = valid_y.clone();
        }

        for y_id in valid_y {
            let y_valor = arena.get(y_id).valor;
            let mut total_z = 0.0f64;
            let mut valid_z: Vec<u32> = Vec::new();
            let z_ids: Vec<u32> = arena.get(y_id).children.clone();

            for z_id in z_ids {
                let z_w = arena.get(z_id).valor * arena.get(z_id).multi as f64;
                if total_z + z_w <= col_valor + 0.5 {
                    valid_z.push(z_id);
                    total_z += z_w;
                } else {
                    let multi = arena.get(z_id).multi;
                    let valor = arena.get(z_id).valor;
                    if multi > 1 {
                        let can_fit = ((col_valor - total_z) / valor) as u32;
                        if can_fit > 0 {
                            arena.get_mut(z_id).multi = can_fit;
                            valid_z.push(z_id);
                            total_z += valor * can_fit as f64;
                        }
                    } else if total_z + valor <= col_valor + 0.5 {
                        valid_z.push(z_id);
                        total_z += valor;
                    }
                }
            }

            if valid_z.len() < arena.get(y_id).children.len() {
                let removed: Vec<u32> = arena.get(y_id).children.iter()
                    .filter(|z| !valid_z.contains(z)).cloned().collect();
                for rz in removed {
                    placed_area -= calc_z_area(arena, rz, y_valor);
                }
                arena.get_mut(y_id).children = valid_z.clone();
            }

            for z_id in valid_z {
                let z_valor = arena.get(z_id).valor;
                let mut total_w = 0.0f64;
                let mut valid_w: Vec<u32> = Vec::new();
                let w_ids: Vec<u32> = arena.get(z_id).children.clone();

                for w_id in w_ids {
                    let w_h = arena.get(w_id).valor * arena.get(w_id).multi as f64;
                    if total_w + w_h <= y_valor + 0.5 {
                        valid_w.push(w_id);
                        total_w += w_h;
                    } else {
                        let multi = arena.get(w_id).multi;
                        let valor = arena.get(w_id).valor;
                        if multi > 1 {
                            let can_fit = ((y_valor - total_w) / valor) as u32;
                            if can_fit > 0 {
                                arena.get_mut(w_id).multi = can_fit;
                                valid_w.push(w_id);
                                total_w += valor * can_fit as f64;
                            }
                        } else if total_w + valor <= y_valor + 0.5 {
                            valid_w.push(w_id);
                            total_w += valor;
                        }
                    }
                }

                if valid_w.len() < arena.get(z_id).children.len() {
                    let removed: Vec<u32> = arena.get(z_id).children.iter()
                        .filter(|w| !valid_w.contains(w)).cloned().collect();
                    for rw in removed {
                        placed_area -= calc_w_area(arena, rw, z_valor);
                    }
                    arena.get_mut(z_id).children = valid_w;
                }
            }
        }
    }

    placed_area
}

// ========== POST-OPTIMIZE REGROUP ==========

pub fn post_optimize_regroup(
    arena: &Arena,
    original_area: f64,
    all_pieces: &[Piece],
    usable_w: f64,
    usable_h: f64,
    min_break: f64,
) -> (Arena, f64, bool) {
    let placed = extract_placed_pieces(arena);

    let mut height_map: std::collections::HashMap<i64, Vec<(f64, f64, Option<String>, usize, usize)>> = std::collections::HashMap::new();
    for p in &placed {
        let h = (p.0.min(p.1) * 100.0).round() as i64;
        height_map.entry(h).or_default().push(p.clone());
    }

    let mut opportunities: Vec<(f64, Vec<(f64, f64, Option<String>, usize, usize)>)> = Vec::new();
    for (_, group) in &height_map {
        let cols: std::collections::HashSet<usize> = group.iter().map(|p| p.3).collect();
        if cols.len() > 1 && group.len() >= 2 {
            let total_w: f64 = group.iter().map(|p| p.0.max(p.1)).sum();
            if total_w <= usable_w {
                let h = group[0].0.min(group[0].1);
                opportunities.push((h, group.clone()));
            }
        }
    }

    if opportunities.is_empty() {
        return (arena.clone(), original_area, false);
    }

    let mut best_arena = arena.clone();
    let mut best_area = original_area;
    let mut improved = false;

    for (opp_h, opp_pieces) in &opportunities {
        let mut forced: Vec<Piece> = Vec::new();
        let mut used_labels: std::collections::HashSet<String> = std::collections::HashSet::new();

        let group_labels: Vec<String> = opp_pieces.iter().filter_map(|p| p.2.clone()).collect();
        let dims: Vec<f64> = opp_pieces.iter().map(|p| p.0.max(p.1)).collect();
        let sum_w: f64 = dims.iter().sum();
        for l in &group_labels { used_labels.insert(l.clone()); }

        forced.push(Piece {
            w: sum_w, h: *opp_h, area: sum_w * opp_h,
            count: Some(opp_pieces.len() as u32),
            labels: if group_labels.is_empty() { None } else { Some(group_labels) },
            grouped_axis: Some("w".to_string()),
            individual_dims: Some(dims),
            label: None,
        });

        for p in all_pieces {
            if p.label.as_ref().map(|l| used_labels.contains(l)).unwrap_or(false) { continue; }
            forced.push(p.clone());
        }

        for &transposed in &[false, true] {
            let (ew, eh) = if transposed { (usable_h, usable_w) } else { (usable_w, usable_h) };
            for si in 0..crate::optimizer::NUM_SORT_STRATEGIES {
                let grouped: Vec<Piece> = forced.iter().filter(|p| p.effective_count() > 1).cloned().collect();
                let mut rest: Vec<Piece> = forced.iter().filter(|p| p.effective_count() <= 1).cloned().collect();
                rest.sort_by(|a, b| crate::optimizer::cmp_by_strategy(a, b, si));
                let mut sorted = grouped;
                sorted.extend(rest);

                let result = crate::placement::run_placement(&sorted, ew, eh, min_break, None);
                if result.area > best_area {
                    best_area = result.area;
                    best_arena = if transposed {
                        let mut a = result.arena;
                        a.get_mut(ROOT_ID).transposed = true;
                        crate::normalization::normalize_tree(a, usable_w, usable_h, min_break)
                    } else {
                        result.arena
                    };
                    improved = true;
                }
            }
        }
    }

    (best_arena, best_area, improved)
}

fn extract_placed_pieces(arena: &Arena) -> Vec<(f64, f64, Option<String>, usize, usize)> {
    let mut pieces = Vec::new();
    for (ci, &x_id) in arena.nodes[ROOT_ID as usize].children.iter().enumerate() {
        for (yi, &y_id) in arena.get(x_id).children.iter().enumerate() {
            let y_valor = arena.get(y_id).valor;
            for &z_id in &arena.get(y_id).children.clone() {
                let z_valor = arena.get(z_id).valor;
                if arena.get(z_id).children.is_empty() {
                    pieces.push((z_valor, y_valor, arena.get(z_id).label.clone(), ci, yi));
                } else {
                    for &w_id in &arena.get(z_id).children.clone() {
                        let w_valor = arena.get(w_id).valor;
                        if arena.get(w_id).children.is_empty() {
                            pieces.push((z_valor, w_valor, arena.get(w_id).label.clone(), ci, yi));
                        } else {
                            for &q_id in &arena.get(w_id).children.clone() {
                                let q_valor = arena.get(q_id).valor;
                                if arena.get(q_id).children.is_empty() {
                                    pieces.push((q_valor, w_valor, arena.get(q_id).label.clone(), ci, yi));
                                } else {
                                    for &r_id in &arena.get(q_id).children.clone() {
                                        let r_valor = arena.get(r_id).valor;
                                        pieces.push((q_valor, r_valor, arena.get(r_id).label.clone(), ci, yi));
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    pieces
}
