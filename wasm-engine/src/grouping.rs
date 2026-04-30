use crate::types::Piece;

fn make_piece(w: f64, h: f64, label: Option<String>, count: usize, labels: Option<Vec<String>>, axis: &str, dims: Vec<f64>) -> Piece {
    let area = if count > 1 { dims.first().copied().unwrap_or(w) * h } else { w * h };
    Piece { w, h, area, count: Some(count as u32), label, labels, grouped_axis: Some(axis.to_string()), individual_dims: if dims.is_empty() { None } else { Some(dims) } }
}

fn single_piece(w: f64, h: f64, label: Option<String>) -> Piece {
    Piece { w, h, area: w * h, count: Some(1), label, labels: None, grouped_axis: None, individual_dims: None }
}

pub fn group_pieces_by_same_width(pieces: &[Piece], max_h: f64) -> Vec<Piece> {
    let normalized: Vec<_> = pieces.iter().map(|p| {
        let nw = p.w.max(p.h);
        let nh = p.w.min(p.h);
        (nw, nh, p.label.clone())
    }).collect();

    let mut width_groups: std::collections::HashMap<i64, Vec<(f64, f64, Option<String>)>> = std::collections::HashMap::new();
    for (nw, nh, lbl) in &normalized {
        width_groups.entry((*nw * 1000.0) as i64).or_default().push((*nw, *nh, lbl.clone()));
    }

    let mut result = Vec::new();
    for (_, group) in &width_groups {
        let w = group[0].0;
        let mut sorted: Vec<_> = group.clone();
        sorted.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
        let mut remaining = sorted.clone();

        while !remaining.is_empty() {
            let mut stack = Vec::new();
            let mut stack_h = 0.0f64;
            for item in &remaining {
                if stack_h + item.1 <= max_h { stack.push(item.clone()); stack_h += item.1; }
            }

            if stack.len() >= 2 {
                let labels: Vec<String> = stack.iter().filter_map(|p| p.2.clone()).collect();
                let dims: Vec<f64> = stack.iter().map(|p| p.1).collect();
                result.push(make_piece(w, stack_h, None, stack.len(), if labels.is_empty() { None } else { Some(labels) }, "h", dims));
                for s in &stack { remaining.retain(|r| !(r.0 == s.0 && (r.1 - s.1).abs() < 0.5 && r.2 == s.2)); }
            } else {
                let p = remaining.remove(0);
                result.push(single_piece(p.0, p.1, p.2));
            }
        }
    }

    result.sort_by(|a, b| {
        if (b.area - a.area).abs() > 0.5 { return b.area.partial_cmp(&a.area).unwrap(); }
        let wa = if a.effective_count() > 1 { a.w } else { a.w.max(a.h) };
        let wb = if b.effective_count() > 1 { b.w } else { b.w.max(b.h) };
        wb.partial_cmp(&wa).unwrap()
    });
    result
}

pub fn group_pieces_by_same_height(pieces: &[Piece], max_w: f64) -> Vec<Piece> {
    let normalized: Vec<_> = pieces.iter().map(|p| {
        let nw = p.w.max(p.h);
        let nh = p.w.min(p.h);
        (nw, nh, p.label.clone())
    }).collect();

    let mut height_groups: std::collections::HashMap<i64, Vec<(f64, f64, Option<String>)>> = std::collections::HashMap::new();
    for (nw, nh, lbl) in &normalized {
        height_groups.entry((*nh * 1000.0) as i64).or_default().push((*nw, *nh, lbl.clone()));
    }

    let mut result = Vec::new();
    for (_, group) in &height_groups {
        let h = group[0].1;
        let mut sorted: Vec<_> = group.clone();
        sorted.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap());
        let mut remaining = sorted.clone();

        while !remaining.is_empty() {
            let mut row = Vec::new();
            let mut row_w = 0.0f64;
            for item in &remaining {
                if row_w + item.0 <= max_w { row.push(item.clone()); row_w += item.0; }
            }

            if row.len() >= 2 {
                let labels: Vec<String> = row.iter().filter_map(|p| p.2.clone()).collect();
                let dims: Vec<f64> = row.iter().map(|p| p.0).collect();
                result.push(make_piece(row_w, h, None, row.len(), if labels.is_empty() { None } else { Some(labels) }, "w", dims));
                for r in &row { remaining.retain(|i| !(i.0 == r.0 && (i.1 - r.1).abs() < 0.5 && i.2 == r.2)); }
            } else {
                let p = remaining.remove(0);
                result.push(single_piece(p.0, p.1, p.2));
            }
        }
    }

    result.sort_by(|a, b| {
        if (b.area - a.area).abs() > 0.5 { return b.area.partial_cmp(&a.area).unwrap(); }
        let ha = if a.effective_count() > 1 { a.h } else { a.h.min(a.w) };
        let hb = if b.effective_count() > 1 { b.h } else { b.h.min(b.w) };
        hb.partial_cmp(&ha).unwrap()
    });
    result
}

