use crate::types::{Arena, Piece, OptimizationProgress, ROOT_ID};
use crate::tree_utils::calc_placed_area;
use crate::placement::run_placement;
use crate::normalization::normalize_tree;
use crate::post_processing::post_optimize_regroup;
use crate::optimizer::{optimize_v6_arena, cmp_by_strategy, NUM_SORT_STRATEGIES};
use crate::grouping::apply_grouping;

#[inline]
fn rand() -> f64 {
    js_sys::Math::random()
}

#[derive(Clone)]
struct GAIndividual {
    genome: Vec<usize>,
    rotations: Vec<bool>,
    grouping_mode: u8,
    transposed: bool,
    strip_mode: bool, // false = V, true = H
}

struct SimResult {
    fitness: f64,
    first_arena: Arena,
}

fn simulate_sheets(
    work_pieces: &[Piece],
    usable_w: f64,
    usable_h: f64,
    min_break: f64,
    max_sheets: usize,
    horizontal_strip: Option<(f64, f64)>,
) -> SimResult {
    let mut current_remaining: Vec<Piece> = work_pieces.to_vec();
    let mut total_util = 0.0f64;
    let mut first_arena: Option<Arena> = None;
    let mut sheets_simulated = 0usize;
    let sheet_area = usable_w * usable_h;

    let initial_large_area: f64 = work_pieces.iter()
        .filter(|p| p.count.map(|c| c == 1).unwrap_or(true))
        .filter(|p| (p.w * p.h) > sheet_area * 0.2)
        .map(|p| p.w * p.h)
        .sum();

    let initial_small_area: f64 = work_pieces.iter()
        .map(|p| p.area * p.count.unwrap_or(1) as f64)
        .sum::<f64>() - initial_large_area;

    let mut large_area_placed = 0.0f64;
    let mut small_area_placed = 0.0f64;
    let mut rejected_count = 0usize;
    let mut continuity_score = 0.0f64;

    for s in 0..max_sheets {
        if current_remaining.is_empty() { break; }

        let count_before = current_remaining.len();
        let strip_hint = if s == 0 { horizontal_strip } else { None };
        let res = run_placement(&current_remaining, usable_w, usable_h, min_break, strip_hint);

        if s == 0 { first_arena = Some(res.arena.clone()); }

        let placed_area = res.area;
        total_util += placed_area / sheet_area;

        let large_remaining: f64 = res.remaining.iter()
            .filter(|p| p.count.map(|c| c == 1).unwrap_or(true))
            .filter(|p| (p.w * p.h) > sheet_area * 0.2)
            .map(|p| p.w * p.h)
            .sum();

        let current_large_placed = (initial_large_area - large_area_placed - large_remaining).max(0.0);
        large_area_placed += current_large_placed;
        small_area_placed += (placed_area - current_large_placed).max(0.0);

        let root_children = res.arena.nodes[ROOT_ID as usize].children.clone();
        let used_w: f64 = root_children.iter()
            .map(|&id| {
                let n = res.arena.get(id);
                n.valor * n.multi as f64
            })
            .sum();
        let free_w = usable_w - used_w;
        if free_w > 50.0 { continuity_score += free_w / usable_w; }

        let pieces_placed = count_before - res.remaining.len();
        if pieces_placed == 0 { rejected_count += 1; break; }

        current_remaining = res.remaining;
        sheets_simulated += 1;
    }

    let mut fitness = if sheets_simulated > 0 { total_util / sheets_simulated as f64 } else { 0.0 };

    if initial_large_area > 0.0 {
        let large_ratio = large_area_placed / initial_large_area;
        let small_ratio = if initial_small_area > 0.0 { small_area_placed / initial_small_area } else { 1.0 };
        if small_ratio > large_ratio * 1.5 {
            fitness *= 0.8;
        } else {
            fitness += large_ratio * 0.1;
        }
    }

    fitness -= rejected_count as f64 * 0.05;
    fitness += (continuity_score * 0.01) / (sheets_simulated as f64).max(1.0);

    SimResult {
        fitness: fitness.max(0.0),
        first_arena: first_arena.unwrap_or_else(|| Arena::new_root(usable_w)),
    }
}

