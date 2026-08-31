/**
 * Beta-Binomial belief tracking for memory confidence.
 *
 * Each memory (or slot-cluster of memories about the same fact) carries a
 * Beta(alpha, beta) posterior over "is this value still true". Beta is the
 * conjugate prior for a Bernoulli/Binomial process, so every piece of
 * evidence is a closed-form update — O(1), no numerical fitting, no LLM
 * call, safe on the hot path.
 *
 *   prior:        Beta(1, 1)              — uniform, fully neutral
 *   corroborate:  alpha' = alpha + w       — an independent mention agrees
 *   contradict:   beta'  = beta + w        — a retraction/replacement disagrees
 *   mean:         alpha / (alpha + beta)   — point estimate of confidence
 *   variance:     alpha*beta / ((alpha+beta)^2 * (alpha+beta+1))
 *
 * Variance matters as much as the mean: Beta(1,1) and Beta(50,50) both have
 * mean 0.5, but the second has seen 100x the evidence and should not be
 * treated the same by a consolidation gate. A single LLM call reporting
 * "confidence: 0.9" has no such distinction — this does.
 */

export interface Belief {
	alpha: number
	beta: number
}

/** A fresh, fully-neutral prior — no evidence yet. */
export function neutralBelief(): Belief {
	return { alpha: 1, beta: 1 }
}

/**
 * Evidence weight for one observation. Independent corroboration from a
 * different session counts more than a same-session repetition (which is
 * likely the same utterance restated, not new evidence).
 */
export function corroborate(
	belief: Belief,
	weight = 1,
): Belief {
	return { alpha: belief.alpha + weight, beta: belief.beta }
}

/**
 * A retraction/replacement: evidence against the OLD value. Call this on
 * the belief of the value being superseded, not the new one (which starts
 * its own fresh `neutralBelief()`).
 */
export function contradict(belief: Belief, weight = 1): Belief {
	return { alpha: belief.alpha, beta: belief.beta + weight }
}

/** Point estimate: E[c] = alpha / (alpha + beta). */
export function mean(belief: Belief): number {
	return belief.alpha / (belief.alpha + belief.beta)
}

/** Var[c] = alpha*beta / ((alpha+beta)^2 * (alpha+beta+1)) — shrinks as evidence accumulates. */
export function variance(belief: Belief): number {
	const s = belief.alpha + belief.beta
	return (belief.alpha * belief.beta) / (s * s * (s + 1))
}

/** Standard deviation, more directly comparable to the [0,1] confidence scale than variance. */
export function stddev(belief: Belief): number {
	return Math.sqrt(variance(belief))
}

/**
 * Evidence-accumulation gate for auto-commit decisions (e.g. profile
 * consolidation): require both a confident mean AND enough evidence that
 * we trust the mean isn't a fluke of one confident-sounding sample.
 */
export function isWellSupported(
	belief: Belief,
	meanThreshold = 0.75,
	maxStddev = 0.15,
): boolean {
	return mean(belief) >= meanThreshold && stddev(belief) <= maxStddev
}
