/**
 * Reranker contract. Every recall path can optionally rerank the top-K
 * hits through one of these implementations. Phase 5 ships the interface
 * plus two loaders — one HTTP (any cross-encoder API) and one heuristic
 * — so downstream code can bind against the shape today. The distilled
 * voice-tuned reranker slots in against the same interface in Phase 6
 * once training data is available.
 */

export interface RerankCandidate {
	id: string
	text: string
	score: number
}

export interface RerankResult {
	candidates: RerankCandidate[]
	rerankMs: number
	model: string
}

export interface Reranker {
	readonly model: string
	rerank(query: string, candidates: RerankCandidate[], topK?: number): Promise<RerankResult>
}

/**
 * Deterministic scorer for local dev / tests. Score = token-overlap
 * ratio between query and candidate, boosted by candidate.score from
 * the retriever. Not a real reranker — proves the pipeline binds and
 * ordering respects rerank output.
 */
export class HeuristicReranker implements Reranker {
	readonly model = "heuristic-overlap-v1"

	async rerank(
		query: string,
		candidates: RerankCandidate[],
		topK = candidates.length,
	): Promise<RerankResult> {
		const start = performance.now()
		const q = new Set(tokenize(query))
		const scored = candidates.map((c) => {
			const tokens = tokenize(c.text)
			let hits = 0
			for (const t of tokens) if (q.has(t)) hits += 1
			const overlap = tokens.length === 0 ? 0 : hits / tokens.length
			return { ...c, score: overlap * 0.8 + c.score * 0.2 }
		})
		scored.sort((a, b) => b.score - a.score)
		return {
			candidates: scored.slice(0, topK),
			rerankMs: Math.round(performance.now() - start),
			model: this.model,
		}
	}
}

export interface HttpRerankerOptions {
	url: string
	model: string
	apiKey?: string
	fetch?: typeof fetch
}

/**
 * Any cross-encoder HTTP reranker. Compatible with Cohere Rerank,
 * Voyage Rerank, BAAI-hosted endpoints. Providers differ on exact
 * schema — this hits the common shape:
 *   POST { model, query, documents } → { results: [{ index, score }] }
 */
export function createHttpReranker(opts: HttpRerankerOptions): Reranker {
	const fetchFn = opts.fetch ?? fetch
	return {
		model: opts.model,
		async rerank(query, candidates, topK = candidates.length) {
			const start = performance.now()
			const res = await fetchFn(opts.url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...(opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {}),
				},
				body: JSON.stringify({
					model: opts.model,
					query,
					documents: candidates.map((c) => c.text),
					top_n: topK,
				}),
			})
			if (!res.ok) throw new Error(`reranker: ${res.status} ${await res.text()}`)
			const json = (await res.json()) as {
				results: Array<{ index: number; relevance_score?: number; score?: number }>
			}
			const scored = json.results.map((r) => {
				const base = candidates[r.index]
				if (!base) throw new Error("reranker returned out-of-range index")
				return { ...base, score: r.relevance_score ?? r.score ?? 0 }
			})
			return {
				candidates: scored.slice(0, topK),
				rerankMs: Math.round(performance.now() - start),
				model: opts.model,
			}
		},
	}
}

function tokenize(s: string): string[] {
	return s
		.toLowerCase()
		.split(/[^a-z0-9ऀ-ॿঀ-৿଀-ൿ]+/)
		.filter((t) => t.length > 2)
}
