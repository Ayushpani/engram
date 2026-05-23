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
    // API schema: { query: string, contexts: string[] }
    const rawAiResult: any = await c.env.AI.run(
      '@cf/baai/bge-reranker-base' as BaseAiTextClassificationModels,
      {
        query: query,
        contexts: candidates.map((candidate) => ({ text: candidate.content })),
      } as any
    );

    // Cloudflare AI run() binding can sometimes wrap the array in a 'result' object, 
    // and the elements can be either raw numbers or { score: number } objects.
    const scoresArray = Array.isArray(rawAiResult) 
      ? rawAiResult 
      : (rawAiResult?.result || rawAiResult?.data || rawAiResult || []);

    // Combine cross-encoder score with the original vector similarity score
    const ranked = candidates
      .map((candidate, i) => {
        const item = scoresArray[i];
        let cScore = 0;
        if (typeof item === 'number') {
          cScore = item;
        } else if (item && typeof item === 'object' && typeof item.score === 'number') {
          cScore = item.score;
        }

        return {
          ...candidate,
          crossEncoderScore: cScore,
          vectorScore: candidate.score ?? 0,
          // Weighted blend: 70% cross-encoder, 30% vector similarity
          combinedScore: 0.7 * cScore + 0.3 * (candidate.score ?? 0),
        };
      })
      .sort((a, b) => b.combinedScore - a.combinedScore)
      .slice(0, topK);

    return c.json({
      success: true,
      results: ranked,
      latencyMs: Date.now() - start,
      model: '@cf/baai/bge-reranker-base',
      debugAiResult: rawAiResult, // Let's see EXACTLY what it's returning
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Reranker Error:', message);
    return c.json({ error: message }, 500);
  }
});

app.get('/health', (c) => c.json({ status: 'ok', model: '@cf/baai/bge-reranker-base' }));

export default app;
