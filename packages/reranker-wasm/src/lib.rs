use std::sync::Mutex;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;
use tract_onnx::prelude::*;
use tokenizers::Tokenizer;
use wasm_math::sigmoid;

#[derive(Serialize, Deserialize)]
pub struct RankedResult {
    pub id: String,
    pub semantic_score: f32,
    pub final_score: f32,
    pub original_rank: usize,
}

#[derive(Serialize, Deserialize)]
pub struct CandidateWithMetadata {
    pub text: String,
    pub id: String,
    pub created_at_ts: f64,       // Unix timestamp in seconds
    pub last_accessed_ts: f64,    // Unix timestamp in seconds
    pub is_core_profile: bool,
    pub relation_count: u32,
}

#[derive(Serialize, Deserialize)]
pub struct AgenticConfig {
    pub semantic_weight: f32,
    pub recency_weight: f32,
    pub profile_weight: f32,
    pub centrality_weight: f32,
    pub recency_half_life_hours: f64,
}

impl Default for AgenticConfig {
    fn default() -> Self {
        Self {
            semantic_weight: 0.85,
            recency_weight: 0.05,
            profile_weight: 0.07,
            centrality_weight: 0.03,
            recency_half_life_hours: 168.0,
        }
    }
}

struct RerankerState {
    model: SimplePlan<TypedFact, Box<dyn TypedOp>, Graph<TypedFact, Box<dyn TypedOp>>>,
    tokenizer: Tokenizer,
}

// Global static state to cache the model & tokenizer in warm isolates
static STATE: Mutex<Option<RerankerState>> = Mutex::new(None);

#[wasm_bindgen]
pub fn init_reranker(model_bytes: &[u8], tokenizer_bytes: &[u8]) -> Result<(), JsValue> {
    let mut state = STATE.lock().map_err(|_| JsValue::from_str("Failed to lock state Mutex"))?;
    
    if state.is_some() {
        return Ok(()); // Already initialized
    }
    
    // 1. Initialize tokenizer
    let tokenizer = Tokenizer::from_bytes(tokenizer_bytes)
        .map_err(|e| JsValue::from_str(&format!("Failed to load tokenizer: {}", e)))?;
        
    // 2. Parse, optimize, and build tract ONNX inference plan
    let model = tract_onnx::onnx()
        .model_for_read(&mut &model_bytes[..])
        .map_err(|e| JsValue::from_str(&format!("ONNX model parse error: {}", e)))?
        .into_optimized()
        .map_err(|e| JsValue::from_str(&format!("Model optimization error: {}", e)))?
        .into_runnable()
        .map_err(|e| JsValue::from_str(&format!("Model compile error: {}", e)))?;
        
    *state = Some(RerankerState { model, tokenizer });
    Ok(())
}

fn compute_semantic_score(state: &RerankerState, query: &str, candidate_text: &str) -> Result<f32, String> {
    // Encode pair: [CLS] query [SEP] candidate [SEP]
    let encoding = state.tokenizer.encode((query.to_string(), candidate_text.to_string()), true)
        .map_err(|e| format!("Tokenization error: {}", e))?;
        
    let input_ids: Vec<i64> = encoding.get_ids().iter().map(|&x| x as i64).collect();
    let attention_mask: Vec<i64> = encoding.get_attention_mask().iter().map(|&x| x as i64).collect();
    let token_type_ids: Vec<i64> = encoding.get_type_ids().iter().map(|&x| x as i64).collect();
    
    // Truncate to 128 tokens
    let max_len = 128;
    let seq_len = input_ids.len().min(max_len);
    
    let input_ids_tensor = Tensor::from_shape(&[1, seq_len], &input_ids[..seq_len])
        .map_err(|e| format!("Tensor conversion error: {}", e))?;
    let attention_mask_tensor = Tensor::from_shape(&[1, seq_len], &attention_mask[..seq_len])
        .map_err(|e| format!("Tensor conversion error: {}", e))?;
    let token_type_ids_tensor = Tensor::from_shape(&[1, seq_len], &token_type_ids[..seq_len])
        .map_err(|e| format!("Tensor conversion error: {}", e))?;
        
    let outputs = state.model.run(tvec![
        input_ids_tensor.into(),
        attention_mask_tensor.into(),
        token_type_ids_tensor.into()
    ]).map_err(|e| format!("Inference execution error: {}", e))?;
    
    let logits = outputs[0].to_array_view::<f32>()
        .map_err(|e| format!("Failed to read logits array: {}", e))?;
        
    Ok(sigmoid(logits[0]))
}

