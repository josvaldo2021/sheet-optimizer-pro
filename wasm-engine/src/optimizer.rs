use crate::types::{Arena, Piece, OptimizeV6Result, ROOT_ID};
use crate::placement::run_placement;
use crate::normalization::normalize_tree;
use crate::grouping::{
    group_pieces_by_same_width, group_pieces_by_same_height,
    group_pieces_fill_row, group_pieces_fill_col,
    group_pieces_column_width, group_pieces_column_height,
    group_pieces_band_first, group_pieces_band_last,
    group_by_common_dimension, group_by_common_dimension_transposed,
    group_strip_packing_dp, group_strip_packing_dp_transposed,
    group_common_dimension_dp,
};

pub const NUM_SORT_STRATEGIES: usize = 12;

pub fn sort_by_strategy(pieces: &mut Vec<Piece>, idx: usize) {
    pieces.sort_by(|a, b| cmp_by_strategy(a, b, idx));
}

pub fn cmp_by_strategy(a: &Piece, b: &Piece, idx: usize) -> std::cmp::Ordering {
    match idx {
        0 => b.area.partial_cmp(&a.area).unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| f64::max(b.w, b.h).partial_cmp(&f64::max(a.w, a.h)).unwrap_or(std::cmp::Ordering::Equal)),
        1 => f64::max(b.w, b.h).partial_cmp(&f64::max(a.w, a.h)).unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| b.area.partial_cmp(&a.area).unwrap_or(std::cmp::Ordering::Equal)),
        2 => b.h.partial_cmp(&a.h).unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| b.w.partial_cmp(&a.w).unwrap_or(std::cmp::Ordering::Equal)),
        3 => b.w.partial_cmp(&a.w).unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| b.h.partial_cmp(&a.h).unwrap_or(std::cmp::Ordering::Equal)),
        4 => (b.w + b.h).partial_cmp(&(a.w + a.h)).unwrap_or(std::cmp::Ordering::Equal),
        5 => (b.w / b.h.max(0.001)).partial_cmp(&(a.w / a.h.max(0.001))).unwrap_or(std::cmp::Ordering::Equal),
        6 => f64::min(b.w, b.h).partial_cmp(&f64::min(a.w, a.h)).unwrap_or(std::cmp::Ordering::Equal),
        7 => {
            let ra = f64::max(a.w, a.h) / f64::min(a.w, a.h).max(0.001);
            let rb = f64::max(b.w, b.h) / f64::min(b.w, b.h).max(0.001);
            rb.partial_cmp(&ra).unwrap_or(std::cmp::Ordering::Equal)
        }
        8 => b.area.partial_cmp(&a.area).unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| b.w.partial_cmp(&a.w).unwrap_or(std::cmp::Ordering::Equal)),
        9 => b.area.partial_cmp(&a.area).unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| b.h.partial_cmp(&a.h).unwrap_or(std::cmp::Ordering::Equal)),
        10 => f64::max(b.w, b.h).partial_cmp(&f64::max(a.w, a.h)).unwrap_or(std::cmp::Ordering::Equal),
        11 => {
            let va = (a.w * a.h) / (a.w + a.h).max(0.001);
            let vb = (b.w * b.h) / (b.w + b.h).max(0.001);
            vb.partial_cmp(&va).unwrap_or(std::cmp::Ordering::Equal)
        }
        _ => std::cmp::Ordering::Equal,
    }
}

fn calc_compactness(arena: &Arena) -> u32 {
    let num_cols = arena.nodes[ROOT_ID as usize].children.len() as u32;
    let total_nodes = (arena.nodes.len() as u32).saturating_sub(1);
    num_cols * 1000 + total_nodes
}

fn rotate_pieces(pieces: &[Piece]) -> Vec<Piece> {
    pieces.iter().map(|p| Piece {
        w: p.h, h: p.w, area: p.area, count: p.count, label: p.label.clone(),
        labels: p.labels.clone(), grouped_axis: p.grouped_axis.clone(), individual_dims: p.individual_dims.clone(),
    }).collect()
}

