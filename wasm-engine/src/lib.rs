mod types;
mod tree_utils;
mod scoring;
mod placement;
mod void_filling;
mod post_processing;
mod normalization;
mod grouping;
mod optimizer;
mod genetic;

use wasm_bindgen::prelude::*;
use types::{Piece, OptimizationProgress, ROOT_ID};
use optimizer::optimize_v6;
use genetic::optimize_genetic;

/// Synchronous V6 heuristic optimizer. Returns JSON: { tree: TreeNodeJson, remaining: Piece[] }
#[wasm_bindgen]
pub fn wasm_optimize_v6(
    pieces_json: &str,
    usable_w: f64,
    usable_h: f64,
    min_break: f64,
) -> String {
    let pieces: Vec<Piece> = serde_json::from_str(pieces_json).unwrap_or_default();
    let result = optimize_v6(&pieces, usable_w, usable_h, min_break, true);
    serde_json::to_string(&result).unwrap_or_default()
}

/// Genetic algorithm optimizer. Returns JSON TreeNodeJson of the best layout.
/// on_progress: optional JS callback receiving JSON-serialized OptimizationProgress strings.
#[wasm_bindgen]
pub fn wasm_optimize_genetic(
    pieces_json: &str,
    usable_w: f64,
    usable_h: f64,
    min_break: f64,
    pop_size: u32,
    generations: u32,
    on_progress: Option<js_sys::Function>,
) -> String {
    let pieces: Vec<Piece> = serde_json::from_str(pieces_json).unwrap_or_default();

    let progress_fn: Option<Box<dyn Fn(OptimizationProgress)>> = on_progress.map(|js_fn| {
        Box::new(move |p: OptimizationProgress| {
            let json = serde_json::to_string(&p).unwrap_or_default();
            let _ = js_fn.call1(&JsValue::NULL, &JsValue::from_str(&json));
        }) as Box<dyn Fn(OptimizationProgress)>
    });

    let arena = optimize_genetic(
        &pieces,
        usable_w,
        usable_h,
        min_break,
        pop_size,
        generations,
        progress_fn.as_deref(),
    );

    let tree_json = arena.to_json_node(ROOT_ID);
    serde_json::to_string(&tree_json).unwrap_or_default()
}