pub fn group_pieces_by_height(pieces: &[Piece]) -> Vec<Piece> {
    group_pieces_by_same_height(pieces, f64::INFINITY)
}

pub fn group_pieces_by_width(pieces: &[Piece]) -> Vec<Piece> {
    group_pieces_by_same_width(pieces, f64::INFINITY)
}

pub fn group_pieces_fill_row(pieces: &[Piece], usable_w: f64, raw: bool) -> Vec<Piece> {
    let normalized: Vec<_> = pieces.iter().map(|p| {
        let nw = if raw { p.w } else { p.w.max(p.h) };
        let nh = if raw { p.h } else { p.w.min(p.h) };
        (nw, nh, p.label.clone())
    }).collect();

    let mut height_groups: std::collections::HashMap<i64, Vec<(f64, f64, Option<String>)>> = std::collections::HashMap::new();
    for (nw, nh, lbl) in &normalized {
        height_groups.entry((*nh * 1000.0) as i64).or_default().push((*nw, *nh, lbl.clone()));
    }

    let mut result = Vec::new();
    for (_, group) in &height_groups {
        let h = group[0].1;
        let mut sorted: Vec<_> = group.clone();
        sorted.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap());
        let mut remaining = sorted.clone();

        while !remaining.is_empty() {
            let mut row = Vec::new();
            let mut row_w = 0.0f64;
            for item in &remaining {
                if row_w + item.0 <= usable_w { row.push(item.clone()); row_w += item.0; }
            }

            if row.len() >= 2 {
                let labels: Vec<String> = row.iter().filter_map(|p| p.2.clone()).collect();
                let dims: Vec<f64> = row.iter().map(|p| p.0).collect();
                result.push(make_piece(row_w, h, None, row.len(), if labels.is_empty() { None } else { Some(labels) }, "w", dims));
                for r in &row { remaining.retain(|i| !(i.0 == r.0 && (i.1 - r.1).abs() < 0.5 && i.2 == r.2)); }
            } else {
                let p = remaining.remove(0);
                result.push(single_piece(p.0, p.1, p.2));
            }
        }
    }

    result.sort_by(|a, b| {
        if (b.area - a.area).abs() > 0.5 { return b.area.partial_cmp(&a.area).unwrap(); }
        let ha = if a.effective_count() > 1 { a.h } else { a.h.min(a.w) };
        let hb = if b.effective_count() > 1 { b.h } else { b.h.min(b.w) };
        hb.partial_cmp(&ha).unwrap()
    });
    result
}

