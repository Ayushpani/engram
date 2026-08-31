/**
 * Script-agnostic word tokenizer, backed by the runtime's ICU
 * (`Intl.Segmenter`) instead of a hand-written charset regex.
 *
 * Every prior tokenizer in this codebase whitelisted a fixed set of
 * Unicode ranges (Latin + a handful of Indic scripts) — anything outside
 * that list silently dropped out of scoring. `Intl.Segmenter` ships in the
 * JS runtime, is maintained by ICU, and handles every script the runtime
 * knows about with no maintained list at all.
 */

const segmenter = new Intl.Segmenter(undefined, { granularity: "word" })

/** Split text into word-like tokens, any script, no charset whitelist. */
export function tokenize(text: string): string[] {
	const out: string[] = []
	for (const { segment, isWordLike } of segmenter.segment(text)) {
		if (isWordLike) out.push(segment.toLowerCase())
	}
	return out
}

/**
 * Corpus-relative "stopword" weighting: instead of a fixed English word
 * list, down-weight tokens that appear in a large fraction of the corpus
 * (classic IDF). This self-adapts to any language — a language's own
 * function words naturally end up with high document frequency in that
 * language's own corpus, with no per-language list to maintain.
 *
 *   idf(t) = ln((N + 1) / (df(t) + 1)) + 1
 *
 * The +1 smoothing keeps idf well-defined and positive for a token that
 * hasn't been seen before (df=0) or appears in every document (df=N).
 */
export function idf(docFrequency: number, totalDocs: number): number {
	return Math.log((totalDocs + 1) / (docFrequency + 1)) + 1
}

/**
 * Content-word filter using corpus IDF instead of a fixed stopword set.
 * `docFreq` maps token -> number of documents (memories) it appears in;
 * `totalDocs` is the corpus size. Tokens above `idfFloor`'s complement
 * (i.e. below-average IDF = high document frequency = function-word-like)
 * are dropped.
 */
export function contentWords(
	text: string,
	docFreq: Map<string, number>,
	totalDocs: number,
	minIdf = 1.5,
): string[] {
	return tokenize(text).filter((tok) => {
		if (tok.length < 2) return false
		const df = docFreq.get(tok) ?? 0
		return idf(df, totalDocs) >= minIdf
	})
}
