use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use wasm_bindgen::prelude::*;
use tract_onnx::prelude::*;
use tokenizers::Tokenizer;
use wasm_math::cosine_similarity;

#[derive(Serialize, Deserialize)]
pub struct DedupResult {
    pub is_duplicate: bool,
    pub most_similar_index: Option<usize>,
    pub similarity: f32,
}

struct EmbedderState {
    model: SimplePlan<TypedFact, Box<dyn TypedOp>, Graph<TypedFact, Box<dyn TypedOp>>>,
    tokenizer: Tokenizer,
}

static STATE: Mutex<Option<EmbedderState>> = Mutex::new(None);

#[wasm_bindgen]
pub fn init_embedder(model_bytes: &[u8], tokenizer_bytes: &[u8]) -> Result<(), JsValue> {
    let mut state = STATE.lock().map_err(|_| JsValue::from_str("Failed to lock state Mutex"))?;
    
    if state.is_some() {
        return Ok(());
    }
    
    let tokenizer = Tokenizer::from_bytes(tokenizer_bytes)
        .map_err(|e| JsValue::from_str(&format!("Failed to load tokenizer: {}", e)))?;
        
    let model = tract_onnx::onnx()
        .model_for_read(&mut &model_bytes[..])
        .map_err(|e| JsValue::from_str(&format!("ONNX model parse error: {}", e)))?
        .into_optimized()
        .map_err(|e| JsValue::from_str(&format!("Model optimization error: {}", e)))?
        .into_runnable()
        .map_err(|e| JsValue::from_str(&format!("Model compile error: {}", e)))?;
        
    *state = Some(EmbedderState { model, tokenizer });
    Ok(())
}

#[wasm_bindgen]
pub fn embed_text(text: &str) -> Result<Vec<f32>, JsValue> {
    let state_lock = STATE.lock().map_err(|_| JsValue::from_str("Failed to lock state Mutex"))?;
    let state = state_lock.as_ref().ok_or_else(|| JsValue::from_str("Embedder state not initialized"))?;
    
    let encoding = state.tokenizer.encode(text.to_string(), true)
        .map_err(|e| JsValue::from_str(&format!("Tokenization error: {}", e)))?;
        
    let input_ids: Vec<i64> = encoding.get_ids().iter().map(|&x| x as i64).collect();
    let attention_mask: Vec<i64> = encoding.get_attention_mask().iter().map(|&x| x as i64).collect();
    let token_type_ids: Vec<i64> = encoding.get_type_ids().iter().map(|&x| x as i64).collect();
    
    // Mean pooling sequence length
    let seq_len = input_ids.len();
    
    let input_ids_tensor = Tensor::from_shape(&[1, seq_len], &input_ids)
        .map_err(|e| JsValue::from_str(&format!("Tensor conversion error: {}", e)))?;
    let attention_mask_tensor = Tensor::from_shape(&[1, seq_len], &attention_mask)
        .map_err(|e| JsValue::from_str(&format!("Tensor conversion error: {}", e)))?;
    let token_type_ids_tensor = Tensor::from_shape(&[1, seq_len], &token_type_ids)
        .map_err(|e| JsValue::from_str(&format!("Tensor conversion error: {}", e)))?;
        
    let outputs = state.model.run(tvec![
        input_ids_tensor.into(),
        attention_mask_tensor.into(),
        token_type_ids_tensor.into()
    ]).map_err(|e| JsValue::from_str(&format!("Inference execution error: {}", e)))?;
    
    let embeddings_tensor = outputs[0].to_array_view::<f32>()
        .map_err(|e| JsValue::from_str(&format!("Failed to read embeddings array: {}", e)))?;
        
    let shape = embeddings_tensor.shape();
    let hidden_size = shape[2];

    // Mean pooling strategy
    let mut mean_pooled = vec![0.0f32; hidden_size];
    let mut total_mask = 0.0;
    
    for i in 0..seq_len {
        let mask = attention_mask[i] as f32;
        total_mask += mask;
        for d in 0..hidden_size {
            mean_pooled[d] += embeddings_tensor[[0, i, d]] * mask;
        }
    }
    
    if total_mask > 0.0 {
        for d in 0..hidden_size {
            mean_pooled[d] /= total_mask;
        }
    }
    
    // L2 Normalize
    let mut sum_sq = 0.0;
    for x in &mean_pooled {
        sum_sq += x * x;
    }
    let norm = sum_sq.sqrt();
    if norm > 0.0 {
        for x in &mut mean_pooled {
            *x /= norm;
        }
    }
    
    Ok(mean_pooled)
}

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