pub fn group_pieces_fill_col(pieces: &[Piece], usable_h: f64, raw: bool) -> Vec<Piece> {
    let normalized: Vec<_> = pieces.iter().map(|p| {
        let nw = if raw { p.w } else { p.w.max(p.h) };
        let nh = if raw { p.h } else { p.w.min(p.h) };
        (nw, nh, p.label.clone())
    }).collect();

    let mut width_groups: std::collections::HashMap<i64, Vec<(f64, f64, Option<String>)>> = std::collections::HashMap::new();
    for (nw, nh, lbl) in &normalized {
        width_groups.entry((*nw * 1000.0) as i64).or_default().push((*nw, *nh, lbl.clone()));
    }

    let mut result = Vec::new();
    for (_, group) in &width_groups {
        let w = group[0].0;
        let mut sorted: Vec<_> = group.clone();
        sorted.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
        let mut remaining = sorted.clone();

        while !remaining.is_empty() {
            let mut col = Vec::new();
            let mut col_h = 0.0f64;
            for item in &remaining {
                if col_h + item.1 <= usable_h { col.push(item.clone()); col_h += item.1; }
            }

            if col.len() >= 2 {
                let labels: Vec<String> = col.iter().filter_map(|p| p.2.clone()).collect();
                let dims: Vec<f64> = col.iter().map(|p| p.1).collect();
                result.push(make_piece(w, col_h, None, col.len(), if labels.is_empty() { None } else { Some(labels) }, "h", dims));
                for c in &col { remaining.retain(|i| !(i.0 == c.0 && (i.1 - c.1).abs() < 0.5 && i.2 == c.2)); }
            } else {
                let p = remaining.remove(0);
                result.push(single_piece(p.0, p.1, p.2));
            }
        }
    }

    result.sort_by(|a, b| {
        if (b.area - a.area).abs() > 0.5 { return b.area.partial_cmp(&a.area).unwrap(); }
        let wa = if a.effective_count() > 1 { a.w } else { a.w.max(a.h) };
        let wb = if b.effective_count() > 1 { b.w } else { b.w.max(b.h) };
        wb.partial_cmp(&wa).unwrap()
    });
    result
}

pub fn group_pieces_column_width(pieces: &[Piece], usable_w: f64) -> Vec<Piece> {
    let mut grouped = group_pieces_by_height(pieces);
    grouped.sort_by(|a, b| {
        if (b.area - a.area).abs() > 0.5 { return b.area.partial_cmp(&a.area).unwrap(); }
        let ag = a.effective_count() > 1;
        let bg = b.effective_count() > 1;
        if ag && bg { return b.w.partial_cmp(&a.w).unwrap().then(b.h.partial_cmp(&a.h).unwrap()); }
        if ag && !bg { return std::cmp::Ordering::Less; }
        if !ag && bg { return std::cmp::Ordering::Greater; }
        std::cmp::Ordering::Equal
    });
    grouped.retain(|p| p.w <= usable_w);
    grouped
}

pub fn group_pieces_column_height(pieces: &[Piece], usable_h: f64) -> Vec<Piece> {
    let mut grouped = group_pieces_by_width(pieces);
    grouped.sort_by(|a, b| {
        if (b.area - a.area).abs() > 0.5 { return b.area.partial_cmp(&a.area).unwrap(); }
        let ag = a.effective_count() > 1;
        let bg = b.effective_count() > 1;
        if ag && bg { return b.h.partial_cmp(&a.h).unwrap().then(b.w.partial_cmp(&a.w).unwrap()); }
        if ag && !bg { return std::cmp::Ordering::Less; }
        if !ag && bg { return std::cmp::Ordering::Greater; }
        std::cmp::Ordering::Equal
    });
    grouped.retain(|p| p.h <= usable_h);
    grouped
}

pub fn group_pieces_band_first(pieces: &[Piece], usable_w: f64, raw: bool) -> Vec<Piece> {
    let mut grouped = group_pieces_fill_row(pieces, usable_w, raw);
    grouped.sort_by(|a, b| {
        if (b.area - a.area).abs() > 0.5 { return b.area.partial_cmp(&a.area).unwrap(); }
        let ag = a.effective_count() > 1;
        let bg = b.effective_count() > 1;
        if ag && bg { return b.w.partial_cmp(&a.w).unwrap().then(b.h.partial_cmp(&a.h).unwrap()); }
        if ag && !bg { return std::cmp::Ordering::Less; }
        if !ag && bg { return std::cmp::Ordering::Greater; }
        std::cmp::Ordering::Equal
    });
    grouped
}

pub fn group_pieces_band_last(pieces: &[Piece], usable_w: f64, raw: bool) -> Vec<Piece> {
    let mut grouped = group_pieces_fill_row(pieces, usable_w, raw);
    grouped.sort_by(|a, b| {
        if (b.area - a.area).abs() > 0.5 { return b.area.partial_cmp(&a.area).unwrap(); }
        let ag = a.effective_count() > 1;
        let bg = b.effective_count() > 1;
        if !ag && bg { return std::cmp::Ordering::Less; }
        if ag && !bg { return std::cmp::Ordering::Greater; }
        if ag && bg { return b.w.partial_cmp(&a.w).unwrap().then(b.h.partial_cmp(&a.h).unwrap()); }
        std::cmp::Ordering::Equal
    });
    grouped
}

