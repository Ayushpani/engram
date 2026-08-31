import type { SaveInput } from "./types.ts"

export interface ConsolidatorCandidate {
	text: string
	/**
	 * Left unset by segmentation-only consolidators (e.g.
	 * HeuristicConsolidator below) — core.ts save() fills it in via
	 * classify.ts's embedding-nearest-centroid classifier, reusing the
	 * same embedding it computes for storage. A future consolidator that
	 * already knows the kind (e.g. an LLM-driven one) may set it directly
	 * to skip that step.
	 */
	kind?: "fact" | "preference" | "event" | "entity"
}

export interface Consolidator {
	consolidate(input: SaveInput): Promise<ConsolidatorCandidate[]>
}

/**
 * Sentence segmentation only — classification moved to classify.ts
 * (nearest-centroid over embeddings) so it generalizes across languages
 * instead of matching a fixed word list. The boundary itself now uses the
 * Unicode `Sentence_Terminal` property instead of a literal `[.!?]`
 * class, so it also recognizes non-ASCII sentence-final punctuation
 * (e.g. Devanagari ।, full-width forms) rather than only the three ASCII
 * marks.
 */
export class HeuristicConsolidator implements Consolidator {
	async consolidate(input: SaveInput): Promise<ConsolidatorCandidate[]> {
		const text = input.text.trim()
		if (!text) return []
		const sentences = text
			.split(/(?<=\p{Sentence_Terminal})\s+|\n+/u)
			.map((s) => s.trim())
			.filter((s) => s.length >= 4)

		if (sentences.length === 0) return [{ text }]
		return sentences.map((s) => ({ text: s }))
	}
}
