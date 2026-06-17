use crate::types::{Arena, Piece, OptimizationProgress, ROOT_ID, NodeType};
use std::collections::HashMap;
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
    let mut first_sheet_util = 0.0f64;
    let mut sheets_simulated = 0usize;
    let sheet_area = usable_w * usable_h;

    let initial_large_area: f64 = work_pieces.iter()
        .filter(|p| p.count.map(|c| c == 1).unwrap_or(true))
        .filter(|p| (p.w * p.h) > sheet_area * 0.2)
        .map(|p| p.w * p.h)
        .sum();

    let mut large_area_placed = 0.0f64;
    let mut rejected_count = 0usize;

    for s in 0..max_sheets {
        if current_remaining.is_empty() { break; }

        let count_before = current_remaining.len();
        let strip_hint = if s == 0 { horizontal_strip } else { None };
        let res = run_placement(&current_remaining, usable_w, usable_h, min_break, strip_hint);

        // IMPORTANTE: res.area do run_placement é uma medida incremental NÃO confiável
        // (pode vir negativa ou inflada — os passos de pós-processamento somam deltas que
        // não batem com as folhas reais da árvore). Usamos calc_placed_area, a área
        // geométrica verdadeira — a mesma fonte de verdade que runAllSheets usa (Index.tsx:401).
        // Espelha a correção de src/lib/engine/genetic.ts (Causa 1 do benchmark GA).
        let placed_area = calc_placed_area(&res.arena);
        if s == 0 {
            first_arena = Some(res.arena.clone());
            first_sheet_util = placed_area / sheet_area;
        }
        total_util += placed_area / sheet_area;

        let large_remaining: f64 = res.remaining.iter()
            .filter(|p| p.count.map(|c| c == 1).unwrap_or(true))
            .filter(|p| (p.w * p.h) > sheet_area * 0.2)
            .map(|p| p.w * p.h)
            .sum();

        let current_large_placed = (initial_large_area - large_area_placed - large_remaining).max(0.0);
        large_area_placed += current_large_placed;

        let pieces_placed = count_before - res.remaining.len();
        if pieces_placed == 0 { rejected_count += 1; break; }

        current_remaining = res.remaining;
        sheets_simulated += 1;
    }

    // O objetivo REAL do loop multi-chapa é MINIMIZAR o total de chapas, o que equivale
    // a MAXIMIZAR o aproveitamento médio sobre as chapas necessárias. avg_util (com
    // lookahead = estimated_sheets) é o termo PRIMÁRIO; os demais são desempates fracos.
    // Crucial: avg_util agora deriva de calc_placed_area (área honesta), não de res.area.
    // Espelha src/lib/engine/genetic.ts.
    let avg_util = if sheets_simulated > 0 { total_util / sheets_simulated as f64 } else { 0.0 };
    let mut fitness = avg_util;

    // Desempate: leve incentivo a alocar peças grandes cedo (reduz fragmentação).
    if initial_large_area > 0.0 {
        fitness += 0.001 * (large_area_placed / initial_large_area);
    }

    // Desempate fraco a favor de 1ª chapas mais cheias (entre médias equivalentes).
    fitness += 0.0001 * first_sheet_util;

    // Penalidade real: ordenação degenerada que não coloca nenhuma peça numa chapa.
    fitness -= 0.01 * rejected_count as f64;
    // Removido o bônus de continuity_score: premiava largura SOBRANDO (anti-objetivo).

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