pub fn group_by_common_dimension(pieces: &[Piece], usable_w: f64, _usable_h: f64, threshold: f64) -> Vec<Piece> {
    if pieces.len() < 2 { return pieces.to_vec(); }

    let mut dim_count: std::collections::HashMap<i64, usize> = std::collections::HashMap::new();
    for p in pieces {
        *dim_count.entry((p.w * 1000.0) as i64).or_default() += 1;
        if (p.h - p.w).abs() > 0.5 { *dim_count.entry((p.h * 1000.0) as i64).or_default() += 1; }
    }

    let (best_dim_key, best_count) = dim_count.iter().max_by_key(|(_, &v)| v).map(|(&k, &v)| (k, v)).unwrap_or((0, 0));
    let best_dim = best_dim_key as f64 / 1000.0;
    let min_count = (pieces.len() as f64 * threshold).floor().max(2.0) as usize;
    if best_count < min_count { return pieces.to_vec(); }

    let mut oriented: Vec<(f64, Option<String>)> = Vec::new();
    let mut others: Vec<Piece> = Vec::new();
    for p in pieces {
        if (p.h - best_dim).abs() < 0.5 {
            oriented.push((p.w, p.label.clone()));
        } else if (p.w - best_dim).abs() < 0.5 {
            oriented.push((p.h, p.label.clone()));
        } else {
            others.push(p.clone());
        }
    }

    oriented.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap());

    let mut rows: Vec<Vec<(f64, Option<String>)>> = Vec::new();
    let mut row_widths: Vec<f64> = Vec::new();

    for (orig_w, lbl) in oriented {
        let best = row_widths.iter().enumerate()
            .filter(|(_, &rw)| orig_w <= usable_w - rw)
            .min_by(|(_, &ra), (_, &rb)| (usable_w - ra).partial_cmp(&(usable_w - rb)).unwrap())
            .map(|(i, _)| i);

        if let Some(idx) = best {
            rows[idx].push((orig_w, lbl));
            row_widths[idx] += orig_w;
        } else {
            rows.push(vec![(orig_w, lbl)]);
            row_widths.push(orig_w);
        }
    }

    let mut result: Vec<Piece> = Vec::new();
    for (r, &rw) in rows.iter().zip(row_widths.iter()) {
        if r.len() >= 2 {
            let labels: Vec<String> = r.iter().filter_map(|p| p.1.clone()).collect();
            let dims: Vec<f64> = r.iter().map(|p| p.0).collect();
            result.push(make_piece(rw, best_dim, None, r.len(), if labels.is_empty() { None } else { Some(labels) }, "w", dims));
        } else {
            result.push(single_piece(r[0].0, best_dim, r[0].1.clone()));
        }
    }

    result.extend(others);
    result.sort_by(|a, b| b.area.partial_cmp(&a.area).unwrap());
    result
}

