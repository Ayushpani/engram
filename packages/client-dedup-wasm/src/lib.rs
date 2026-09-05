use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;
use wasm_math::cosine_similarity;

#[derive(Serialize, Deserialize)]
pub struct DedupResult {
    pub is_duplicate: bool,
    pub most_similar_index: Option<usize>,
    pub similarity: f32,
}

/// Checks whether a new embedding is a semantic duplicate of any previously
/// cached embeddings. Embeddings are provided as flat f32 arrays (row-major).
///
/// This runs entirely in WASM on the client side. Embedding generation itself
/// is handled server-side by the Smaran API before calling this function.
#[wasm_bindgen]
pub fn is_duplicate(
    new_embedding: &[f32],
    cached_embeddings: &[f32],
    cached_count: usize,
    threshold: f32,
) -> Result<JsValue, JsValue> {
    let dimensions = new_embedding.len();

    if cached_embeddings.len() != cached_count * dimensions {
        return Err(JsValue::from_str("Cached embeddings length mismatch"));
    }

    let mut max_sim = 0.0;
    let mut max_idx = None;

    for i in 0..cached_count {
        let cached_vec = &cached_embeddings[(i * dimensions)..((i + 1) * dimensions)];
        let sim = cosine_similarity(new_embedding, cached_vec);

        if sim > max_sim {
            max_sim = sim;
            max_idx = Some(i);
        }
    }

    let result = DedupResult {
        is_duplicate: max_sim >= threshold,
        most_similar_index: max_idx,
        similarity: max_sim,
    };

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

/// Batch cosine similarity: returns a similarity score for each cached
/// embedding against the query embedding.
#[wasm_bindgen]
pub fn batch_similarity(
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
