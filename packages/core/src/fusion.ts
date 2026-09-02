import { mean as beliefMean, type Belief } from "./belief.ts"
import type { Memory } from "./types.ts"

/**
 * Reciprocal Rank Fusion across heterogeneous retrieval channels
 * (cosine distance, ts_rank, hop-count, decay score — none of which sit
 * on a shared, comparable scale). RRF sidesteps calibration entirely by
 * fusing on RANK, not raw score:
 *
 *   RRF(d) = sum over channels c of  1 / (k + rank_c(d))
 *
 * A document missing from a channel simply contributes 0 for that
 * channel. k=60 is the standard constant from the original RRF paper
 * (Cormack et al.) — large enough that a single channel's #1 slot doesn't
 * dominate the fused score outright, small enough that rank order still
 * matters more than which channels a document appeared in.
 */
export const RRF_K = 60

export function reciprocalRankFusion(
	rankedLists: string[][],
	k: number = RRF_K,
): Map<string, number> {
	const scores = new Map<string, number>()
	for (const list of rankedLists) {
		list.forEach((id, i) => {
			const rank = i + 1 // 1-indexed
			scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank))
		})
	}
	return scores
}

/**
 * Recency x frequency decay score for the temporal channel.
 *
 *   decay(d) = exp(-Δt / halfLife) * ln(1 + accessCount)
 *
 * Exponential recency decay (half-life in ms, default 14 days) times a
 * log-dampened frequency boost — a memory accessed 10x isn't 10x more
 * relevant than one accessed once, but it's more relevant than one never
 * revisited. This is the agreed "decay, not full PPR" — a single closed-
 * form score per candidate, O(1) per document, no graph spreading needed
 * at current scale.
 */
export function decayScore(
	lastActiveAt: string,
	accessCount: number,
	now: Date = new Date(),
	halfLifeMs: number = 14 * 24 * 60 * 60 * 1000,
): number {
	const dt = Math.max(0, now.getTime() - new Date(lastActiveAt).getTime())
	const recency = Math.exp((-dt / halfLifeMs) * Math.LN2)
	const frequency = Math.log1p(Math.max(0, accessCount))
	return recency * (1 + frequency)
}

/** Rank a candidate pool by decayScore, most-recent/most-accessed first. */
export function rankByDecay(
	memories: Memory[],
	now: Date = new Date(),
): string[] {
	return [...memories]
		.sort((a, b) => {
			const da = decayScore(a.lastAccessedAt ?? a.createdAt, a.accessCount, now)
			const db = decayScore(b.lastAccessedAt ?? b.createdAt, b.accessCount, now)
			return db - da
		})
		.map((m) => m.id)
}

/** Belief confidence as a final multiplicative modulator, not a 5th RRF channel — it answers "do we still believe this", not "does this match the query". */
export function applyConfidence(rrfScore: number, belief: Belief): number {
	return rrfScore * beliefMean(belief)
}