pub fn group_by_common_dimension_transposed(pieces: &[Piece], _usable_w: f64, usable_h: f64, threshold: f64) -> Vec<Piece> {
    if pieces.len() < 2 { return pieces.to_vec(); }

    let mut dim_count: std::collections::HashMap<i64, usize> = std::collections::HashMap::new();
    for p in pieces {
        *dim_count.entry((p.w * 1000.0) as i64).or_default() += 1;
        if (p.h - p.w).abs() > 0.5 { *dim_count.entry((p.h * 1000.0) as i64).or_default() += 1; }
    }

    let (best_dim_key, best_count) = dim_count.iter().max_by_key(|(_, &v)| v).map(|(&k, &v)| (k, v)).unwrap_or((0, 0));
    let best_dim = best_dim_key as f64 / 1000.0;
    let min_count = (pieces.len() as f64 * threshold).floor().max(2.0) as usize;
    if best_count < min_count { return pieces.to_vec(); }

    let mut oriented: Vec<(f64, Option<String>)> = Vec::new();
    let mut others: Vec<Piece> = Vec::new();
    for p in pieces {
        if (p.w - best_dim).abs() < 0.5 {
            oriented.push((p.h, p.label.clone()));
        } else if (p.h - best_dim).abs() < 0.5 {
            oriented.push((p.w, p.label.clone()));
        } else {
            others.push(p.clone());
        }
    }

    oriented.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap());

    let mut cols: Vec<Vec<(f64, Option<String>)>> = Vec::new();
    let mut col_heights: Vec<f64> = Vec::new();

    for (orig_h, lbl) in oriented {
        let best = col_heights.iter().enumerate()
            .filter(|(_, &ch)| orig_h <= usable_h - ch)
            .min_by(|(_, &ca), (_, &cb)| (usable_h - ca).partial_cmp(&(usable_h - cb)).unwrap())
            .map(|(i, _)| i);

        if let Some(idx) = best {
            cols[idx].push((orig_h, lbl));
            col_heights[idx] += orig_h;
        } else {
            cols.push(vec![(orig_h, lbl)]);
            col_heights.push(orig_h);
        }
    }

    let mut result: Vec<Piece> = Vec::new();
    for (c, &ch) in cols.iter().zip(col_heights.iter()) {
        if c.len() >= 2 {
            let labels: Vec<String> = c.iter().filter_map(|p| p.1.clone()).collect();
            let dims: Vec<f64> = c.iter().map(|p| p.0).collect();
            result.push(make_piece(best_dim, ch, None, c.len(), if labels.is_empty() { None } else { Some(labels) }, "h", dims));
        } else {
            result.push(single_piece(best_dim, c[0].0, c[0].1.clone()));
        }
    }

    result.extend(others);
    result.sort_by(|a, b| b.area.partial_cmp(&a.area).unwrap());
    result
}

// ========== KNAPSACK DP ==========

fn knapsack_select(weights: &[f64], capacity: f64) -> Vec<usize> {
    let n = weights.len();
    let cap = capacity.floor() as usize;
    if cap == 0 || n == 0 { return Vec::new(); }

    let scale = if cap > 10000 { ((cap as f64) / 10000.0).ceil() as usize } else { 1 };
    let scaled_cap = cap / scale;
    let scaled_w: Vec<usize> = weights.iter().map(|&w| (w / scale as f64).floor() as usize).collect();

    let mut dp = vec![0.0f64; scaled_cap + 1];
    let mut keep = vec![false; n * (scaled_cap + 1)];

    for i in 0..n {
        let w = scaled_w[i];
        if w == 0 || w > scaled_cap { continue; }
        for j in (w..=scaled_cap).rev() {
            let new_val = dp[j - w] + weights[i];
            if new_val > dp[j] {
                dp[j] = new_val;
                keep[i * (scaled_cap + 1) + j] = true;
            }
        }
    }

    let mut result = Vec::new();
    let mut j = scaled_cap;
    for i in (0..n).rev() {
        if j > 0 && keep[i * (scaled_cap + 1) + j] {
            result.push(i);
            j = j.saturating_sub(scaled_w[i]);
        }
    }
    result
}

