# `@repo/models`

Model interfaces for the Phase-5 recall pipeline. Two things:

1. **`Reranker`** — every recall path can optionally rerank top-K hits.
   Ships two implementations that already work today:
   - `HeuristicReranker` — deterministic token-overlap scorer, no
     network, good enough for CI + local dev.
   - `createHttpReranker` — hits any Cohere / Voyage / BAAI-shaped
     `/rerank` endpoint. Works out of the box, replace the URL when the
     distilled voice-tuned reranker ships.

2. **`WasmModelRegistry`** + `WasmModelHandle` — the shape the future
   distilled embedder and reranker will bind to. Placeholder loader
   ships so downstream code (edge worker, browser SDK) compiles today.
   Nothing real is loaded yet.

Phase 6 replaces `NoopWasmEmbedder` with the actual voice-tuned models —
same interface, one-line swap in whoever's constructing the registry.

The interfaces are stable at Phase 5 exit. Consumers can bind against
them now without waiting for training to complete.
