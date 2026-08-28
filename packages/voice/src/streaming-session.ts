import type { MemoryClient } from "@repo/core"
import { isSubstantive, scrubAsrText } from "./asr-scrubber.ts"
import { HotCache } from "./hot-cache.ts"

/**
 * A live voice-agent session. Accepts token-level partial transcripts,
 * batches them until turn commit, then consolidates + saves — never
 * blocks the caller. Recall hits the HotCache first (Tier 1), falls
 * through to the underlying MemoryClient (Tier 2+).
 */

export interface StreamingSessionOptions {
	tenantId?: string
	userId?: string
	sessionId: string
	source?: "text" | "voice"
	client: MemoryClient
	cache?: HotCache<CachedRecall>
	onError?: (err: unknown) => void
}

export interface CachedRecall {
	hits: Array<{
		memory: { id: string; text: string; kind: string }
		score: number
	}>
	cachedAt: number
}

export interface StreamingRecallResult {
	hits: CachedRecall["hits"]
	tier: "hot" | "session" | "cross"
	latencyMs: number
}

export class StreamingSession {
	private buffer = ""
	private lastCommittedAt = 0
	private readonly cache: HotCache<CachedRecall>
	private inflightSaves = 0

	constructor(private readonly opts: StreamingSessionOptions) {
		this.cache = opts.cache ?? new HotCache<CachedRecall>()
	}

	/** Append a partial transcript. Non-blocking. Does not persist. */
	appendPartial(text: string): void {
		if (!text) return
		this.buffer = mergePartial(this.buffer, text)
	}

	/**
	 * Commit the current buffered utterance as a turn. Scrubs ASR noise,
	 * fires the save fire-and-forget so the caller isn't blocked, and
	 * invalidates cached recalls for the session.
	 */
	commitTurn(overrideText?: string): { text: string; saved: boolean } {
		const raw = (overrideText ?? this.buffer).trim()
		this.buffer = ""
		this.lastCommittedAt = Date.now()
		if (!raw) return { text: "", saved: false }
		const scrubbed = scrubAsrText(raw)
		if (!isSubstantive(scrubbed.text))
			return { text: scrubbed.text, saved: false }

		this.cache.invalidateSession(this.opts.sessionId)
		this.inflightSaves++
		void this.opts.client
			.save({
				text: scrubbed.text,
				userId: this.opts.userId,
				sessionId: this.opts.sessionId,
				source: this.opts.source ?? "voice",
				metadata: { fillersRemoved: scrubbed.removed },
			})
			.catch((err) => this.opts.onError?.(err))
			.finally(() => {
				this.inflightSaves--
			})
		return { text: scrubbed.text, saved: true }
	}

	/**
	 * Recall with Tier-1 hot cache. Cache miss falls through to the
	 * underlying client and warms the cache for next time.
	 */
	async recall(
		query: string,
		opts?: { topK?: number },
	): Promise<StreamingRecallResult> {
		const start = performance.now()
		const key = HotCache.keyFor(this.opts.sessionId, query)
		const cached = this.cache.get(key)
		if (cached) {
			return {
				hits: cached.hits,
				tier: "hot",
				latencyMs: Math.round(performance.now() - start),
			}
		}
		const res = await this.opts.client.recall({
			query,
			userId: this.opts.userId,
			sessionId: this.opts.sessionId,
			topK: opts?.topK ?? 5,
			includeCrossSession: true,
		})
		this.cache.set(key, { hits: res.hits, cachedAt: Date.now() })
		return {
			hits: res.hits,
			tier: "session",
			latencyMs: Math.round(performance.now() - start),
		}
	}

	/**
	 * Speculative prefetch — predict what the agent will look up on the
	 * next turn and warm the cache before it asks. Fire-and-forget.
	 * Heuristic in Phase 3; distilled predictor in Phase 5.
	 */
	prefetch(candidateQueries: string[]): void {
		for (const q of candidateQueries) {
			const key = HotCache.keyFor(this.opts.sessionId, q)
			if (this.cache.get(key)) continue
			void this.opts.client
				.recall({
					query: q,
					sessionId: this.opts.sessionId,
					userId: this.opts.userId,
					topK: 5,
					includeCrossSession: true,
				})
				.then((res) =>
					this.cache.set(key, { hits: res.hits, cachedAt: Date.now() }),
				)
				.catch((err) => this.opts.onError?.(err))
		}
	}

	stats() {
		return {
			bufferLen: this.buffer.length,
			lastCommittedAt: this.lastCommittedAt,
			inflightSaves: this.inflightSaves,
			cacheSize: this.cache.size(),
		}
	}
}

/**
 * Deepgram-style partial transcripts arrive as growing prefixes. Naïve
 * concatenation double-counts. This picks the longer of the two when
 * one is a prefix of the other, otherwise concatenates.
 */
function mergePartial(prev: string, next: string): string {
	if (!prev) return next
	if (!next) return prev
	if (next.startsWith(prev)) return next
	if (prev.endsWith(next)) return prev
	return `${prev} ${next}`
}
