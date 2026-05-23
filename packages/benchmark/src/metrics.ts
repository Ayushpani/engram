// src/metrics.ts
// Calculates standard IR and performance metrics

import * as hdr from 'hdr-histogram-js';

export interface RetrievalMetrics {
  recallAtK: number;
  mrr: number;
  ndcgAtK: number;
}

export interface LatencyMetrics {
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  mean: number;
  max: number;
}

export function calculateRecallAtK(retrievedIds: string[], expectedIds: string[], k: number): number {
  if (expectedIds.length === 0) return 1.0;
  
  const retrievedAtK = retrievedIds.slice(0, k);
  const relevantRetrieved = retrievedAtK.filter(id => expectedIds.includes(id));
  
  return relevantRetrieved.length / expectedIds.length;
}

export function calculateMRR(retrievedIds: string[], expectedIds: string[]): number {
  if (expectedIds.length === 0) return 1.0;
  
  for (let i = 0; i < retrievedIds.length; i++) {
    if (expectedIds.includes(retrievedIds[i])) {
      return 1.0 / (i + 1);
    }
  }
  return 0.0;
}

export function calculateNDCGAtK(retrievedIds: string[], expectedIds: string[], k: number): number {
  if (expectedIds.length === 0) return 1.0;
  
  const retrievedAtK = retrievedIds.slice(0, k);
  
  let dcg = 0;
  for (let i = 0; i < retrievedAtK.length; i++) {
    const rel = expectedIds.includes(retrievedAtK[i]) ? 1 : 0;
    dcg += rel / Math.log2(i + 2); // i is 0-indexed, so i+2 is position+1
  }
  
  // Ideal DCG: best possible ranking of the expected items
  let idcg = 0;
  const numRelevant = Math.min(k, expectedIds.length);
  for (let i = 0; i < numRelevant; i++) {
    idcg += 1 / Math.log2(i + 2);
  }
  
  return idcg === 0 ? 0 : dcg / idcg;
}

export function aggregateRetrievalMetrics(results: RetrievalMetrics[]): RetrievalMetrics {
  if (results.length === 0) return { recallAtK: 0, mrr: 0, ndcgAtK: 0 };
  
  const sum = results.reduce((acc, curr) => ({
    recallAtK: acc.recallAtK + curr.recallAtK,
    mrr: acc.mrr + curr.mrr,
    ndcgAtK: acc.ndcgAtK + curr.ndcgAtK,
  }), { recallAtK: 0, mrr: 0, ndcgAtK: 0 });
  
  return {
    recallAtK: sum.recallAtK / results.length,
    mrr: sum.mrr / results.length,
    ndcgAtK: sum.ndcgAtK / results.length,
  };
}

export function calculateLatencyMetrics(latenciesMs: number[]): LatencyMetrics {
  const histogram = hdr.build();
  
  latenciesMs.forEach(l => {
    // hdr histogram requires integer values
    histogram.recordValue(Math.round(l));
  });
  
  return {
    p50: histogram.getValueAtPercentile(50),
    p90: histogram.getValueAtPercentile(90),
    p95: histogram.getValueAtPercentile(95),
    p99: histogram.getValueAtPercentile(99),
    mean: histogram.mean,
    max: histogram.maxValue,
  };
}
