use crate::types::Piece;

/// Both orientations of a piece (deduped if square).
#[inline]
pub fn oris(p: &Piece) -> Vec<(f64, f64)> {
    if (p.w - p.h).abs() < 0.5 {
        vec![(p.w, p.h)]
    } else {
        vec![(p.w, p.h), (p.h, p.w)]
    }
}

pub fn score_fit(space_w: f64, space_h: f64, piece_w: f64, piece_h: f64, remaining: &[Piece]) -> f64 {
    let waste_w = space_w - piece_w;
    let waste_h = space_h - piece_h;
    let mut score = waste_w * space_h + waste_h * piece_w;
    score -= piece_w * piece_h * 0.5;

    let mut w_fits = false;
    let mut h_fits = false;
    for r in remaining {
        for (rw, rh) in oris(r) {
            if !w_fits && waste_w >= rw && space_h >= rh { w_fits = true; }
            if !h_fits && piece_w >= rw && waste_h >= rh { h_fits = true; }
            if w_fits && h_fits { break; }
        }
        if w_fits && h_fits { break; }
    }

    if waste_w > 10.0 && !w_fits { score += waste_w * space_h * 4.0; }
    if waste_h > 10.0 && !h_fits { score += waste_h * piece_w * 4.0; }
    if waste_w == 0.0 { score -= space_h * 20.0; }
    if waste_h == 0.0 { score -= piece_w * 20.0; }
    score
}

pub fn can_residual_fit_any(
    residual_w: f64,
    residual_h: f64,
    remaining: &[Piece],
    min_break: f64,
    existing_sibling_vals: &[f64],
    axis: &str,
) -> bool {
    if residual_w <= 0.0 || residual_h <= 0.0 { return false; }
    for p in remaining {
        for (ow, oh) in oris(p) {
            if ow <= residual_w && oh <= residual_h {
                if min_break > 0.0 && !existing_sibling_vals.is_empty() {
                    let val = if axis == "w" { ow } else { oh };
                    let violates = existing_sibling_vals.iter().any(|&sv| {
                        let diff = (sv - val).abs();
                        diff > 0.0 && diff < min_break
                    });
                    if violates { continue; }
                }
                return true;
            }
        }
    }
    false
}

#[inline]
pub fn z_residual_violates_min_break(slot_w: f64, piece_w: f64, min_break: f64) -> bool {
    let residual = slot_w - piece_w;
    residual > 0.0 && residual < min_break
}

#[inline]
pub fn sibling_violates_min_break(existing: &[f64], new_val: f64, min_break: f64) -> bool {
    existing.iter().any(|&v| {
        let d = (v - new_val).abs();
        d > 0.0 && d < min_break
    })
}

pub fn violates_z_min_break(
    new_cut_positions: &[f64],
    all_positions: &[Vec<f64>],
    min_break: f64,
    exclude_y_index: Option<usize>,
) -> bool {
    for (i, positions) in all_positions.iter().enumerate() {
        if exclude_y_index == Some(i) { continue; }
        for &ep in positions {
            for &np in new_cut_positions {
                let diff = (ep - np).abs();
                if diff > 0.0 && diff < min_break { return true; }
            }
        }
    }
    false
}
