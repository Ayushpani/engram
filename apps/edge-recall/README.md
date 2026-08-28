# `@repo/edge-recall`

Cloudflare Worker that terminates the hot recall path at the edge. Idea:
put a KV-backed cache in every Cloudflare data center in front of the
origin API. A repeat recall within a live voice call gets a
sub-millisecond KV read; a cache miss goes to the origin and comes back
warm.

## Flow

1. Bearer auth check (token → tenant id via hash).
2. KV lookup by `(tenant, session, user, rerank?, topK, normalized-query)`.
3. Miss → single fetch to the origin `/v1/recall`.
4. Optional rerank at the edge via `@repo/models` (heuristic today; WASM
   distilled reranker in Phase 6).
5. Response written back to KV with a 60s TTL so the next call is hot.

The worker never talks to Postgres. It's a hot cache + rerank tier and
nothing more.

## Deploy

```bash
# Create a KV namespace, drop the id into wrangler.jsonc
wrangler kv:namespace create HOT_CACHE
# Update ORIGIN_URL to point at your origin API deployment
bun --filter '@repo/edge-recall' deploy
```

## What's stub for now

- The tenant id derivation from bearer is a hash placeholder. Phase 6
  moves the API-key → tenant table read to KV too so this hop is real.
- The heuristic reranker is placeholder. WASM binary swaps in against
  the same interface in Phase 6.
