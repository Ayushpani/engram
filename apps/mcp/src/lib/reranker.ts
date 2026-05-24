// WASM Reranker Integration for Cloudflare Workers
// Dynamically loads the tract-onnx compiled WASM and the INT8 quantized model from R2

import type { ExecutionContext } from "@cloudflare/workers-types";
// @ts-ignore
import { init_reranker, rerank_agentic } from "../../../packages/reranker-wasm/pkg/reranker_wasm.js";

interface Env {
  MODELS_BUCKET: R2Bucket;
  ANALYTICS?: AnalyticsEngineDataset;
}

let wasmState = { initialized: false };

export interface SearchCandidate {
  id: string;
  text: string;
  created_at_ts: number;
  last_accessed_ts: number;
  is_core_profile: boolean;
  relation_count: number;
}

export interface AgenticConfig {
  semantic_weight: number;
  recency_weight: number;
  profile_weight: number;
  centrality_weight: number;
  recency_half_life_hours: number;
}

export interface RankedResult {
  id: string;
  semantic_score: number;
  final_score: number;
  original_rank: number;
}

/**
 * Lazily loads the WASM and model artifacts from R2.
 * Mutates the global wasmState to cache initialization across the warm isolate.
 */
async function ensureReranker(env: Env, ctx: ExecutionContext): Promise<boolean> {
  if (wasmState.initialized) return true;
  
  try {
    const cache = await caches.open("smaran-models");
    
    // We try cache first, then R2
    const modelKey = "reranker-l2-quantized.onnx";
    const tokenizerKey = "tokenizer.json";

    let modelRes = await cache.match(`https://models.smaran.ai/${modelKey}`);
    let tokenizerRes = await cache.match(`https://models.smaran.ai/${tokenizerKey}`);

    if (!modelRes || !tokenizerRes) {
      if (!env.MODELS_BUCKET) {
        throw new Error("MODELS_BUCKET binding not found");
      }
      
      const [modelObj, tokenizerObj] = await Promise.all([
        env.MODELS_BUCKET.get(modelKey),
        env.MODELS_BUCKET.get(tokenizerKey),
      ]);
      
      if (!modelObj || !tokenizerObj) {
        throw new Error("Model artifacts not found in R2");
      }
      
      modelRes = new Response(modelObj.body as ReadableStream);
      tokenizerRes = new Response(tokenizerObj.body as ReadableStream);
      
      // Cache them for subsequent isolate spins
      ctx.waitUntil(cache.put(`https://models.smaran.ai/${modelKey}`, modelRes.clone()));
      ctx.waitUntil(cache.put(`https://models.smaran.ai/${tokenizerKey}`, tokenizerRes.clone()));
    }
    
    const modelBytes = new Uint8Array(await modelRes.arrayBuffer());
    const tokenizerBytes = new Uint8Array(await tokenizerRes.arrayBuffer());
    
    init_reranker(modelBytes, tokenizerBytes);
    wasmState.initialized = true;
    return true;
  } catch (error) {
    console.error("WASM Reranker dynamic initialization failed:", error);
    return false;
  }
}

/**
 * External Reranker API Fallback
 */
async function callExternalRerankerService(query: string, candidates: SearchCandidate[], limit: number): Promise<RankedResult[]> {
  // In a real implementation this would call out to Cohere or Jina
  console.log("Calling external reranker for query:", query);
  
  // Dummy implementation that just passes them through for the fallback mock
  return candidates.map((c, i) => ({
    id: c.id,
    semantic_score: 0.5,
    final_score: 0.5,
    original_rank: i
  })).slice(0, limit);
}

/**
 * Main Rerank entrypoint. Attempts pure WASM Edge reranking first.
 * Falls back to external API on OOM or initialization failure.
 */
export async function rerankWithFallback(
  query: string, 
  candidates: SearchCandidate[], 
  limit: number, 
  env: Env,
  ctx: ExecutionContext,
  config?: Partial<AgenticConfig>
): Promise<RankedResult[]> {
  const currentTs = Date.now() / 1000;
  const configJson = config ? JSON.stringify(config) : "";

  try {
    const active = await ensureReranker(env, ctx);
    if (active) {
      const start = performance.now();
      const resultsJson = rerank_agentic(query, JSON.stringify(candidates), limit, configJson, currentTs);
      const elapsed = performance.now() - start;
      
      if (env.ANALYTICS) {
        env.ANALYTICS.writeDataPoint({ blobs: ["rerank_wasm"], doubles: [elapsed] });
      }
      
      return JSON.parse(resultsJson) as RankedResult[];
    }
  } catch (e) {
    if (env.ANALYTICS) {
      env.ANALYTICS.writeDataPoint({ blobs: ["rerank_wasm_fail"], doubles: [1] });
    }
    console.warn("WASM Reranking failed, falling back to external API:", e);
  }
  
  return callExternalRerankerService(query, candidates, limit);
}
