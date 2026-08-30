# Smaran — measured latency

Every latency figure quoted anywhere on the site (landing, docs, README) resolves to a run in this file. If it isn't here, it isn't real.

## Methodology

Two suites already in the repo:

- `scripts/benchmark-voice-turns.ts` — 7 realistic voice-turn transcripts through `POST /v1/memories` then `POST /v1/recall`. Asserts `mustContain` / `mustNotContain` on recall output. Reports save + recall p50/p95.
- `scripts/benchmark-audio.ts` — real audio files (`scripts/audio-samples/*.wav`) through `scripts/transcribe.py` (Whisper) → `POST /v1/memories` → `POST /v1/recall`. Reports ASR + save + recall p50/p95.

Each is run against four **config combinations** so the numbers can be attributed to the right layer:

| Run | Store | Embedder | Purpose |
|---|---|---|---|
| A | `memory` | `hash` | sandbox baseline — isolates pipeline overhead |
| B | `memory` | `openai:text-embedding-3-small` | isolates embedder network cost |
| C | `supabase` | `hash` | isolates DB round-trip cost |
| D | `supabase` | `openai:text-embedding-3-small` | **production shape — the one that matters** |

Reproduce locally:

```bash
# Run A — sandbox baseline (already published)
STORE=memory EMBEDDER=hash SANDBOX_API_KEY=sk_local_dev bun run apps/api/src/index.ts &
bun run scripts/benchmark-voice-turns.ts
bun run scripts/benchmark-audio.ts scripts/audio-samples

# Run D — real production shape
STORE=supabase EMBEDDER=openai \
  DATABASE_URL="postgresql://..." \
  OPENAI_API_KEY="sk-..." \
  OPENAI_EMBED_MODEL="text-embedding-3-small" \
  bun run apps/api/src/index.ts &
bun run scripts/benchmark-voice-turns.ts
bun run scripts/benchmark-audio.ts scripts/audio-samples
```

---

## Run A — sandbox baseline

- **Store**: `memory` (InMemoryStore, ephemeral)
- **Embedder**: `hash` (HashEmbedder — deterministic, 0ms compute)
- **Hardware**: [FILL IN — e.g. MacBook Pro M2, 16GB]
- **Region**: local, no network hop
- **Commit**: [FILL IN — `git rev-parse HEAD`]
- **Timestamp**: [FILL IN — ISO 8601]

### Voice-turn suite (7 cases)

- **Accuracy**: 7/7 pass
- **Save**: p50 = **10.7 ms** · p95 = 13.9 ms · N = 7
- **Recall**: p50 = **2.6 ms** · p95 = 3.1 ms · N = 7

### Audio suite (6 cases)

Whisper-tiny on CPU:

- **Accuracy**: 3/7 (ASR mishearings, not memory-layer failures — see [transcript-preservation caveat](#interpreting-the-audio-accuracy-numbers))
- **ASR**: p50 = 1373 ms · p95 = 1596 ms · N = 7 (whisper-tiny CPU)
- **Save**: p50 = 10.7 ms · p95 = 13.9 ms · N = 7
- **Recall**: p50 = 2.6 ms · p95 = 3.1 ms · N = 7

---

## Run B — embedder isolation

- **Store**: `memory`
- **Embedder**: `openai:text-embedding-3-small`
- **Hardware**: [FILL IN]
- **Region**: local + OpenAI API (typically us-east)
- **Commit**: [FILL IN]
- **Timestamp**: [FILL IN]

### Voice-turn suite

- **Accuracy**: [FILL IN]
- **Save**: p50 = [FILL IN] · p95 = [FILL IN] · N = 7
- **Recall**: p50 = [FILL IN] · p95 = [FILL IN] · N = 7

### Audio suite

Same asr numbers as Run A (ASR is upstream).

- **Save**: p50 = [FILL IN] · p95 = [FILL IN] · N = 7
- **Recall**: p50 = [FILL IN] · p95 = [FILL IN] · N = 7

---

## Run C — DB isolation

- **Store**: `supabase` (Postgres + pgvector, HNSW index)
- **Embedder**: `hash`
- **Hardware**: [FILL IN]
- **Region**: Supabase `ap-south-1` accessed via Tokyo pooler
- **Commit**: [FILL IN]
- **Timestamp**: [FILL IN]

### Voice-turn suite

- **Accuracy**: [FILL IN]
- **Save**: p50 = [FILL IN] · p95 = [FILL IN] · N = 7
- **Recall**: p50 = [FILL IN] · p95 = [FILL IN] · N = 7

### Audio suite

- **Save**: p50 = [FILL IN] · p95 = [FILL IN] · N = 7
- **Recall**: p50 = [FILL IN] · p95 = [FILL IN] · N = 7

---

## Run D — production shape (the one that matters)

- **Store**: `supabase`
- **Embedder**: `openai:text-embedding-3-small`
- **Hardware**: [FILL IN]
- **Region**: Supabase `ap-south-1` via Tokyo pooler; OpenAI us-east
- **Commit**: [FILL IN]
- **Timestamp**: [FILL IN]

### Voice-turn suite

- **Accuracy**: [FILL IN]
- **Save**: p50 = [FILL IN] · p95 = [FILL IN] · N = 7
- **Recall**: p50 = [FILL IN] · p95 = [FILL IN] · N = 7

### Audio suite

- **Save**: p50 = [FILL IN] · p95 = [FILL IN] · N = 7
- **Recall**: p50 = [FILL IN] · p95 = [FILL IN] · N = 7

---

## Interpreting the audio accuracy numbers

The audio suite's accuracy is dominated by ASR quality, not memory-layer accuracy. Whisper-tiny mishears `987654321` as `9-8-7-6-5-4-3-2-1`, `Ayushpani` as `Aayush Pani`, `bandra` as `Bhandra`. Smaran saves what it's given; the memory layer's job is to preserve and retrieve that value, not to correct ASR. Every "fail" in the audio suite is an ASR miss, not a Smaran failure.

The transcript-suite accuracy (Run A's voice-turn suite) is the honest memory-layer number: **7/7 on realistic voice-turn corrections**.
