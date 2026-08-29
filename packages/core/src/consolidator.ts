import type { SaveInput } from "./types.ts"

export interface ConsolidatorCandidate {
	text: string
	kind: "fact" | "preference" | "event" | "entity"
}

export interface Consolidator {
	consolidate(input: SaveInput): Promise<ConsolidatorCandidate[]>
}

/**
 * Phase-1 heuristic consolidator: sentence-split + light filter.
 * Phase-2 will replace this with an LLM-driven extractor that
 * handles ASR noise, disfluencies, and code-switching.
 */
export class HeuristicConsolidator implements Consolidator {
	async consolidate(input: SaveInput): Promise<ConsolidatorCandidate[]> {
		const text = input.text.trim()
		if (!text) return []
		const sentences = text
			.split(/(?<=[.!?])\s+|\n+/)
			.map((s) => s.trim())
			.filter((s) => s.length >= 4)

		if (sentences.length === 0) {
			return [{ text, kind: classify(text) }]
		}
		return sentences.map((s) => ({ text: s, kind: classify(s) }))
	}
}

function classify(s: string): ConsolidatorCandidate["kind"] {
	const lower = s.toLowerCase()
	if (/\b(i (like|love|prefer|hate|dislike)|my favou?rite)\b/.test(lower))
		return "preference"
	if (
		/\b(yesterday|today|tomorrow|last (week|month|year)|on \w+day)\b/.test(
			lower,
		)
	)
		return "event"
	if (/^[A-Z][a-z]+(?: [A-Z][a-z]+)+$/.test(s.trim())) return "entity"
	return "fact"
}
