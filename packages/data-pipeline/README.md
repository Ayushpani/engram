# `@repo/data-pipeline`

Phase-5 groundwork for the data flywheel: PII scrubbing and training-pair
extraction. Feeds the distilled embedder + reranker training loop once we
have collected enough consented call data.

## PII scrubbing

`scrubPii(text)` finds and redacts:

- Emails, phone numbers, IPs, credit-card numbers
- URLs containing tokens / session IDs / passwords
- India-specific: Aadhaar, PAN, GSTIN, UPI VPAs

Each span is replaced with a stable, indexed placeholder (`<EMAIL_0>`,
`<AADHAAR_1>`, …) so redacted training samples remain joinable across
downstream tables.

## Training pair extraction

`buildTrainingPairs(memories, { includeNegatives })` walks a memory dump
and emits `{ query, positive, negative?, labels }` samples in the exact
shape sentence-transformers and BGE fine-tuning scripts consume. Same
session → positive pair, different session → hard negative candidate.

Every sample is PII-scrubbed AND filler-stripped through `@repo/language`
before being emitted, and tagged with detected language + code-switch flag
so we can train per-language subsets independently.
