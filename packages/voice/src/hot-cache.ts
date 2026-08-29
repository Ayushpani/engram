/**
 * Tier-1 recall cache. Keyed by (sessionId, normalized query).
 * In-process LRU with TTL — sub-millisecond hits.
 * Warmed on prior recalls and by speculative pre-fetch.
 */

export interface HotCacheEntry<T> {
	value: T
	expiresAt: number
}

export interface HotCacheOptions {
	max?: number
	ttlMs?: number
	now?: () => number
}

export class HotCache<T> {
	private readonly max: number
	private readonly ttlMs: number
	private readonly now: () => number
	private readonly store: Map<string, HotCacheEntry<T>>

	constructor(opts: HotCacheOptions = {}) {
		this.max = opts.max ?? 2048
		this.ttlMs = opts.ttlMs ?? 60_000
		this.now = opts.now ?? Date.now
		this.store = new Map()
	}

	get(key: string): T | undefined {
		const entry = this.store.get(key)
		if (!entry) return undefined
		if (entry.expiresAt <= this.now()) {
			this.store.delete(key)
			return undefined
		}
		// LRU bump: re-insert so it moves to newest.
		this.store.delete(key)
		this.store.set(key, entry)
		return entry.value
	}

	set(key: string, value: T): void {
		if (this.store.has(key)) this.store.delete(key)
		this.store.set(key, { value, expiresAt: this.now() + this.ttlMs })
		if (this.store.size > this.max) {
			const oldest = this.store.keys().next().value
			if (oldest !== undefined) this.store.delete(oldest)
		}
	}

	invalidateSession(sessionId: string): void {
		const prefix = sessionId + ":"
		for (const key of this.store.keys()) {
			if (key.startsWith(prefix)) this.store.delete(key)
		}
	}

	size(): number {
		return this.store.size
	}

	static keyFor(sessionId: string | null | undefined, query: string): string {
		const norm = query.trim().toLowerCase().replace(/\s+/g, " ")
		return `${sessionId ?? "_"}:${norm}`
	}
}
