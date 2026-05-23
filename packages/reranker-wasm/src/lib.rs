use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;
use wasm_math::cosine_similarity;

#[derive(Serialize, Deserialize)]
pub struct RankedResult {
    pub index: usize,
    pub score: f32,
    pub original_score: f32,
    pub combined_score: f32,
}

/// Combines raw cross-encoder scores with vector similarity scores using a
/// weighted blend, then sorts the results by combined score descending.
///
/// This runs in WASM after the Cloudflare Worker has already executed the
/// ONNX cross-encoder inference (via @huggingface/transformers) and produced
/// the raw logit scores.
#[wasm_bindgen]
pub fn combine_and_rank(
    cross_encoder_scores: &[f32],
    vector_scores: &[f32],
    cross_encoder_weight: f32,
    top_k: usize,
) -> Result<JsValue, JsValue> {
    if cross_encoder_scores.len() != vector_scores.len() {
        return Err(JsValue::from_str("Score arrays must have equal length"));
    }

    let n = cross_encoder_scores.len();
    let vector_weight = 1.0 - cross_encoder_weight;

    let mut results: Vec<RankedResult> = (0..n)
        .map(|i| {
            let combined = cross_encoder_weight * cross_encoder_scores[i]
                + vector_weight * vector_scores[i];
            RankedResult {
                index: i,
                score: combined,
                original_score: cross_encoder_scores[i],
                combined_score: combined,
            }
        })
        .collect();

    results.sort_by(|a, b| b.combined_score.partial_cmp(&a.combined_score).unwrap());
    results.truncate(top_k);

    serde_wasm_bindgen::to_value(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

/// Computes pairwise cosine similarities between a query embedding and a set
/// of candidate embeddings. Used for fast client-side similarity filtering
/// before sending candidates to the cross-encoder.
#[wasm_bindgen]
pub fn batch_cosine_similarity(
    query_embedding: &[f32],
    candidate_embeddings: &[f32],
    candidate_count: usize,
) -> Result<Vec<f32>, JsValue> {
    let dim = query_embedding.len();

    if candidate_embeddings.len() != candidate_count * dim {
        return Err(JsValue::from_str("Candidate embeddings length mismatch"));
    }

    let scores: Vec<f32> = (0..candidate_count)
        .map(|i| {
            let candidate = &candidate_embeddings[(i * dim)..((i + 1) * dim)];
            cosine_similarity(query_embedding, candidate)
        })
        .collect();

    Ok(scores)
}