pub fn group_strip_packing_dp(pieces: &[Piece], usable_w: f64, usable_h: f64, tolerance: f64, raw: bool) -> Vec<Piece> {
    if pieces.len() < 2 { return pieces.to_vec(); }

    let normalized: Vec<_> = pieces.iter().map(|p| {
        let nw = if raw { p.w } else { p.w.max(p.h) };
        let nh = if raw { p.h } else { p.w.min(p.h) };
        (nw, nh, p.label.clone())
    }).collect();

    let mut sorted = normalized.clone();
    sorted.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap());

    let mut height_groups: Vec<Vec<(f64, f64, Option<String>)>> = Vec::new();
    if !sorted.is_empty() {
        let mut current = vec![sorted[0].clone()];
        for i in 1..sorted.len() {
            if sorted[i].1 - current[0].1 <= tolerance {
                current.push(sorted[i].clone());
            } else {
                height_groups.push(current.clone());
                current = vec![sorted[i].clone()];
            }
        }
        height_groups.push(current);
    }

    let mut strips: Vec<(f64, f64, Vec<(f64, f64, Option<String>)>)> = Vec::new(); // (height, total_w, pieces)
    let mut unassigned: Vec<(f64, f64, Option<String>)> = Vec::new();

    for group in height_groups {
        if group.len() < 2 { unassigned.extend(group); continue; }
        let strip_h = group.iter().map(|p| p.1).fold(f64::NEG_INFINITY, f64::max);
        let widths: Vec<f64> = group.iter().map(|p| p.0).collect();
        let selected = knapsack_select(&widths, usable_w);
        if selected.len() < 2 { unassigned.extend(group); continue; }
        let total_w: f64 = selected.iter().map(|&i| widths[i]).sum();
        let sel_pieces: Vec<_> = selected.iter().map(|&i| group[i].clone()).collect();
        let sel_set: std::collections::HashSet<usize> = selected.into_iter().collect();
        for (i, p) in group.iter().enumerate() {
            if !sel_set.contains(&i) { unassigned.push(p.clone()); }
        }
        strips.push((strip_h, total_w, sel_pieces));
    }

    if strips.is_empty() { return pieces.to_vec(); }

    let strip_heights: Vec<f64> = strips.iter().map(|s| s.0).collect();
    let selected_strips = knapsack_select(&strip_heights, usable_h);

    let mut result: Vec<Piece> = Vec::new();
    let sel_set: std::collections::HashSet<usize> = selected_strips.iter().cloned().collect();

    for &si in &selected_strips {
        let (sh, sw, ref sp) = strips[si];
        if sp.len() >= 2 {
            let labels: Vec<String> = sp.iter().filter_map(|p| p.2.clone()).collect();
            let dims: Vec<f64> = sp.iter().map(|p| p.0).collect();
            result.push(make_piece(sw, sh, None, sp.len(), if labels.is_empty() { None } else { Some(labels) }, "w", dims));
        } else {
            result.push(single_piece(sp[0].0, sp[0].1, sp[0].2.clone()));
        }
    }

    for (i, (_, _, ref sp)) in strips.iter().enumerate() {
        if !sel_set.contains(&i) { for p in sp { unassigned.push(p.clone()); } }
    }
    for p in unassigned {
        result.push(single_piece(p.0, p.1, p.2));
    }

    result.sort_by(|a, b| b.area.partial_cmp(&a.area).unwrap());
    result
}

pub fn group_strip_packing_dp_transposed(pieces: &[Piece], usable_w: f64, usable_h: f64, tolerance: f64) -> Vec<Piece> {
    if pieces.len() < 2 { return pieces.to_vec(); }

    let normalized: Vec<_> = pieces.iter().map(|p| {
        let nw = p.w.min(p.h);
        let nh = p.w.max(p.h);
        (nw, nh, p.label.clone())
    }).collect();

    let mut sorted = normalized.clone();
    sorted.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());

    let mut width_groups: Vec<Vec<(f64, f64, Option<String>)>> = Vec::new();
    if !sorted.is_empty() {
        let mut current = vec![sorted[0].clone()];
        for i in 1..sorted.len() {
            if sorted[i].0 - current[0].0 <= tolerance {
                current.push(sorted[i].clone());
            } else {
                width_groups.push(current.clone());
                current = vec![sorted[i].clone()];
            }
        }
        width_groups.push(current);
    }

    let mut strips: Vec<(f64, f64, Vec<(f64, f64, Option<String>)>)> = Vec::new(); // (width, total_h, pieces)
    let mut unassigned: Vec<(f64, f64, Option<String>)> = Vec::new();

    for group in width_groups {
        if group.len() < 2 { unassigned.extend(group); continue; }
        let strip_w = group.iter().map(|p| p.0).fold(f64::NEG_INFINITY, f64::max);
        let heights: Vec<f64> = group.iter().map(|p| p.1).collect();
        let selected = knapsack_select(&heights, usable_h);
        if selected.len() < 2 { unassigned.extend(group); continue; }
        let total_h: f64 = selected.iter().map(|&i| heights[i]).sum();
        let sel_pieces: Vec<_> = selected.iter().map(|&i| group[i].clone()).collect();
        let sel_set: std::collections::HashSet<usize> = selected.into_iter().collect();
        for (i, p) in group.iter().enumerate() {
            if !sel_set.contains(&i) { unassigned.push(p.clone()); }
        }
        strips.push((strip_w, total_h, sel_pieces));
    }

    if strips.is_empty() { return pieces.to_vec(); }

    let strip_widths: Vec<f64> = strips.iter().map(|s| s.0).collect();
    let selected_strips = knapsack_select(&strip_widths, usable_w);
    let sel_set: std::collections::HashSet<usize> = selected_strips.iter().cloned().collect();

    let mut result: Vec<Piece> = Vec::new();
    for &si in &selected_strips {
        let (sw, sh, ref sp) = strips[si];
        if sp.len() >= 2 {
            let labels: Vec<String> = sp.iter().filter_map(|p| p.2.clone()).collect();
            let dims: Vec<f64> = sp.iter().map(|p| p.1).collect();
            result.push(make_piece(sw, sh, None, sp.len(), if labels.is_empty() { None } else { Some(labels) }, "h", dims));
        } else {
            result.push(single_piece(sp[0].0, sp[0].1, sp[0].2.clone()));
        }
    }

    for (i, (_, _, ref sp)) in strips.iter().enumerate() {
        if !sel_set.contains(&i) { for p in sp { unassigned.push(p.clone()); } }
    }
    for p in unassigned { result.push(single_piece(p.0, p.1, p.2)); }

    result.sort_by(|a, b| b.area.partial_cmp(&a.area).unwrap());
    result
}

