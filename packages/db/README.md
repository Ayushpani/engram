# `@repo/db`

Drizzle schema + Supabase-backed `MemoryStore`.

## Tables

- `tenants`, `api_keys` — tenancy and auth.
- `sessions` — one row per agent conversation.
- `memories` — the vector store. `vector(1536)` + HNSW (cosine).
- `entities`, `relations` — graph store for Phase 4 multi-hop recall.

## Scripts

```bash
# Direct 5432 URL, not the pooled one.
DATABASE_URL=… bun --filter @repo/db db:migrate
DATABASE_URL=… bun --filter @repo/db db:seed [tenant-name]
```

`db:migrate` applies every `.sql` in `migrations/` in lexical order and is
idempotent (`IF NOT EXISTS` throughout). `db:seed` creates a tenant and prints
a fresh API key — the raw key is never persisted, only its SHA-256.

Row Level Security is enabled on every tenant-scoped table as a second line of
defence; the API always filters by tenant in-query, so RLS is belt-and-braces
rather than the primary boundary. Add Supabase policies before exposing the
Postgres connection to any untrusted client.
