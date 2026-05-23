// src/adversarial.ts
// Validates adversarial queries against the outputs

import { GroundTruthQuery, BenchmarkMemory } from './dataset.js';

export interface AdversarialResult {
  passed: boolean;
  reason: string;
}

export function evaluateAdversarial(
  query: GroundTruthQuery,
  rankedMemoryIds: string[],
  allMemories: BenchmarkMemory[]
): AdversarialResult {
  if (rankedMemoryIds.length === 0) {
    return { passed: false, reason: "No results returned" };
  }

  const topRankedId = rankedMemoryIds[0];

  switch (query.type) {
    case 'adversarial_temporal':
      // "Where do I live currently?" - Should return SF (new) over NYC (old)
      if (topRankedId === "mem_adv_temp_new") {
        return { passed: true, reason: "Ranked newer temporal fact first" };
      }
      return { passed: false, reason: `Expected mem_adv_temp_new, got ${topRankedId}` };

    case 'adversarial_near_miss':
      // "How to use device APIs?" - Should return React Native (2) over React (1)
      if (topRankedId === "mem_adv_nearmiss_2") {
        return { passed: true, reason: "Distinguished near-miss terminology" };
      }
      return { passed: false, reason: `Expected mem_adv_nearmiss_2, got ${topRankedId}` };

    case 'adversarial_contradiction':
      // "What should I eat?" - Profile constraint (allergic to peanuts) must beat standard fact
      if (topRankedId === "mem_adv_contra_1") {
        return { passed: true, reason: "Profile safety override succeeded" };
      }
      return { passed: false, reason: `Expected mem_adv_contra_1, got ${topRankedId}` };

    case 'adversarial_profile':
      // "What is my name?" - Core profile fact must beat recent mention
      if (topRankedId === "mem_adv_prof_1") {
        return { passed: true, reason: "Core profile fact ranked first" };
      }
      return { passed: false, reason: `Expected mem_adv_prof_1, got ${topRankedId}` };

    case 'adversarial_recency':
      // "What is the formula..." - Highly relevant old fact must beat irrelevant new fact
      if (topRankedId === "mem_adv_recency_old") {
        return { passed: true, reason: "Relevance correctly overpowered recency" };
      }
      return { passed: false, reason: `Expected mem_adv_recency_old, got ${topRankedId}` };

    default:
      return { passed: true, reason: "Not an adversarial query" };
  }
}
