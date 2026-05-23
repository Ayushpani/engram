# Benchmark Comparison Report

Generated: 2026-05-20T21:24:59.201Z

## Retrieval Metrics

| Metric | Baseline | Optimized | Diff | Improvement |
|---|---|---|---|---|
| Recall@5 | 0.954 | 1.000 | 0.046 | 4.8% |
| MRR | 1.000 | 1.000 | 0.000 | 0.0% |
| NDCG@10 | 0.970 | 1.000 | 0.030 | 3.1% |

## Latency Metrics (ms)

| Percentile | Baseline | Optimized | Diff (ms) | Speedup |
|---|---|---|---|---|
| p50 | 201 | 7 | -194 | 28.7x |
| p90 | 240 | 11 | -229 | 21.8x |
| p95 | 244 | 11 | -233 | 22.2x |
| p99 | 247 | 12 | -235 | 20.6x |
| Mean | 199.6 | 6.7 | -192.9 | 29.7x |

## Conclusion
The WASM optimizations demonstrate significant improvements in both search accuracy and latency.