fn build_pieces(
    ind: &GAIndividual,
    pieces: &[Piece],
    usable_w: f64,
    usable_h: f64,
) -> Vec<Piece> {
    let mut work: Vec<Piece> = ind.genome.iter().map(|&idx| pieces[idx].clone()).collect();

    for i in 0..work.len() {
        if ind.rotations[i] {
            let (w, h) = (work[i].w, work[i].h);
            work[i].w = h;
            work[i].h = w;
        }
    }

    let ew = if ind.transposed { usable_h } else { usable_w };
    let eh = if ind.transposed { usable_w } else { usable_h };
    apply_grouping(&work, ind.grouping_mode, ew, eh)
}

fn get_horizontal_strip_hint(ind: &GAIndividual, work: &[Piece], ew: f64, eh: f64) -> Option<(f64, f64)> {
    if !ind.strip_mode { return None; }
    if work.is_empty() { return None; }
    let p = &work[0];
    if p.h <= eh && p.w <= ew {
        Some((p.w, p.h))
    } else {
        None
    }
}

fn random_individual(num_pieces: usize) -> GAIndividual {
    let mut genome: Vec<usize> = (0..num_pieces).collect();
    for i in (1..genome.len()).rev() {
        let j = (rand() * (i + 1) as f64) as usize;
        genome.swap(i, j);
    }
    GAIndividual {
        genome,
        rotations: (0..num_pieces).map(|_| rand() > 0.5).collect(),
        grouping_mode: (rand() * 15.0) as u8,
        transposed: rand() > 0.5,
        strip_mode: rand() > 0.5,
    }
}

fn tournament<'a>(pop: &'a [(GAIndividual, f64)]) -> &'a GAIndividual {
    const K: usize = 4;
    let mut best_idx = (rand() * pop.len() as f64) as usize % pop.len();
    for _ in 1..K {
        let idx = (rand() * pop.len() as f64) as usize % pop.len();
        if pop[idx].1 > pop[best_idx].1 { best_idx = idx; }
    }
    &pop[best_idx].0
}

fn crossover(pa: &GAIndividual, pb: &GAIndividual) -> GAIndividual {
    let size = pa.genome.len();
    if size == 0 {
        return pa.clone();
    }
    let start = (rand() * size as f64) as usize;
    let end = start + (rand() * (size - start) as f64) as usize;

    let mut child_genome = vec![usize::MAX; size];
    for i in start..=end.min(size - 1) {
        child_genome[i] = pa.genome[i];
    }

    let mut cur = 0;
    for i in 0..size {
        let gene = pb.genome[i];
        if !child_genome.contains(&gene) {
            while child_genome[cur] != usize::MAX { cur += 1; }
            child_genome[cur] = gene;
        }
    }

    let child_rotations: Vec<bool> = pa.rotations.iter().zip(pb.rotations.iter())
        .map(|(&ra, &rb)| if rand() > 0.5 { ra } else { rb })
        .collect();
    let child_grouping = if rand() > 0.5 { pa.grouping_mode } else { pb.grouping_mode };

    GAIndividual {
        genome: child_genome,
        rotations: child_rotations,
        grouping_mode: child_grouping,
        transposed: if rand() > 0.5 { pa.transposed } else { pb.transposed },
        strip_mode: if rand() > 0.5 { pa.strip_mode } else { pb.strip_mode },
    }
}

fn mutate(ind: &GAIndividual) -> GAIndividual {
    let mut c = ind.clone();
    let r = rand();
    if r < 0.20 {
        if c.genome.len() > 2 {
            let a = 1 + (rand() * (c.genome.len() - 1) as f64) as usize % (c.genome.len() - 1);
            let b = 1 + (rand() * (c.genome.len() - 1) as f64) as usize % (c.genome.len() - 1);
            c.genome.swap(a, b);
        }
    } else if r < 0.40 {
        if c.genome.len() > 4 {
            let tail: Vec<usize> = c.genome[1..].to_vec();
            let block_size = ((rand() * (5.0f64.min(tail.len() as f64 / 2.0))) as usize + 2).min(tail.len());
            let max_start = tail.len().saturating_sub(block_size);
            let start = if max_start > 0 { (rand() * max_start as f64) as usize } else { 0 };
            let mut new_tail = tail.clone();
            let segment: Vec<usize> = new_tail.drain(start..start + block_size).collect();
            let target = if new_tail.is_empty() { 0 } else { (rand() * new_tail.len() as f64) as usize };
            for (i, v) in segment.into_iter().enumerate() { new_tail.insert(target + i, v); }
            c.genome = std::iter::once(c.genome[0]).chain(new_tail).collect();
        }
    } else if r < 0.55 {
        let count = ((c.rotations.len() as f64 * 0.1) as usize).max(1);
        for _ in 0..count {
            let idx = (rand() * c.rotations.len() as f64) as usize % c.rotations.len();
            c.rotations[idx] = !c.rotations[idx];
        }
    } else if r < 0.70 {
        c.grouping_mode = (rand() * 15.0) as u8;
    } else if r < 0.82 {
        c.transposed = !c.transposed;
    } else {
        c.strip_mode = !c.strip_mode;
    }
    c
}

