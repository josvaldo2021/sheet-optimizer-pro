use crate::types::{Arena, NodeType, Piece, ROOT_ID};
use crate::tree_utils::{children_sum, get_all_z_cut_positions};
use crate::scoring::{oris, z_residual_violates_min_break, violates_z_min_break, sibling_violates_min_break};
use crate::placement::create_piece_nodes;

pub fn fill_voids(
    arena: &mut Arena,
    remaining: &mut Vec<Piece>,
    usable_w: f64,
    usable_h: f64,
    min_break: f64,
) -> f64 {
    let mut filled = 0.0f64;

    let col_ids: Vec<u32> = arena.nodes[ROOT_ID as usize].children.clone();
    for col_id in col_ids {
        let col_valor = arena.get(col_id).valor;
        let used_h = children_sum(arena, col_id);
        let free_h = usable_h - used_h;
        if free_h > 0.0 {
            filled += fill_rect_y(arena, col_id, remaining, col_valor, free_h, min_break);
        }

        let y_ids: Vec<u32> = arena.get(col_id).children.clone();
        for y_id in y_ids {
            let y_valor = arena.get(y_id).valor;
            let used_z = children_sum(arena, y_id);
            let free_z = col_valor - used_z;
            if free_z > 0.0 {
                filled += fill_rect_z(arena, y_id, remaining, free_z, y_valor, min_break);
            }

            let z_ids: Vec<u32> = arena.get(y_id).children.clone();
            for z_id in z_ids {
                let z_valor = arena.get(z_id).valor;
                let used_w = children_sum(arena, z_id);
                let free_w = y_valor - used_w;
                if free_w > 0.0 {
                    filled += fill_rect_w(arena, z_id, remaining, z_valor, free_w, min_break);
                }
            }
        }
    }

    filled
}

fn fill_rect_y(
    arena: &mut Arena,
    col_id: u32,
    remaining: &mut Vec<Piece>,
    max_w: f64,
    max_h: f64,
    min_break: f64,
) -> f64 {
    let mut filled = 0.0f64;
    let mut cur_max_h = max_h;

    while cur_max_h > 0.0 && !remaining.is_empty() {
        let mut best_idx = usize::MAX;
        let mut best_ori: Option<(f64, f64)> = None;
        let mut best_area = 0.0f64;

        let col_valor = arena.get(col_id).valor;
        for i in 0..remaining.len() {
            for (ow, oh) in oris(&remaining[i]) {
                if ow <= max_w && oh <= cur_max_h {
                    if min_break > 0.0 {
                        if oh < min_break { continue; }
                        let all_z = get_all_z_cut_positions(arena, col_id);
                        if violates_z_min_break(&[ow], &all_z, min_break, None) { continue; }
                        if z_residual_violates_min_break(max_w, ow, min_break) { continue; }
                        let residual_h = cur_max_h - oh;
                        if residual_h > 0.0 && residual_h < min_break { continue; }
                    }
                    let area = ow * oh;
                    if area > best_area { best_area = area; best_idx = i; best_ori = Some((ow, oh)); }
                }
            }
        }

        if best_idx == usize::MAX { break; }
        let pc = remaining[best_idx].clone();
        let (ow, oh) = best_ori.unwrap();

        let consumed = oh;
        let y_id = arena.add_child(col_id, NodeType::Y, consumed, 1);
        create_piece_nodes(arena, y_id, &pc, ow, oh, (ow - pc.w).abs() > 0.5, None);

        filled += ow * oh;
        cur_max_h -= consumed;
        remaining.remove(best_idx);
    }

    filled
}

fn fill_rect_z(
    arena: &mut Arena,
    y_id: u32,
    remaining: &mut Vec<Piece>,
    max_w: f64,
    max_h: f64,
    min_break: f64,
) -> f64 {
    let mut filled = 0.0f64;
    let mut cur_max_w = max_w;

    while cur_max_w > 0.0 && !remaining.is_empty() {
        let mut best_idx = usize::MAX;
        let mut best_ori: Option<(f64, f64)> = None;
        let mut best_area = 0.0f64;

        for i in 0..remaining.len() {
            for (ow, oh) in oris(&remaining[i]) {
                if ow <= cur_max_w && oh <= max_h {
                    if min_break > 0.0 {
                        if z_residual_violates_min_break(cur_max_w, ow, min_break) { continue; }
                        let residual_w = cur_max_w - ow;
                        if residual_w > 0.0 && residual_w < min_break { continue; }
                        let residual_h = max_h - oh;
                        if residual_h > 0.0 && residual_h < min_break { continue; }
                    }
                    let area = ow * oh;
                    if area > best_area { best_area = area; best_idx = i; best_ori = Some((ow, oh)); }
                }
            }
        }

        if best_idx == usize::MAX { break; }
        let pc = remaining[best_idx].clone();
        let (ow, oh) = best_ori.unwrap();

        create_piece_nodes(arena, y_id, &pc, ow, oh, (ow - pc.w).abs() > 0.5, None);
        filled += ow * oh;
        cur_max_w -= ow;
        remaining.remove(best_idx);
    }

    filled
}

fn fill_rect_w(
    arena: &mut Arena,
    z_id: u32,
    remaining: &mut Vec<Piece>,
    z_width: f64,
    max_h: f64,
    min_break: f64,
) -> f64 {
    let mut filled = 0.0f64;
    let mut cur_max_h = max_h;

    while cur_max_h > 0.0 && !remaining.is_empty() {
        let mut best_idx = usize::MAX;
        let mut best_ori: Option<(f64, f64)> = None;
        let mut best_area = 0.0f64;

        for i in 0..remaining.len() {
            for (ow, oh) in oris(&remaining[i]) {
                if ow <= z_width && oh <= cur_max_h {
                    if min_break > 0.0 {
                        let existing_w: Vec<f64> = arena.get(z_id).children.iter().map(|&w| arena.get(w).valor).collect();
                        if sibling_violates_min_break(&existing_w, oh, min_break) { continue; }
                        let lat_res = z_width - ow;
                        if lat_res > 0.0 && lat_res < min_break { continue; }
                        let h_res = cur_max_h - oh;
                        if h_res > 0.0 && h_res < min_break { continue; }
                    }
                    let area = ow * oh;
                    if area > best_area { best_area = area; best_idx = i; best_ori = Some((ow, oh)); }
                }
            }
        }

        if best_idx == usize::MAX { break; }
        let pc = remaining[best_idx].clone();
        let (ow, oh) = best_ori.unwrap();

        create_piece_nodes(arena, z_id, &pc, ow, oh, (ow - pc.w).abs() > 0.5, Some(z_id));
        filled += ow * oh;
        cur_max_h -= oh;
        remaining.remove(best_idx);
    }

    filled
}