#[wasm_bindgen]
pub fn rerank(query: &str, candidates_json: &str, top_k: usize) -> Result<JsValue, JsValue> {
    let state_lock = STATE.lock().map_err(|_| JsValue::from_str("Failed to lock state Mutex"))?;
    let state = state_lock.as_ref().ok_or_else(|| JsValue::from_str("Reranker state not initialized"))?;
    
    let candidates: Vec<String> = serde_json::from_str(candidates_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse candidates: {}", e)))?;
        
    let mut results = Vec::with_capacity(candidates.len());
    
    for (i, candidate_text) in candidates.iter().enumerate() {
        let prob = compute_semantic_score(state, query, candidate_text)
            .map_err(|e| JsValue::from_str(&e))?;
            
        results.push(RankedResult {
            id: i.to_string(),
            semantic_score: prob,
            final_score: prob,
            original_rank: i,
        });
    }
    
    results.sort_by(|a, b| b.final_score.partial_cmp(&a.final_score).unwrap_or(std::cmp::Ordering::Equal));
    results.truncate(top_k);
    
    serde_wasm_bindgen::to_value(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

#[wasm_bindgen]
pub fn rerank_agentic(
    query: &str, 
    candidates_json: &str, 
    top_k: usize, 
    config_json: &str,
    current_ts: f64
) -> Result<JsValue, JsValue> {
    let state_lock = STATE.lock().map_err(|_| JsValue::from_str("Failed to lock state Mutex"))?;
    let state = state_lock.as_ref().ok_or_else(|| JsValue::from_str("Reranker state not initialized"))?;
    
    let candidates: Vec<CandidateWithMetadata> = serde_json::from_str(candidates_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse candidates: {}", e)))?;
        
    let config: AgenticConfig = if config_json.trim().is_empty() {
        AgenticConfig::default()
    } else {
        serde_json::from_str(config_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse config: {}", e)))?
    };
        
    let mut results = Vec::with_capacity(candidates.len());
    
    for (i, candidate) in candidates.iter().enumerate() {
        let prob = compute_semantic_score(state, query, &candidate.text)
            .map_err(|e| JsValue::from_str(&e))?;
            
        let age_hours = ((current_ts - candidate.created_at_ts) / 3600.0).max(0.0);
        
        // Exponential decay for recency
        let recency_score = (-std::f64::consts::LN_2 * age_hours / config.recency_half_life_hours).exp() as f32;
        
        let profile_score = if candidate.is_core_profile { 1.0 } else { 0.0 };
        
        let centrality_score = (candidate.relation_count as f32 / 10.0).min(1.0);
        
        let final_score = 
            (config.semantic_weight * prob) +
            (config.recency_weight * recency_score) +
            (config.profile_weight * profile_score) +
            (config.centrality_weight * centrality_score);
            
        results.push(RankedResult {
            id: candidate.id.clone(),
            semantic_score: prob,
            final_score,
            original_rank: i,
        });
    }
    
    results.sort_by(|a, b| b.final_score.partial_cmp(&a.final_score).unwrap_or(std::cmp::Ordering::Equal));
    results.truncate(top_k);
    
    serde_wasm_bindgen::to_value(&results)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}
