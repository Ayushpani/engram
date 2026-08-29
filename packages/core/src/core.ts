import type { Embedder } from "./embedder.ts"
import type { Consolidator } from "./consolidator.ts"
import type {
	Memory,
	MemoryEvent,
	MemoryId,
	RecallQuery,
	RecallResult,
	SaveInput,
	SessionId,
} from "./types.ts"

/**
 * Storage contract every backend adapter implements.
 * Phase 1 ships one: Supabase (Postgres + pgvector).
 * A backend swap (SQLite, Turso, DuckDB) never touches the core.
 */
export interface MemoryStore {
	insertMemories(rows: MemoryRow[]): Promise<Memory[]>
	deleteMemory(tenantId: string, id: MemoryId): Promise<void>
	search(params: SearchParams): Promise<SearchRow[]>
}

export interface MemoryRow {
	id: MemoryId
	tenantId: string
	userId: string | null
	sessionId: SessionId | null
	text: string
	kind: Memory["kind"]
	source: Memory["source"]
	embedding: Float32Array
	metadata: Record<string, unknown>
}

export interface SearchParams {
	tenantId: string
	userId: string | null
	sessionId: SessionId | null
	queryVec: Float32Array
	topK: number
	includeCrossSession: boolean
}

export interface SearchRow {
	memory: Memory
	distance: number
	sessionMatch: boolean
}

export interface MemoryCore {
	save(input: SaveInput): Promise<Memory[]>
	recall(query: RecallQuery): Promise<RecallResult>
	forget(tenantId: string, id: MemoryId): Promise<void>
	subscribe(sessionId: SessionId): AsyncIterable<MemoryEvent>
}

export interface CoreDeps {
	store: MemoryStore
	embedder: Embedder
	consolidator: Consolidator
	newId?: () => string
	now?: () => Date
}

export function createCore(deps: CoreDeps): MemoryCore {
	const { store, embedder, consolidator } = deps
	const newId = deps.newId ?? (() => cryptoId())
	const now = deps.now ?? (() => new Date())

	const bus = new SessionBus()

	async function save(input: SaveInput): Promise<Memory[]> {
		const candidates = await consolidator.consolidate(input)
		if (candidates.length === 0) return []
		const vecs = await embedder.embedBatch(candidates.map((c) => c.text))
		const rows: MemoryRow[] = candidates.map((c, i) => ({
			id: newId(),
			tenantId: input.tenantId,
			userId: input.userId ?? null,
			sessionId: input.sessionId ?? null,
			text: c.text,
			kind: c.kind,
			source: input.source ?? "text",
			embedding: vecs[i]!,
			metadata: input.metadata ?? {},
		}))
		const memories = await store.insertMemories(rows)
		const t = now().toISOString()
		for (const m of memories) {
			bus.publish(m.sessionId, {
				type: "memory.saved",
				memory: { ...m, createdAt: t, updatedAt: t },
			})
		}
		return memories
	}

	async function recall(query: RecallQuery): Promise<RecallResult> {
		const t0 = performance.now()
		const queryVec = await embedder.embed(query.query)
		const t1 = performance.now()
		const rows = await store.search({
			tenantId: query.tenantId,
			userId: query.userId ?? null,
			sessionId: query.sessionId ?? null,
			queryVec,
			topK: query.topK ?? 8,
			includeCrossSession: query.includeCrossSession ?? true,
		})
		const t2 = performance.now()

		const hits = rows.map((r) => ({
			memory: r.memory,
			score: 1 - r.distance,
			tier: r.sessionMatch ? ("session" as const) : ("cross" as const),
		}))
		return {
			hits,
			latencyMs: {
				total: Math.round(t2 - t0),
				embed: Math.round(t1 - t0),
				search: Math.round(t2 - t1),
				rerank: 0,
			},
		}
	}

	async function forget(tenantId: string, id: MemoryId): Promise<void> {
		await store.deleteMemory(tenantId, id)
		bus.publish(null, { type: "memory.forgotten", id })
	}

	function subscribe(sessionId: SessionId): AsyncIterable<MemoryEvent> {
		return bus.subscribe(sessionId)
	}

	return { save, recall, forget, subscribe }
}

class SessionBus {
	private listeners = new Map<string | null, Set<(e: MemoryEvent) => void>>()
	publish(sessionId: string | null, event: MemoryEvent) {
		for (const key of [sessionId, null]) {
			const set = this.listeners.get(key)
			if (set) for (const l of set) l(event)
		}
	}
	subscribe(sessionId: string | null): AsyncIterable<MemoryEvent> {
		const queue: MemoryEvent[] = []
		let resolveNext: ((v: IteratorResult<MemoryEvent>) => void) | null = null
		const listener = (e: MemoryEvent) => {
			if (resolveNext) {
				const r = resolveNext
				resolveNext = null
				r({ value: e, done: false })
			} else {
				queue.push(e)
			}
		}
		let set = this.listeners.get(sessionId)
		if (!set) {
			set = new Set()
			this.listeners.set(sessionId, set)
		}
		set.add(listener)

		return {
			[Symbol.asyncIterator]: () => ({
				next: () => {
					if (queue.length > 0) {
						return Promise.resolve({
							value: queue.shift()!,
							done: false as const,
						})
					}
					return new Promise<IteratorResult<MemoryEvent>>((res) => {
						resolveNext = res
					})
				},
				return: () => {
					set!.delete(listener)
					return Promise.resolve({ value: undefined, done: true })
				},
			}),
		}
	}
}

function cryptoId(): string {
	const bytes = new Uint8Array(16)
	crypto.getRandomValues(bytes)
	return (
		"mem_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
	)
}
