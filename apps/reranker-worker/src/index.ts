import { Hono } from 'hono';

type Bindings = {
  AI: Ai;
};

const app = new Hono<{ Bindings: Bindings }>();

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

    const start = Date.now();

    // Use Cloudflare Workers AI's native reranker model.
    // This runs on Cloudflare's GPU infrastructure — no WASM, no ONNX, no external deps.
    const rerankerResponse = await c.env.AI.run(
      '@cf/baai/bge-reranker-base' as BaseAiTextClassificationModels,
      {
        text: candidates.map((candidate) => [query, candidate.content]),
      }
    ) as unknown as Array<{ score: number }>;

    // Combine cross-encoder score with the original vector similarity score
    const ranked = candidates
      .map((candidate, i) => ({
        ...candidate,
        crossEncoderScore: rerankerResponse[i]?.score ?? 0,
        vectorScore: candidate.score ?? 0,
        // Weighted blend: 70% cross-encoder, 30% vector similarity
        combinedScore:
          0.7 * (rerankerResponse[i]?.score ?? 0) +
          0.3 * (candidate.score ?? 0),
      }))
      .sort((a, b) => b.combinedScore - a.combinedScore)
      .slice(0, topK);

    return c.json({
      success: true,
      results: ranked,
      latencyMs: Date.now() - start,
      model: '@cf/baai/bge-reranker-base',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Reranker Error:', message);
    return c.json({ error: message }, 500);
  }
});

app.get('/health', (c) => c.json({ status: 'ok', model: '@cf/baai/bge-reranker-base' }));

export default app;
