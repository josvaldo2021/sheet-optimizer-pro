use crate::types::{Arena, NodeType, Piece, ROOT_ID};
use crate::tree_utils::{insert_node, children_sum, get_all_z_cut_positions, get_z_cut_positions};
use crate::scoring::{oris, z_residual_violates_min_break, violates_z_min_break, sibling_violates_min_break};
use crate::void_filling::fill_voids;
use crate::post_processing::{unify_column_waste, collapse_tree_waste, regroup_adjacent_strips, clamp_tree_heights};

pub struct PlacementResult {
    pub arena: Arena,
    pub area: f64,
    pub remaining: Vec<Piece>,
}

/// Creates Z/W/Q/R nodes for a grouped or single piece placement.
pub fn create_piece_nodes(
    arena: &mut Arena,
    y_id: u32,
    piece: &Piece,
    placed_w: f64,
    placed_h: f64,
    rotated: bool,
    z_node_to_use: Option<u32>,
) -> f64 {
    // 2D block: cols × rows grid of identical pieces
    if piece.is_grouped() && piece.grouped_axis.as_deref() == Some("2d") {
        let dims = piece.individual_dims.as_deref().unwrap_or(&[1.0, 1.0]);
        let (cols, rows) = if rotated {
            (dims.get(1).copied().unwrap_or(1.0).round() as usize,
             dims.get(0).copied().unwrap_or(1.0).round() as usize)
        } else {
            (dims.get(0).copied().unwrap_or(1.0).round() as usize,
             dims.get(1).copied().unwrap_or(1.0).round() as usize)
        };
        let piece_w = if cols > 0 { placed_w / cols as f64 } else { placed_w };
        let piece_h = if rows > 0 { placed_h / rows as f64 } else { placed_h };
        let mut label_idx = 0usize;
        for _c in 0..cols {
            let z_id = insert_node(arena, y_id, NodeType::Z, piece_w, 1);
            for r in 0..rows {
                let w_id = arena.add_child(z_id, NodeType::W, piece_h, 1);
                if let Some(lbl) = piece.labels.as_ref().and_then(|ls| ls.get(label_idx)) {
                    arena.get_mut(w_id).label = Some(lbl.clone());
                    if r == 0 { arena.get_mut(z_id).label = Some(lbl.clone()); }
                }
                label_idx += 1;
            }
        }
        return placed_w * placed_h;
    }

    if piece.is_grouped() {
        let original_axis = piece.grouped_axis.as_deref().unwrap_or("w");
        let count = piece.effective_count() as usize;

        // After considering rotation, pieces grouped along the "spread" axis need Z split
        // (side-by-side in the placement's X direction), while pieces grouped along the
        // "stack" axis need W split (stacked in the placement's Y direction).
        //
        // "w"+!rotated → spread horizontally → Z
        // "h"+rotated  → originally stacked vertically, after 90° rotation now spread → Z
        // "h"+!rotated → stacked vertically → W
        // "w"+rotated  → originally spread horizontally, after 90° rotation now stacked → W
        let split_axis = if (original_axis == "w" && !rotated) || (original_axis == "h" && rotated) {
            "Z"
        } else {
            "W"
        };

        // If we have an existing Z node, we can't do a Z split.
        // For "w"-axis grouping (original_axis=="w" && !rotated), split_axis=="Z" means pieces are
        // side-by-side horizontally with individual_dims = individual widths. Forcing to "W" would
        // store those widths as W.valor (height field), producing wrong dimensions.
        // "Q" is correct: Z→W(placed_h)→Q(individual_w)×N keeps width in Q.valor and height in W.valor.
        let split_axis = if z_node_to_use.is_some() && split_axis == "Z" { "Q" } else { split_axis };

        match split_axis {
            "Z" => {
                for i in 0..count {
                    let dim_w = piece.individual_dims.as_ref()
                        .and_then(|d| d.get(i).copied())
                        .unwrap_or(placed_w / count as f64);
                    let z_id = insert_node(arena, y_id, NodeType::Z, dim_w, 1);
                    let lbl = piece.labels.as_ref().and_then(|ls| ls.get(i)).cloned();
                    if let Some(l) = &lbl { arena.get_mut(z_id).label = Some(l.clone()); }
                    let w_id = arena.add_child(z_id, NodeType::W, placed_h, 1);
                    if let Some(l) = lbl { arena.get_mut(w_id).label = Some(l); }
                }
            }
            "W" => {
                let z_id = z_node_to_use.unwrap_or_else(|| insert_node(arena, y_id, NodeType::Z, placed_w, 1));
                for i in 0..count {
                    let dim_h = piece.individual_dims.as_ref()
                        .and_then(|d| d.get(i).copied())
                        .unwrap_or(placed_h / count as f64);
                    let w_id = arena.add_child(z_id, NodeType::W, dim_h, 1);
                    let lbl = piece.labels.as_ref().and_then(|ls| ls.get(i)).cloned();
                    if let Some(l) = &lbl { arena.get_mut(w_id).label = Some(l.clone()); }
                    if i == 0 {
                        if let Some(l) = piece.labels.as_ref().and_then(|ls| ls.get(0)) {
                            arena.get_mut(z_id).label = Some(l.clone());
                        }
                    }
                }
            }
            "Q" => {
                let z_id = z_node_to_use.unwrap_or_else(|| insert_node(arena, y_id, NodeType::Z, placed_w, 1));
                let w_id = arena.add_child(z_id, NodeType::W, placed_h, 1);
                for i in 0..count {
                    let dim_w = piece.individual_dims.as_ref()
                        .and_then(|d| d.get(i).copied())
                        .unwrap_or(placed_w / count as f64);
                    let q_id = arena.add_child(w_id, NodeType::Q, dim_w, 1);
                    let lbl = piece.labels.as_ref().and_then(|ls| ls.get(i)).cloned();
                    if let Some(l) = &lbl {
                        arena.get_mut(q_id).label = Some(l.clone());
                        if i == 0 {
                            arena.get_mut(w_id).label = Some(l.clone());
                            arena.get_mut(z_id).label = Some(l.clone());
                        }
                    }
                }
            }
            _ => {
                // R
                let z_id = z_node_to_use.unwrap_or_else(|| insert_node(arena, y_id, NodeType::Z, placed_w, 1));
                let w_id = arena.add_child(z_id, NodeType::W, placed_h, 1);
                let q_id = arena.add_child(w_id, NodeType::Q, placed_w, 1);
                for i in 0..count {
                    let dim_h = piece.individual_dims.as_ref()
                        .and_then(|d| d.get(i).copied())
                        .unwrap_or(placed_h / count as f64);
                    let r_id = arena.add_child(q_id, NodeType::R, dim_h, 1);
                    let lbl = piece.labels.as_ref().and_then(|ls| ls.get(i)).cloned();
                    if let Some(l) = &lbl {
                        arena.get_mut(r_id).label = Some(l.clone());
                        if i == 0 {
                            arena.get_mut(q_id).label = Some(l.clone());
                            arena.get_mut(w_id).label = Some(l.clone());
                            arena.get_mut(z_id).label = Some(l.clone());
                        }
                    }
                }
            }
        }
    } else {
        let z_id = z_node_to_use.unwrap_or_else(|| insert_node(arena, y_id, NodeType::Z, placed_w, 1));
        if let Some(l) = &piece.label { arena.get_mut(z_id).label = Some(l.clone()); }
        let w_id = arena.add_child(z_id, NodeType::W, placed_h, 1);
        if let Some(l) = &piece.label { arena.get_mut(w_id).label = Some(l.clone()); }

        let actual_piece_w = if rotated { piece.h } else { piece.w };
        let actual_piece_h = if rotated { piece.w } else { piece.h };
        let slot_w = z_node_to_use.map(|z| arena.get(z).valor).unwrap_or(placed_w);
        let slot_h = placed_h;

        if actual_piece_w < slot_w - 0.5 || actual_piece_h < slot_h - 0.5 {
            let q_id = arena.add_child(w_id, NodeType::Q, actual_piece_w, 1);
            if let Some(l) = &piece.label { arena.get_mut(q_id).label = Some(l.clone()); }
            if actual_piece_h < slot_h - 0.5 {
                let r_id = arena.add_child(q_id, NodeType::R, actual_piece_h, 1);
                if let Some(l) = &piece.label { arena.get_mut(r_id).label = Some(l.clone()); }
            }
        }
    }

    placed_w * placed_h
}

