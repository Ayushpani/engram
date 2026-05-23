import { Hono } from 'hono';
import { EdgeReranker, CandidateWithMetadata, AgenticConfig } from '@engram/edge-reranker';

type Bindings = {
  // We will configure R2 or a public CDN URL to fetch the model bytes
  MODEL_CDN_BASE: string; 
};

const app = new Hono<{ Bindings: Bindings }>();
let reranker: EdgeReranker | null = null;
let initializing = false;

async function fetchModelBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch model from ${url}`);
  const buffer = await res.arrayBuffer();
  return new Uint8Array(buffer);
}

app.post('/v3/search/rerank', async (c) => {
  try {
    const body = await c.req.json();
    const { query, candidates, config, topK } = body as {
      query: string;
      candidates: CandidateWithMetadata[];
      config?: AgenticConfig;
      topK?: number;
    };

    if (!query || !candidates || candidates.length === 0) {
      return c.json({ error: 'Missing query or candidates' }, 400);
    }

    // Lazy initialize the WASM module and INT4 ONNX models
    if (!reranker && !initializing) {
      initializing = true;
      console.log('Initializing EdgeReranker WASM with INT4 Quantized ONNX...');
      const modelCdnBase = c.env.MODEL_CDN_BASE || 'https://cdn.engram.ai/models';
      
      const [modelBytes, tokenizerBytes] = await Promise.all([
        fetchModelBytes(`${modelCdnBase}/ms-marco-int4/model.onnx`),
        fetchModelBytes(`${modelCdnBase}/ms-marco-int4/tokenizer.json`)
      ]);

      reranker = new EdgeReranker();
      reranker.init(modelBytes, tokenizerBytes);
      initializing = false;
    }

    // Wait for initialization if another request triggered it
    while (initializing) {
      await new Promise(r => setTimeout(r, 50));
    }

    if (!reranker) {
      return c.json({ error: 'Reranker failed to initialize' }, 500);
    }

    // Execute the native WASM cross-encoder
    const start = Date.now();
    const rankedResults = reranker.rerankAgentic(query, candidates, config || {}, topK || 5);
    const latencyMs = Date.now() - start;

    return c.json({
      success: true,
      results: rankedResults,
      latencyMs
    });

  } catch (err: any) {
    console.error('Reranker Error:', err);
    return c.json({ error: err.message }, 500);
  }
});

export default app;