pub fn group_common_dimension_dp(pieces: &[Piece], usable_w: f64, _usable_h: f64, threshold: f64) -> Vec<Piece> {
    if pieces.len() < 2 { return pieces.to_vec(); }

    let mut dim_count: std::collections::HashMap<i64, usize> = std::collections::HashMap::new();
    for p in pieces {
        *dim_count.entry((p.w * 1000.0) as i64).or_default() += 1;
        if (p.h - p.w).abs() > 0.5 { *dim_count.entry((p.h * 1000.0) as i64).or_default() += 1; }
    }

    let (best_dim_key, best_count) = dim_count.iter().max_by_key(|(_, &v)| v).map(|(&k, &v)| (k, v)).unwrap_or((0, 0));
    let best_dim = best_dim_key as f64 / 1000.0;
    let min_count = (pieces.len() as f64 * threshold).floor().max(2.0) as usize;
    if best_count < min_count { return pieces.to_vec(); }

    let mut oriented: Vec<(f64, Option<String>)> = Vec::new();
    let mut others: Vec<Piece> = Vec::new();
    for p in pieces {
        if (p.h - best_dim).abs() < 0.5 { oriented.push((p.w, p.label.clone())); }
        else if (p.w - best_dim).abs() < 0.5 { oriented.push((p.h, p.label.clone())); }
        else { others.push(p.clone()); }
    }

    let widths: Vec<f64> = oriented.iter().map(|p| p.0).collect();
    let selected = knapsack_select(&widths, usable_w);
    if selected.len() < 2 { return pieces.to_vec(); }

    let sel_set: std::collections::HashSet<usize> = selected.iter().cloned().collect();
    let mut sel_pieces: Vec<(f64, Option<String>)> = selected.iter().map(|&i| oriented[i].clone()).collect();
    let unselected: Vec<(f64, Option<String>)> = oriented.iter().enumerate()
        .filter(|(i, _)| !sel_set.contains(i))
        .map(|(_, p)| p.clone())
        .collect();

    sel_pieces.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap());

    let mut rows: Vec<Vec<(f64, Option<String>)>> = Vec::new();
    let mut row_ws: Vec<f64> = Vec::new();

    for p in sel_pieces {
        let placed = rows.iter().enumerate().any(|(ri, _)| {
            if row_ws[ri] + p.0 <= usable_w {
                true
            } else { false }
        });
        let target = rows.iter().position(|_| true).filter(|&ri| row_ws[ri] + p.0 <= usable_w);
        if let Some(ri) = target {
            rows[ri].push(p.clone());
            row_ws[ri] += p.0;
        } else {
            rows.push(vec![p.clone()]);
            row_ws.push(p.0);
        }
    }

    let mut result: Vec<Piece> = Vec::new();
    for (r, &rw) in rows.iter().zip(row_ws.iter()) {
        if r.len() >= 2 {
            let labels: Vec<String> = r.iter().filter_map(|p| p.1.clone()).collect();
            let dims: Vec<f64> = r.iter().map(|p| p.0).collect();
            result.push(make_piece(rw, best_dim, None, r.len(), if labels.is_empty() { None } else { Some(labels) }, "w", dims));
        } else {
            result.push(single_piece(r[0].0, best_dim, r[0].1.clone()));
        }
    }

    for p in unselected { result.push(single_piece(p.0, best_dim, p.1)); }
    result.extend(others);
    result.sort_by(|a, b| b.area.partial_cmp(&a.area).unwrap());
    result
}

