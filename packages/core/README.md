# `@repo/core`

The provider-agnostic memory engine. No framework, no database, no HTTP.

- `MemoryCore` — the one interface every adapter targets (`save`, `recall`, `forget`, `subscribe`).
- `MemoryStore` — the storage contract; `@repo/db` ships the Supabase implementation.
- `Embedder` — pluggable; ships `HashEmbedder` (dev) and `createOpenAIEmbedder` (any `/v1/embeddings` host).
- `Consolidator` — Phase 1 heuristic; Phase 2 replaces with the ASR-aware model.

Freezing the `MemoryCore` interface at Phase 1 exit is deliberate: every future
adapter (Anthropic, OpenAI, Gemini, Vercel AI SDK, LangGraph, Vapi, Retell,
Bolna) binds to this shape. See the [implementation plan](https://claude.ai/code/artifact/54275eeb-c4b3-4c03-b509-099e9d86dea6).
