# `smaran-cli`

One command to try Smaran. Published to npm as `smaran-cli`.

```bash
# Zero-config sandbox — in-memory API on :8787
npx smaran-cli try

# Persistent Supabase-backed setup
npx smaran-cli init --supabase 'postgresql://...'
```

Inside the monorepo you can also run it via the workspace filter:

```bash
bun --filter smaran-cli run --bun src/index.ts try
```