pub fn group_identical_pieces_2d(pieces: &[Piece], usable_w: f64, usable_h: f64) -> Vec<Piece> {
    if pieces.len() < 2 { return pieces.to_vec(); }

    let normalized: Vec<(f64, f64, Option<String>)> = pieces.iter().map(|p| {
        (p.w.max(p.h), p.w.min(p.h), p.label.clone())
    }).collect();

    let mut groups: std::collections::HashMap<(i64, i64), Vec<(f64, f64, Option<String>)>> =
        std::collections::HashMap::new();
    for (nw, nh, ref lbl) in &normalized {
        groups.entry(((*nw * 1000.0) as i64, (*nh * 1000.0) as i64))
              .or_default()
              .push((*nw, *nh, lbl.clone()));
    }

    let mut result: Vec<Piece> = Vec::new();

    for (_, group) in &groups {
        let pw = group[0].0;
        let ph = group[0].1;
        let mut remaining = group.clone();

        while remaining.len() >= 2 {
            let max_cols = (usable_w / pw).floor() as usize;
            let max_rows = (usable_h / ph).floor() as usize;
            let mut best_cols = 1usize;
            let mut best_rows = 1usize;
            let mut best_used = 1usize;
            let mut best_squareness = f64::INFINITY;

            for cols in 1..=max_cols {
                for rows in 1..=max_rows {
                    let used = cols * rows;
                    if used < 2 || used > remaining.len() { continue; }
                    let block_w = cols as f64 * pw;
                    let block_h = rows as f64 * ph;
                    let squareness = f64::max(block_w, block_h) / f64::min(block_w, block_h).max(0.001);
                    if used > best_used || (used == best_used && squareness < best_squareness) {
                        best_cols = cols;
                        best_rows = rows;
                        best_used = used;
                        best_squareness = squareness;
                    }
                }
            }

            if best_used < 2 {
                for p in &remaining { result.push(single_piece(pw, ph, p.2.clone())); }
                remaining.clear();
                break;
            }

            let taken: Vec<_> = remaining.drain(..best_used).collect();
            let labels: Vec<String> = taken.iter().filter_map(|p| p.2.clone()).collect();
            result.push(Piece {
                w: best_cols as f64 * pw,
                h: best_rows as f64 * ph,
                area: pw * ph,
                count: Some(best_used as u32),
                label: None,
                labels: if labels.is_empty() { None } else { Some(labels) },
                grouped_axis: Some("2d".to_string()),
                individual_dims: Some(vec![best_cols as f64, best_rows as f64]),
            });
        }

        for p in &remaining { result.push(single_piece(pw, ph, p.2.clone())); }
    }

    result.sort_by(|a, b| (b.w * b.h).partial_cmp(&(a.w * a.h)).unwrap_or(std::cmp::Ordering::Equal));
    result
}

pub fn apply_grouping(work: &[Piece], mode: u8, usable_w: f64, usable_h: f64) -> Vec<Piece> {
    match mode {
        1 => group_pieces_by_height(work),
        2 => group_pieces_by_width(work),
        3 => group_pieces_fill_row(work, usable_w, false),
        4 => group_pieces_fill_row(work, usable_w, true),
        5 => group_pieces_fill_col(work, usable_h, false),
        6 => group_pieces_fill_col(work, usable_h, true),
        7 => group_pieces_column_width(work, usable_w),
        8 => group_pieces_column_height(work, usable_h),
        9 => group_by_common_dimension(work, usable_w, usable_h, 0.4),
        10 => group_by_common_dimension_transposed(work, usable_w, usable_h, 0.4),
        11 => group_strip_packing_dp(work, usable_w, usable_h, 5.0, false),
        12 => group_strip_packing_dp_transposed(work, usable_w, usable_h, 5.0),
        13 => group_common_dimension_dp(work, usable_w, usable_h, 0.3),
        14 => group_strip_packing_dp(work, usable_w, usable_h, 100.0, false),
        _ => work.to_vec(),
    }
}
