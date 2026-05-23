import { Hono } from 'hono';
import { pipeline, env } from '@huggingface/transformers';

// Configure transformers.js for the Cloudflare Workers environment.
env.useBrowserCache = false;
env.allowLocalModels = false;

// CRITICAL FOR CLOUDFLARE WORKERS:
// Cloudflare isolates do not support WebAssembly threading/pthreads.
// We must force single-threaded mode and disable SIMD to prevent the runtime
// from looking for 'ort-wasm-simd-threaded.jsep.mjs'.
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.simd = false;

// Tell the ONNX Runtime where to fetch the non-threaded WASM binaries.
// Note: Do NOT use a trailing slash, as ONNX Runtime Web has a bug where it merges
// it into "https:/cdn..." when dynamically importing.
env.backends.onnx.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.0/dist';


type Bindings = {
  MODEL_CDN_BASE: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// Module-level singleton: initialized once per Worker isolate lifetime.
let reranker: Awaited<ReturnType<typeof pipeline>> | null = null;
let initializing = false;

async function getReranker() {
  if (reranker) return reranker;
  if (initializing) {
    // Another concurrent request is already initializing — wait.
    while (initializing) await new Promise(r => setTimeout(r, 50));
    return reranker!;
  }

  initializing = true;
  console.log('Loading cross-encoder/ms-marco-MiniLM-L-6-v2 (INT8 ONNX)...');

  reranker = await pipeline(
    'text-classification',
    'Xenova/ms-marco-MiniLM-L-6-v2',
    {
      quantized: true, // Uses the INT8 ONNX model (~22MB), fits in Unbound Worker
      // CRITICAL: Force 'wasm' device instead of 'auto'. 
      // 'auto' tries to load WebGPU (JSEP) which forces multi-threading and crashes Cloudflare Workers.
      device: 'wasm',
    }
  );

  initializing = false;
  console.log('Cross-encoder loaded and ready.');
  return reranker!;
}

app.post('/v3/search/rerank', async (c) => {
  try {
    const body = await c.req.json<{
      query: string;
      candidates: Array<{ id: string; content: string; score?: number }>;
      topK?: number;
    }>();

    const { query, candidates, topK = 5 } = body;

    if (!query || !candidates?.length) {
      return c.json({ error: 'Missing query or candidates' }, 400);
    }

    const model = await getReranker();
    const start = Date.now();

    // Build [query, passage] pairs for the cross-encoder
    const pairs = candidates.map(c => ({ text: query, text_pair: c.content }));

    // Run cross-encoder inference — returns logit scores
    const outputs = await model(pairs, { truncation: true, padding: true }) as Array<{ label: string; score: number }>;

    // Combine cross-encoder score with the original vector similarity score
    const ranked = candidates
      .map((candidate, i) => ({
        ...candidate,
        crossEncoderScore: outputs[i]?.score ?? 0,
        vectorScore: candidate.score ?? 0,
        // Weighted blend: 70% cross-encoder, 30% vector similarity
        combinedScore: 0.7 * (outputs[i]?.score ?? 0) + 0.3 * (candidate.score ?? 0),
      }))
      .sort((a, b) => b.combinedScore - a.combinedScore)
      .slice(0, topK);

    return c.json({
      success: true,
      results: ranked,
      latencyMs: Date.now() - start,
      model: 'cross-encoder/ms-marco-MiniLM-L-6-v2 (INT8)',
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Reranker Error:', message);
    return c.json({ error: message }, 500);
  }
});

app.get('/health', (c) => c.json({ status: 'ok', model: 'ms-marco-MiniLM-L-6-v2' }));

export default app;
