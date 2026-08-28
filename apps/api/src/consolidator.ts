import type { Consolidator, ConsolidatorCandidate, SaveInput } from "@repo/core"
import { HeuristicConsolidator } from "@repo/core"
import { normalizeCodeSwitched } from "@repo/language"

/**
 * Wraps @repo/core's HeuristicConsolidator with Phase-4 language
 * intelligence: Hindi/Hinglish filler removal happens BEFORE sentence
 * splitting so the split logic sees clean, content-carrying text.
 * Original text is preserved verbatim in the metadata for audit.
 */
export class LanguageAwareConsolidator implements Consolidator {
	private readonly inner = new HeuristicConsolidator()

	async consolidate(input: SaveInput): Promise<ConsolidatorCandidate[]> {
		const norm = normalizeCodeSwitched(input.text)
		const cleaned: SaveInput = {
			...input,
			text: norm.text,
			metadata: {
				...(input.metadata ?? {}),
				originalText: input.text,
				fillersRemoved: norm.removed,
				codeSwitched: norm.wasCodeSwitched,
				primaryLanguage: norm.primary,
			},
		}
		return this.inner.consolidate(cleaned)
	}
}