/// Causa 2 (inflação de dimensão fantasma): espelha capPhantomLeaves de
/// src/lib/engine/genetic.ts. Usa o mapa label→(w,h) real das peças de entrada e
/// insere o nó de corte que falta (W sob Z, Q sob W, R sob Q) — ou encolhe Q.valor
/// para folhas R — quando a dimensão herdada do contêiner excede a real da peça.
/// Coleta as correções numa passada só-leitura e aplica em seguida (borrow checker).
fn cap_phantom_leaves(arena: &mut Arena, label_dims: &HashMap<String, (f64, f64)>) {
    const TOL: f64 = 1.0;

    fn real_other(label_dims: &HashMap<String, (f64, f64)>, label: &str, known: f64) -> Option<f64> {
        let d = label_dims.get(label)?;
        if (d.0 - known).abs() <= TOL {
            Some(d.1)
        } else if (d.1 - known).abs() <= TOL {
            Some(d.0)
        } else {
            None
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn walk(
        arena: &Arena,
        id: u32,
        y_v: f64,
        z_v: f64,
        w_v: f64,
        q_id: Option<u32>,
        label_dims: &HashMap<String, (f64, f64)>,
        adds: &mut Vec<(u32, NodeType, f64, Option<String>)>,
        q_reductions: &mut Vec<(u32, f64)>,
    ) {
        let node = arena.get(id);
        let tipo = node.tipo.clone();
        let valor = node.valor;
        let multi = node.multi;
        let label_opt = node.label.clone();
        let children = node.children.clone();

        if children.is_empty() {
            if let Some(label) = label_opt {
                if multi == 1 {
                    match tipo {
                        NodeType::Z => {
                            if let Some(real_h) = real_other(label_dims, &label, valor) {
                                if y_v - real_h > TOL { adds.push((id, NodeType::W, real_h, Some(label))); }
                            }
                        }
                        NodeType::W => {
                            if let Some(real_w) = real_other(label_dims, &label, valor) {
                                if z_v - real_w > TOL { adds.push((id, NodeType::Q, real_w, Some(label))); }
                            }
                        }
                        NodeType::Q => {
                            if let Some(real_h) = real_other(label_dims, &label, valor) {
                                if w_v - real_h > TOL { adds.push((id, NodeType::R, real_h, Some(label))); }
                            }
                        }
                        NodeType::R => {
                            if let Some(qid) = q_id {
                                let qnode = arena.get(qid);
                                if qnode.children.len() == 1 {
                                    if let Some(real_w) = real_other(label_dims, &label, valor) {
                                        if qnode.valor - real_w > TOL { q_reductions.push((qid, real_w)); }
                                    }
                                }
                            }
                        }
                        _ => {}
                    }
                }
            }
            return;
        }

        // Q com vários filhos R uniformes: encolher Q.valor para a largura real comum.
        if tipo == NodeType::Q {
            let all_r_leaves = children.iter().all(|&c| {
                let cn = arena.get(c);
                cn.tipo == NodeType::R && cn.children.is_empty() && cn.label.is_some() && cn.multi == 1
            });
            if all_r_leaves {
                let mut w0: Option<f64> = None;
                let mut uniform = true;
                for &c in &children {
                    let cn = arena.get(c);
                    let lbl = cn.label.as_ref().unwrap();
                    match real_other(label_dims, lbl, cn.valor) {
                        Some(rw) => match w0 {
                            None => w0 = Some(rw),
                            Some(prev) => if (prev - rw).abs() > TOL { uniform = false; break; },
                        },
                        None => { uniform = false; break; }
                    }
                }
                if uniform {
                    if let Some(rw) = w0 {
                        if valor - rw > TOL { q_reductions.push((id, rw)); }
                    }
                }
            }
        }

        for &c in &children {
            walk(
                arena,
                c,
                if tipo == NodeType::Y { valor } else { y_v },
                if tipo == NodeType::Z { valor } else { z_v },
                if tipo == NodeType::W { valor } else { w_v },
                if tipo == NodeType::Q { Some(id) } else { q_id },
                label_dims,
                adds,
                q_reductions,
            );
        }
    }

    let mut adds: Vec<(u32, NodeType, f64, Option<String>)> = Vec::new();
    let mut q_reductions: Vec<(u32, f64)> = Vec::new();

    let root_children = arena.get(ROOT_ID).children.clone();
    for c in root_children {
        walk(arena, c, 0.0, 0.0, 0.0, None, label_dims, &mut adds, &mut q_reductions);
    }

    for (parent, tipo, valor, label) in adds {
        let id = arena.add_child(parent, tipo, valor, 1);
        arena.get_mut(id).label = label;
    }
    for (qid, new_valor) in q_reductions {
        arena.get_mut(qid).valor = new_valor;
    }
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

    // Mapa label→(w,h) real das peças de entrada, para corrigir folhas fantasma
    // (ver cap_phantom_leaves). Espelha src/lib/engine/genetic.ts.
    let mut label_dims: HashMap<String, (f64, f64)> = HashMap::new();
    for p in pieces {
        if let Some(l) = &p.label { label_dims.insert(l.clone(), (p.w, p.h)); }
        if let Some(ls) = &p.labels { for l in ls { label_dims.insert(l.clone(), (p.w, p.h)); } }
    }

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
            let mut post_arena = post_arena;
            cap_phantom_leaves(&mut post_arena, &label_dims);
            return post_arena;
        }
        cap_phantom_leaves(&mut best_arena, &label_dims);
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

    // Cap fantasma na árvore CRUA antes da normalização (que "assa" a inflação).
    cap_phantom_leaves(&mut best_arena, &label_dims);

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
        let mut post_arena = post_arena;
        cap_phantom_leaves(&mut post_arena, &label_dims);
        return post_arena;
    }

    cap_phantom_leaves(&mut best_arena, &label_dims);
    best_arena
}
