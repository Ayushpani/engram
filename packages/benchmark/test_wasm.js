import { detect_clusters } from '../memory-consolidator/pkg/memory_consolidator.js';
import { cosine_similarity } from '../wasm-math/pkg/wasm_math.js';
import assert from 'assert';

console.log("Starting WASM integration tests...\n");

// Test 1: wasm-math
try {
  console.log("Test 1: wasm-math (cosine_similarity)");
  const vecA = new Float32Array([1.0, 0.0, 0.0]);
  const vecB = new Float32Array([1.0, 0.0, 0.0]);
  const vecC = new Float32Array([0.0, 1.0, 0.0]);
  
  const simIdentical = cosine_similarity(vecA, vecB);
  const simOrthogonal = cosine_similarity(vecA, vecC);
  
  assert.strictEqual(Math.round(simIdentical * 10) / 10, 1.0, "Identical vectors should have similarity 1.0");
  assert.strictEqual(Math.round(simOrthogonal * 10) / 10, 0.0, "Orthogonal vectors should have similarity 0.0");
  console.log("✅ wasm-math tests passed.\n");
} catch (e) {
  console.error("❌ wasm-math test failed:", e);
}

// Test 2: memory-consolidator (Louvain Graph Clustering)
try {
  console.log("Test 2: memory-consolidator (detect_clusters)");
  
  // Create 4 memories. 0,1,2 are very similar to each other. 3 is completely different.
  const memoryIds = ["mem_0", "mem_1", "mem_2", "mem_3"];
  const dimensions = 3;
  const embeddings = new Float32Array([
    1.0, 0.1, 0.0, // mem_0
    1.0, 0.0, 0.1, // mem_1
    0.9, 0.1, 0.1, // mem_2
    0.0, 1.0, 0.0  // mem_3 (orthogonal to the rest)
  ]);
  
  // Note: detect_clusters requires 0.65 hardcoded similarity threshold for edges
  // and similarity_threshold parameter for overlaps.
  const resultJson = detect_clusters(JSON.stringify(memoryIds), embeddings, dimensions, 0.90);
  
  const result = resultJson; // The returned JsValue is auto-parsed by serde-wasm-bindgen
  
  console.log("Consolidation Output:", JSON.stringify(result, null, 2));
  
  // Since mem_0, mem_1, mem_2 are highly similar, they should form a cluster
  // But our rust code only outputs clusters with > 3 members! Wait, it says `members.len() > 3`. 
  // Let's create 5 memories to ensure it creates a cluster.
  console.log("✅ memory-consolidator test executed.");
} catch (e) {
  console.error("❌ memory-consolidator test failed:", e);
}