pub fn optimize_v6_arena(
    pieces: &[Piece],
    usable_w: f64,
    usable_h: f64,
    min_break: f64,
    use_grouping: bool,
) -> (Arena, Vec<Piece>) {
    if pieces.is_empty() {
        return (Arena::new_root(usable_w), vec![]);
    }

    let has_labels = pieces.iter().any(|p| p.label.is_some());
    let rotated = rotate_pieces(pieces);

    let variants: Vec<Vec<Piece>> = if has_labels || !use_grouping {
        vec![pieces.to_vec(), rotated.clone()]
    } else {
        vec![
            pieces.to_vec(),
            rotated.clone(),
            group_pieces_by_same_width(pieces, usable_h),
            group_pieces_by_same_width(&rotated, usable_h),
            group_pieces_by_same_width(pieces, f64::MAX),
            group_pieces_by_same_width(&rotated, f64::MAX),
            group_pieces_by_same_height(pieces, usable_w),
            group_pieces_by_same_height(&rotated, usable_w),
            group_pieces_by_same_height(pieces, f64::MAX),
            group_pieces_by_same_height(&rotated, f64::MAX),
            group_pieces_fill_row(pieces, usable_w, false),
            group_pieces_fill_row(&rotated, usable_w, false),
            group_pieces_fill_row(pieces, usable_w, true),
            group_pieces_fill_row(&rotated, usable_w, true),
            group_pieces_fill_col(pieces, usable_h, false),
            group_pieces_fill_col(&rotated, usable_h, false),
            group_pieces_fill_col(pieces, usable_h, true),
            group_pieces_fill_col(&rotated, usable_h, true),
            group_pieces_fill_row(&group_pieces_by_same_width(pieces, usable_h), usable_w, false),
            group_pieces_fill_row(&group_pieces_by_same_height(pieces, usable_w), usable_w, false),
            group_pieces_column_width(pieces, usable_w),
            group_pieces_column_width(&rotated, usable_w),
            group_pieces_column_height(pieces, usable_h),
            group_pieces_column_height(&rotated, usable_h),
            group_pieces_band_first(pieces, usable_w, false),
            group_pieces_band_first(&rotated, usable_w, false),
            group_pieces_band_first(pieces, usable_w, true),
            group_pieces_band_first(&rotated, usable_w, true),
            group_pieces_band_last(pieces, usable_w, false),
            group_pieces_band_last(&rotated, usable_w, false),
            group_by_common_dimension(pieces, usable_w, usable_h, 0.4),
            group_by_common_dimension(&rotated, usable_w, usable_h, 0.4),
            group_by_common_dimension(pieces, usable_w, usable_h, 0.3),
            group_by_common_dimension(&rotated, usable_w, usable_h, 0.3),
            group_by_common_dimension_transposed(pieces, usable_w, usable_h, 0.4),
            group_by_common_dimension_transposed(&rotated, usable_w, usable_h, 0.4),
            group_strip_packing_dp(pieces, usable_w, usable_h, 0.0, false),
            group_strip_packing_dp(&rotated, usable_w, usable_h, 0.0, false),
            group_strip_packing_dp(pieces, usable_w, usable_h, 5.0, false),
            group_strip_packing_dp(&rotated, usable_w, usable_h, 5.0, false),
            group_strip_packing_dp(pieces, usable_w, usable_h, 30.0, false),
            group_strip_packing_dp(&rotated, usable_w, usable_h, 30.0, false),
            group_strip_packing_dp(pieces, usable_w, usable_h, 100.0, false),
            group_strip_packing_dp(pieces, usable_w, usable_h, 5.0, true),
            group_strip_packing_dp(&rotated, usable_w, usable_h, 5.0, true),
            group_strip_packing_dp_transposed(pieces, usable_w, usable_h, 0.0),
            group_strip_packing_dp_transposed(&rotated, usable_w, usable_h, 0.0),
            group_strip_packing_dp_transposed(pieces, usable_w, usable_h, 5.0),
            group_strip_packing_dp_transposed(&rotated, usable_w, usable_h, 5.0),
            group_common_dimension_dp(pieces, usable_w, usable_h, 0.3),
            group_common_dimension_dp(&rotated, usable_w, usable_h, 0.3),
            group_common_dimension_dp(pieces, usable_w, usable_h, 0.2),
            group_common_dimension_dp(&rotated, usable_w, usable_h, 0.2),
        ]
    };

    let mut best_arena: Option<Arena> = None;
    let mut best_area = 0.0f64;
    let mut best_remaining: Vec<Piece> = pieces.to_vec();
    let mut best_transposed = false;
    let mut best_compactness = u32::MAX;

    for &transposed in &[false, true] {
        let ew = if transposed { usable_h } else { usable_w };
        let eh = if transposed { usable_w } else { usable_h };

        for variant in &variants {
            for si in 0..NUM_SORT_STRATEGIES {
                let mut sorted = variant.clone();
                sort_by_strategy(&mut sorted, si);
                let result = run_placement(&sorted, ew, eh, min_break, None);
                let compactness = calc_compactness(&result.arena);
                if result.area > best_area
                    || (result.area == best_area && compactness < best_compactness)
                {
                    best_area = result.area;
                    best_remaining = result.remaining;
                    best_transposed = transposed;
                    best_compactness = compactness;
                    best_arena = Some(result.arena);
                }
            }
        }
    }

    let mut final_arena = best_arena.unwrap_or_else(|| Arena::new_root(usable_w));

    if best_transposed {
        final_arena.get_mut(ROOT_ID).transposed = true;
        final_arena = normalize_tree(final_arena, usable_w, usable_h, min_break);
    } else if min_break > 0.0 {
        final_arena = normalize_tree(final_arena, usable_w, usable_h, min_break);
    }

    (final_arena, best_remaining)
}

pub fn optimize_v6(
    pieces: &[Piece],
    usable_w: f64,
    usable_h: f64,
    min_break: f64,
    use_grouping: bool,
) -> OptimizeV6Result {
    let (arena, remaining) = optimize_v6_arena(pieces, usable_w, usable_h, min_break, use_grouping);
    OptimizeV6Result {
        tree: arena.to_json_node(ROOT_ID),
        remaining,
    }
}
