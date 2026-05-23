use wasm_bindgen::prelude::*;

/// Calculate the dot product between two f32 slices
#[wasm_bindgen]
pub fn dot_product(a: &[f32], b: &[f32]) -> f32 {
    let mut dot = 0.0;
    for (x, y) in a.iter().zip(b.iter()) {
        dot += x * y;
    }
    dot
}

/// Calculate the magnitude of an f32 slice
#[wasm_bindgen]
pub fn magnitude(a: &[f32]) -> f32 {
    let mut sum = 0.0;
    for x in a.iter() {
        sum += x * x;
    }
    sum.sqrt()
}

/// Calculate the cosine similarity between two f32 slices
#[wasm_bindgen]
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    let mag_a = magnitude(a);
    let mag_b = magnitude(b);
    
    if mag_a == 0.0 || mag_b == 0.0 {
        return 0.0;
    }
    
    dot_product(a, b) / (mag_a * mag_b)
}

/// Computes a sigmoid activation function
#[wasm_bindgen]
pub fn sigmoid(x: f32) -> f32 {
    1.0 / (1.0 + (-x).exp())
}