fn genome_key(ind: &GAIndividual) -> String {
    let g: Vec<String> = ind.genome.iter().map(|x| x.to_string()).collect();
    format!("{},{},{},{}", g.join(","), ind.grouping_mode, ind.strip_mode as u8, ind.transposed as u8)
}

pub fn optimize_genetic(
    pieces: &[Piece],
    usable_w: f64,
    usable_h: f64,
    min_break: f64,
    pop_size: u32,
    generations: u32,
    on_progress: Option<&dyn Fn(OptimizationProgress)>,
) -> Arena {
    let population_size = (pop_size as usize).max(10);
    let generations = generations as usize;
    let elite_count = ((population_size as f64 * 0.1) as usize).max(2);
    let num_pieces = pieces.len();

    if pieces.is_empty() {
        return Arena::new_root(usable_w);
    }

    // Estimate sheets for lookahead
    let total_piece_area: f64 = pieces.iter()
        .map(|p| (p.area) * p.count.unwrap_or(1) as f64)
        .sum();
    let estimated_sheets = (60usize).min((5usize).max((total_piece_area / (usable_w * usable_h * 0.65)).ceil() as usize));

    // --- Seeding ---
    let mut initial_pop: Vec<GAIndividual> = Vec::new();
    for si in 0..NUM_SORT_STRATEGIES {
        let mut sorted_indices: Vec<usize> = (0..num_pieces).collect();
        sorted_indices.sort_by(|&a, &b| {
            cmp_by_strategy(&pieces[a], &pieces[b], si)
        });

        // Move largest-area piece to front
        let best_pos = sorted_indices.iter().enumerate()
            .max_by(|&(_, &a), &(_, &b)| pieces[a].area.partial_cmp(&pieces[b].area).unwrap_or(std::cmp::Ordering::Equal))
            .map(|(i, _)| i)
            .unwrap_or(0);
        if best_pos > 0 {
            let tmp = sorted_indices.remove(best_pos);
            sorted_indices.insert(0, tmp);
        }

        let rotating_mode = (1u8 + (si as u8 % 14u8)) as u8;
        let rotations_false = vec![false; num_pieces];

        initial_pop.push(GAIndividual { genome: sorted_indices.clone(), rotations: rotations_false.clone(), grouping_mode: 0, transposed: false, strip_mode: false });
        initial_pop.push(GAIndividual { genome: sorted_indices.clone(), rotations: rotations_false.clone(), grouping_mode: 0, transposed: false, strip_mode: true });
        initial_pop.push(GAIndividual { genome: sorted_indices.clone(), rotations: rotations_false.clone(), grouping_mode: rotating_mode, transposed: false, strip_mode: false });
        initial_pop.push(GAIndividual { genome: sorted_indices.clone(), rotations: rotations_false.clone(), grouping_mode: rotating_mode, transposed: true, strip_mode: false });
    }

    initial_pop.truncate(population_size);
    while initial_pop.len() < population_size {
        initial_pop.push(random_individual(num_pieces));
    }

    // --- V6 heuristic baseline ---
    if let Some(cb) = on_progress {
        cb(OptimizationProgress { phase: "Rodando heurísticas V6...".into(), current: 0, total: generations.max(1) as u32, best_util: None });
    }

    let (v6_arena, _) = optimize_v6_arena(pieces, usable_w, usable_h, min_break, true);
    let v6_util = calc_placed_area(&v6_arena) / (usable_w * usable_h);
    let (v6t_arena, _) = optimize_v6_arena(pieces, usable_h, usable_w, min_break, true);
    let v6t_util = calc_placed_area(&v6t_arena) / (usable_w * usable_h);

    let (mut best_arena, mut best_fitness, mut best_transposed) = if v6_util >= v6t_util {
        (v6_arena, v6_util, false)
    } else {
        (v6t_arena, v6t_util, true)
    };

    if best_transposed {
        best_arena.get_mut(ROOT_ID).transposed = true;
        best_arena = normalize_tree(best_arena, usable_w, usable_h, min_break);
        best_transposed = false;
    }

    if generations == 0 {
        if let Some(cb) = on_progress {
            cb(OptimizationProgress { phase: "Apenas Heurísticas (sem evolução)".into(), current: 1, total: 1, best_util: Some(best_fitness * 100.0) });
        }
        // Post-optimize
        if let Some(cb) = on_progress {
            cb(OptimizationProgress { phase: "Pós-análise de reagrupamento...".into(), current: 1, total: 1, best_util: Some(best_fitness * 100.0) });
        }
        let original_area = best_fitness * usable_w * usable_h;
        let (post_arena, post_area, improved) = post_optimize_regroup(&best_arena, original_area, pieces, usable_w, usable_h, min_break);
        if improved {
            if let Some(cb) = on_progress {
                let util = post_area / (usable_w * usable_h) * 100.0;
                cb(OptimizationProgress { phase: "Pós-análise: layout melhorado!".into(), current: 1, total: 1, best_util: Some(util) });
            }
            return post_arena;
        }
        return best_arena;
    }

    if let Some(cb) = on_progress {
        cb(OptimizationProgress { phase: "Semeando População...".into(), current: 0, total: generations as u32, best_util: Some(best_fitness * 100.0) });
    }

    let total_evals = generations * population_size;
    let mut population: Vec<GAIndividual> = initial_pop;

    for g in 0..generations {
        let adaptive_mutation = 0.25 - (g as f64 / (generations - 1).max(1) as f64) * 0.20;

        let mut evaluated: Vec<(GAIndividual, Arena, f64)> = Vec::with_capacity(population.len());
        for (i, ind) in population.iter().enumerate() {
            let work = build_pieces(ind, pieces, usable_w, usable_h);
            let ew = if ind.transposed { usable_h } else { usable_w };
            let eh = if ind.transposed { usable_w } else { usable_h };
            let h_hint = get_horizontal_strip_hint(ind, &work, ew, eh);
            let res = simulate_sheets(&work, ew, eh, min_break, estimated_sheets, h_hint);
            let fitness = res.fitness;
            evaluated.push((ind.clone(), res.first_arena, fitness));

            if let Some(cb) = on_progress {
                cb(OptimizationProgress {
                    phase: format!("Evolução Gen {}/{} · Pop {}/{}", g + 1, generations, i + 1, population_size),
                    current: (g * population_size + i + 1) as u32,
                    total: total_evals as u32,
                    best_util: Some(best_fitness * 100.0),
                });
            }
        }

        evaluated.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap_or(std::cmp::Ordering::Equal));

        if evaluated[0].2 > best_fitness {
            best_fitness = evaluated[0].2;
            best_arena = evaluated[0].1.clone();
            best_transposed = evaluated[0].0.transposed;
        }

        // Build next generation
        let pop_fitness: Vec<(GAIndividual, f64)> = evaluated.iter().map(|(ind, _, f)| (ind.clone(), *f)).collect();
        let mut next_pop: Vec<GAIndividual> = evaluated.into_iter().take(elite_count).map(|(ind, _, _)| ind).collect();
        let mut seen: std::collections::HashSet<String> = next_pop.iter().map(genome_key).collect();

        while next_pop.len() < population_size {
            let pa = tournament(&pop_fitness);
            let pb = tournament(&pop_fitness);
            let mut child = crossover(pa, pb);
            if rand() < adaptive_mutation { child = mutate(&child); }

            let key = genome_key(&child);
            if !seen.contains(&key) {
                seen.insert(key);
                next_pop.push(child);
            } else if rand() < 0.2 {
                next_pop.push(random_individual(num_pieces));
            }
        }
        population = next_pop;
    }

    if best_transposed {
        best_arena.get_mut(ROOT_ID).transposed = true;
        best_arena = normalize_tree(best_arena, usable_w, usable_h, min_break);
    }

    if let Some(cb) = on_progress {
        cb(OptimizationProgress { phase: "Pós-análise de reagrupamento...".into(), current: generations as u32, total: generations as u32, best_util: Some(best_fitness * 100.0) });
    }

    let original_area = best_fitness * usable_w * usable_h;
    let (post_arena, post_area, improved) = post_optimize_regroup(&best_arena, original_area, pieces, usable_w, usable_h, min_break);
    if improved {
        if let Some(cb) = on_progress {
            let util = post_area / (usable_w * usable_h) * 100.0;
            cb(OptimizationProgress { phase: "Pós-análise: layout melhorado!".into(), current: generations as u32, total: generations as u32, best_util: Some(util) });
        }
        return post_arena;
    }

    best_arena
}