pub fn run_placement(
    inventory: &[Piece],
    usable_w: f64,
    usable_h: f64,
    min_break: f64,
    horizontal_strip: Option<(f64, f64)>,
) -> PlacementResult {
    let mut arena = Arena::new_root(usable_w);
    let mut placed_area = 0.0f64;
    let mut remaining: Vec<Piece> = inventory.to_vec();

    // Horizontal strip seed
    if let Some((base_w, base_h)) = horizontal_strip {
        if !remaining.is_empty() {
            let x_id = arena.add_child(ROOT_ID, NodeType::X, usable_w, 1);
            let y_id = arena.add_child(x_id, NodeType::Y, base_h, 1);
            let base_piece = remaining[0].clone();
            placed_area += create_piece_nodes(&mut arena, y_id, &base_piece, base_w, base_h, (base_w - base_piece.w).abs() > 0.5, None);
            remaining.remove(0);

            let mut free_zw = usable_w - base_w;
            let mut i = 0;
            while i < remaining.len() && free_zw > 0.0 {
                let pc = remaining[i].clone();
                let mut best_ori: Option<(f64, f64)> = None;
                let mut best_score = f64::INFINITY;
                for (ow, oh) in oris(&pc) {
                    if ow <= free_zw && oh <= base_h {
                        if min_break > 0.0 && z_residual_violates_min_break(free_zw, ow, min_break) { continue; }
                        let score = (base_h - oh) * 2.0 + (free_zw - ow);
                        if score < best_score { best_score = score; best_ori = Some((ow, oh)); }
                    }
                }
                if let Some((ow, oh)) = best_ori {
                    placed_area += create_piece_nodes(&mut arena, y_id, &pc, ow, oh, (ow - pc.w).abs() > 0.5, None);
                    free_zw -= ow;
                    remaining.remove(i);
                } else {
                    i += 1;
                }
            }
        }
    }

    while !remaining.is_empty() {
        let piece = remaining[0].clone();

        struct BestFit {
            fit_type: u8, // 0=EXISTING, 1=NEW
            col_id: u32,
            w: f64,
            h: f64,
            piece_w: f64,
            piece_h: f64,
            score: f64,
            rotated: bool,
        }
        let mut best_fit: Option<BestFit> = None;

        // Try existing columns
        let col_ids: Vec<u32> = arena.nodes[ROOT_ID as usize].children.clone();
        for &col_id in &col_ids {
            let col_valor = arena.get(col_id).valor;
            let used_h = children_sum(&arena, col_id);
            let free_h = usable_h - used_h;

            for (ow, oh) in oris(&piece) {
                if min_break > 0.0 {
                    if oh < min_break { continue; }
                    let all_z = get_all_z_cut_positions(&arena, col_id);
                    if violates_z_min_break(&[ow], &all_z, min_break, None) { continue; }
                    if z_residual_violates_min_break(col_valor, ow, min_break) { continue; }
                    let y_sib_violates = arena.get(col_id).children.iter().any(|&y| {
                        let diff = (arena.get(y).valor - oh).abs();
                        diff > 0.0 && diff < min_break
                    });
                    if y_sib_violates { continue; }
                    let residual_y = free_h - oh;
                    if residual_y > 0.0 && residual_y < min_break { continue; }
                }
                if ow <= col_valor && oh <= free_h {
                    let residual_h = free_h - oh;
                    if min_break > 0.0 && residual_h > 0.0 && residual_h < min_break { continue; }
                    let width_ratio = ow / col_valor;
                    let base_score = (1.0 - width_ratio) * 3.0 + (1.0 - oh / free_h) * 0.5;
                    let mut look_bonus = 0.0f64;
                    let rem_h = free_h - oh;
                    let rem_w = col_valor - ow;
                    for r in remaining.iter().skip(1) {
                        for (rw, rh) in oris(r) {
                            if rw <= col_valor && rh <= rem_h { look_bonus -= 0.5; break; }
                            if rw <= rem_w && rh <= oh { look_bonus -= 0.3; break; }
                        }
                        if look_bonus < -1.0 { break; }
                    }
                    let score = base_score + look_bonus;
                    if best_fit.as_ref().map(|b| score < b.score).unwrap_or(true) {
                        best_fit = Some(BestFit { fit_type: 0, col_id, w: ow, h: oh, piece_w: ow, piece_h: oh, score, rotated: (ow - piece.w).abs() > 0.5 });
                    }
                }
            }
        }

        // Try new column
        let used_w: f64 = arena.nodes[ROOT_ID as usize].children.iter()
            .map(|&c| { let n = arena.get(c); n.valor * n.multi as f64 })
            .sum();
        let free_w = usable_w - used_w;

        if free_w > 0.0 {
            for (ow, oh) in oris(&piece) {
                if min_break > 0.0 {
                    let violates_x = arena.nodes[ROOT_ID as usize].children.iter().any(|&x| {
                        let diff = (arena.get(x).valor - ow).abs();
                        diff > 0.0 && diff < min_break
                    });
                    if violates_x { continue; }
                }
                if ow <= free_w && oh <= usable_h {
                    let residual_w = free_w - ow;
                    if min_break > 0.0 && residual_w > 0.0 && residual_w < min_break { continue; }
                    let score = ((free_w - ow) / usable_w) * 0.5;
                    if best_fit.as_ref().map(|b| score < b.score).unwrap_or(true) {
                        best_fit = Some(BestFit { fit_type: 1, col_id: ROOT_ID, w: ow, h: oh, piece_w: ow, piece_h: oh, score, rotated: (ow - piece.w).abs() > 0.5 });
                    }
                }
            }
        }

        let bf = match best_fit {
            None => { remaining.remove(0); continue; }
            Some(b) => b,
        };

        let col_id = if bf.fit_type == 1 {
            // NEW column with X-extension
            let cur_used_w: f64 = arena.nodes[ROOT_ID as usize].children.iter()
                .map(|&c| { let n = arena.get(c); n.valor * n.multi as f64 })
                .sum();
            let cur_free_w = usable_w - cur_used_w;
            let x_residual = cur_free_w - bf.w;
            let can_fit_in_residual = x_residual > 0.0 && remaining.iter().skip(1).any(|p| {
                oris(p).iter().any(|&(ow, oh)| ow <= x_residual && oh <= usable_h)
            });
            let effective_xw = if x_residual > 0.0 && !can_fit_in_residual { cur_free_w } else { bf.w };
            arena.add_child(ROOT_ID, NodeType::X, effective_xw, 1)
        } else {
            bf.col_id
        };

        // Safety check
        {
            let used_h = children_sum(&arena, col_id);
            if used_h + bf.h > usable_h + 0.5 {
                remaining.remove(0);
                continue;
            }
        }

        let col_free_h = usable_h - children_sum(&arena, col_id);
        let is_grouped = piece.is_grouped();

        // Pre-check: vertical stacking opportunity
        let mut stack_candidate_indices: Vec<usize> = Vec::new();
        if !is_grouped {
            for i in 1..remaining.len() {
                let pc = &remaining[i];
                if pc.is_grouped() { continue; }
                if oris(pc).iter().any(|&(ow, oh)| (ow - bf.piece_w).abs() < 0.5 && (oh - bf.piece_h).abs() < 0.5) {
                    stack_candidate_indices.push(i);
                }
            }
        }

        let mut max_possible_stack = (1 + stack_candidate_indices.len())
            .min((col_free_h / bf.piece_h) as usize);

        if max_possible_stack >= 2 && !is_grouped {
            let other_pieces: Vec<&Piece> = remaining.iter().enumerate()
                .filter(|&(idx, p)| idx != 0 && !p.is_grouped() && !oris(p).iter().any(|&(ow, oh)| (ow - bf.piece_w).abs() < 0.5 && (oh - bf.piece_h).abs() < 0.5))
                .map(|(_, p)| p)
                .collect();

            if !other_pieces.is_empty() {
                let col_valor = arena.get(col_id).valor;
                for try_stack in (2..=max_possible_stack).rev() {
                    let used_after = try_stack as f64 * bf.piece_h;
                    let free_after = col_free_h - used_after;
                    let can_fit = other_pieces.iter().any(|p| oris(p).iter().any(|&(ow, oh)| ow <= col_valor && oh <= free_after));
                    if can_fit { max_possible_stack = try_stack; break; }
                    if try_stack == 2 {
                        let free_with_1 = col_free_h - bf.piece_h;
                        let can_fit_1 = other_pieces.iter().any(|p| oris(p).iter().any(|&(ow, oh)| ow <= col_valor && oh <= free_with_1));
                        if can_fit_1 { max_possible_stack = 1; }
                    }
                }
            }
        }

        let mut stack_violates = false;
        if min_break > 0.0 && max_possible_stack >= 2 {
            let y_sib_vals: Vec<f64> = arena.get(col_id).children.iter().map(|&y| arena.get(y).valor).collect();
            stack_violates = y_sib_vals.iter().any(|&yv| { let d = (yv - bf.piece_h).abs(); d > 0.0 && d < min_break });
            if !stack_violates {
                let all_z = get_all_z_cut_positions(&arena, col_id);
                let y_idx = arena.get(col_id).children.len();
                if violates_z_min_break(&[bf.piece_w], &all_z, min_break, Some(y_idx)) { stack_violates = true; }
            }
        }

        let mut use_combined_y = max_possible_stack >= 2 && !stack_violates && !is_grouped;
        if use_combined_y {
            let combined_h_raw = max_possible_stack as f64 * bf.piece_h;
            let residual_h = col_free_h - combined_h_raw;
            if min_break > 0.0 && residual_h > 0.0 && residual_h < min_break { use_combined_y = false; }
        }

        if use_combined_y {
            let stack_count = max_possible_stack;
            let combined_h = stack_count as f64 * bf.piece_h;

            let comb_y_id = arena.add_child(col_id, NodeType::Y, combined_h, 1);
            let z_id = arena.add_child(comb_y_id, NodeType::Z, bf.piece_w, 1);

            {
                let w_id = arena.add_child(z_id, NodeType::W, bf.piece_h, 1);
                if let Some(l) = &piece.label {
                    arena.get_mut(w_id).label = Some(l.clone());
                    arena.get_mut(z_id).label = Some(l.clone());
                }
                placed_area += bf.piece_w * bf.piece_h;
                remaining.remove(0);
            }

            let mut placed_count = 1;
            let mut indices_to_remove: Vec<usize> = Vec::new();
            for &orig_idx in &stack_candidate_indices {
                if placed_count >= stack_count { break; }
                let adj_idx = if orig_idx > 0 { orig_idx - 1 } else { continue };
                if adj_idx >= remaining.len() { continue; }
                let pc = remaining[adj_idx].clone();
                let w_id = arena.add_child(z_id, NodeType::W, bf.piece_h, 1);
                if let Some(l) = &pc.label { arena.get_mut(w_id).label = Some(l.clone()); }
                placed_area += bf.piece_w * bf.piece_h;
                indices_to_remove.push(adj_idx);
                placed_count += 1;
            }
            indices_to_remove.sort_unstable_by(|a, b| b.cmp(a));
            for idx in indices_to_remove { remaining.remove(idx); }

            let col_valor = arena.get(col_id).valor;
            let mut free_zw = col_valor - bf.piece_w;
            let mut i = 0;
            while i < remaining.len() && free_zw > 0.0 {
                let pc = remaining[i].clone();
                let mut lateral_ori: Option<(f64, f64)> = None;
                for (ow, oh) in oris(&pc) {
                    if ow <= free_zw && oh <= bf.piece_h {
                        if min_break > 0.0 {
                            if z_residual_violates_min_break(free_zw, ow, min_break) { continue; }
                            let all_z = get_all_z_cut_positions(&arena, col_id);
                            let y_idx = arena.get(col_id).children.iter().position(|&y| y == comb_y_id);
                            let offset = children_sum(&arena, comb_y_id);
                            if violates_z_min_break(&[offset + ow], &all_z, min_break, y_idx) { continue; }
                        }
                        if lateral_ori.map(|(lw, _)| ow > lw).unwrap_or(true) {
                            lateral_ori = Some((ow, oh));
                        }
                    }
                }

                if let Some((ow, oh)) = lateral_ori {
                    let lat_z_id = arena.add_child(comb_y_id, NodeType::Z, ow, 1);
                    let lat_w_id = arena.add_child(lat_z_id, NodeType::W, oh, 1);
                    if let Some(l) = &pc.label {
                        arena.get_mut(lat_w_id).label = Some(l.clone());
                        arena.get_mut(lat_z_id).label = Some(l.clone());
                    }
                    placed_area += ow * oh;
                    remaining.remove(i);

                    let mut lat_used_h = oh;
                    let mut j = 0;
                    while j < remaining.len() && lat_used_h < combined_h {
                        let lpc = remaining[j].clone();
                        let mut stack_ori: Option<(f64, f64)> = None;
                        for (sow, soh) in oris(&lpc) {
                            if sow <= ow && soh <= combined_h - lat_used_h {
                                if min_break > 0.0 {
                                    let existing_w = arena.get(lat_z_id).children.iter().map(|&w| arena.get(w).valor).collect::<Vec<_>>();
                                    if sibling_violates_min_break(&existing_w, soh, min_break) { continue; }
                                    let h_residual = combined_h - lat_used_h - soh;
                                    if h_residual > 0.0 && h_residual < min_break { continue; }
                                    let lat_residual = ow - sow;
                                    if lat_residual > 0.0 && lat_residual < min_break { continue; }
                                }
                                if stack_ori.map(|(sw, sh)| sow * soh > sw * sh).unwrap_or(true) {
                                    stack_ori = Some((sow, soh));
                                }
                            }
                        }
                        if let Some((sow, soh)) = stack_ori {
                            placed_area += create_piece_nodes(&mut arena, comb_y_id, &lpc, sow, soh, (sow - lpc.w).abs() > 0.5, Some(lat_z_id));
                            lat_used_h += soh;
                            remaining.remove(j);
                        } else {
                            j += 1;
                        }
                    }
                    free_zw -= ow;
                } else {
                    i += 1;
                }
            }
        } else {
            // SINGLE Y STRIP with Y-extension
            let col_free_h_now = usable_h - children_sum(&arena, col_id);
            let y_residual = col_free_h_now - bf.h;
            let col_valor = arena.get(col_id).valor;
            let can_fit_in_residual = y_residual > 0.0 && remaining.iter().skip(1).any(|p| {
                oris(p).iter().any(|&(ow, oh)| ow <= col_valor && oh <= y_residual)
            });
            let effective_yh = if y_residual > 0.0 && !can_fit_in_residual { col_free_h_now } else { bf.h };

            let y_id = arena.add_child(col_id, NodeType::Y, effective_yh, 1);
            placed_area += create_piece_nodes(&mut arena, y_id, &piece, bf.piece_w, bf.piece_h, bf.rotated, None);
            remaining.remove(0);

            let mut free_zw = col_valor - bf.piece_w;

            // Pass 1: exact height matches
            let mut i = 0;
            while i < remaining.len() && free_zw > 0.0 {
                let pc = remaining[i].clone();
                let mut best_ori: Option<(f64, f64)> = None;
                let mut best_score = f64::INFINITY;
                for (ow, oh) in oris(&pc) {
                    if (oh - bf.piece_h).abs() > 0.5 { continue; }
                    if min_break > 0.0 {
                        let all_z = get_all_z_cut_positions(&arena, col_id);
                        let y_idx = arena.get(col_id).children.iter().position(|&y| y == y_id);
                        let cur_offset = children_sum(&arena, y_id);
                        let new_cut = cur_offset + ow;
                        if violates_z_min_break(&[new_cut], &all_z, min_break, y_idx) { continue; }
                        if z_residual_violates_min_break(free_zw, ow, min_break) { continue; }
                    }
                    if ow <= free_zw {
                        let score = free_zw - ow;
                        if score < best_score { best_score = score; best_ori = Some((ow, oh)); }
                    }
                }
                if let Some((ow, oh)) = best_ori {
                    placed_area += create_piece_nodes(&mut arena, y_id, &pc, ow, oh, (ow - pc.w).abs() > 0.5, None);
                    free_zw -= ow;
                    remaining.remove(i);
                } else {
                    i += 1;
                }
            }

            // Pass 2: shorter pieces
            let mut i = 0;
            while i < remaining.len() && free_zw > 0.0 {
                let pc = remaining[i].clone();
                let mut best_ori: Option<(f64, f64)> = None;
                let mut best_score = f64::INFINITY;
                for (ow, oh) in oris(&pc) {
                    if min_break > 0.0 {
                        let all_z = get_all_z_cut_positions(&arena, col_id);
                        let y_idx = arena.get(col_id).children.iter().position(|&y| y == y_id);
                        let cur_offset = children_sum(&arena, y_id);
                        let new_cut = cur_offset + ow;
                        if violates_z_min_break(&[new_cut], &all_z, min_break, y_idx) { continue; }
                        if z_residual_violates_min_break(free_zw, ow, min_break) { continue; }
                        let w_residual = bf.h - oh;
                        if w_residual > 0.0 && w_residual < min_break { continue; }
                    }
                    if ow <= free_zw && oh <= bf.h {
                        let score = (bf.h - oh) * 2.0 + (free_zw - ow);
                        if score < best_score { best_score = score; best_ori = Some((ow, oh)); }
                    }
                }
                if let Some((ow, oh)) = best_ori {
                    placed_area += create_piece_nodes(&mut arena, y_id, &pc, ow, oh, (ow - pc.w).abs() > 0.5, None);
                    let z_cur_id = *arena.get(y_id).children.last().unwrap();
                    let mut free_wh = bf.h - oh;
                    let mut j = 0;
                    while j < remaining.len() && free_wh > 0.0 {
                        if j == i { j += 1; continue; }
                        let pw = remaining[j].clone();
                        let mut placed_w = false;
                        for (wow, woh) in oris(&pw) {
                            if min_break > 0.0 {
                                let existing_w: Vec<f64> = arena.get(z_cur_id).children.iter().map(|&w| arena.get(w).valor).collect();
                                if sibling_violates_min_break(&existing_w, woh, min_break) { continue; }
                                let lat_res = arena.get(z_cur_id).valor - wow;
                                if lat_res > 0.0 && lat_res < min_break { continue; }
                                let h_res = free_wh - woh;
                                if h_res > 0.0 && h_res < min_break { continue; }
                            }
                            if wow <= arena.get(z_cur_id).valor && woh <= free_wh {
                                placed_area += create_piece_nodes(&mut arena, y_id, &pw, wow, woh, (wow - pw.w).abs() > 0.5, Some(z_cur_id));
                                free_wh -= woh;
                                remaining.remove(j);
                                if j < i { /* i adjusted below */ }
                                j = j.saturating_sub(1);
                                placed_w = true;
                                break;
                            }
                        }
                        if !placed_w { j += 1; }
                    }
                    free_zw -= ow;
                    remaining.remove(i);
                } else {
                    i += 1;
                }
            }
        }

        // Void filling after each piece
        if !remaining.is_empty() {
            placed_area += fill_voids(&mut arena, &mut remaining, usable_w, usable_h, min_break);
        }
    }

    // Post-processing pipeline
    if !remaining.is_empty() {
        placed_area += unify_column_waste(&mut arena, &mut remaining, usable_w, usable_h, min_break);
    }
    if !remaining.is_empty() {
        placed_area += collapse_tree_waste(&mut arena, &mut remaining, usable_w, usable_h, min_break);
    }
    placed_area += regroup_adjacent_strips(&mut arena, &mut remaining, usable_w, usable_h, min_break);
    if !remaining.is_empty() {
        placed_area += fill_voids(&mut arena, &mut remaining, usable_w, usable_h, min_break);
    }
    placed_area = clamp_tree_heights(&mut arena, usable_w, usable_h, placed_area);

    PlacementResult { arena, area: placed_area, remaining }
}
