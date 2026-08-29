import type { MemoryRow, MemoryStore, SearchParams, SearchRow } from "./core.ts"
import type { Memory } from "./types.ts"

/**
 * In-process MemoryStore for the try-it-now sandbox and unit tests.
 * Cosine similarity computed in JS. Not durable — data is lost when
 * the process exits. Use @repo/db/createSupabaseStore for anything
 * beyond a demo.
 */

interface Row {
	id: string
	tenantId: string
	userId: string | null
	sessionId: string | null
	text: string
	kind: Memory["kind"]
	source: Memory["source"]
	embedding: Float32Array
	metadata: Record<string, unknown>
	createdAt: string
	updatedAt: string
}

export class InMemoryStore implements MemoryStore {
	private readonly rows = new Map<string, Row>()

	async insertMemories(input: MemoryRow[]): Promise<Memory[]> {
		const now = new Date().toISOString()
		const out: Memory[] = []
		for (const r of input) {
			const row: Row = {
				id: r.id,
				tenantId: r.tenantId,
				userId: r.userId,
				sessionId: r.sessionId,
				text: r.text,
				kind: r.kind,
				source: r.source,
				embedding: r.embedding,
				metadata: r.metadata,
				createdAt: now,
				updatedAt: now,
			}
			this.rows.set(r.id, row)
			out.push(this.toMemory(row))
		}
		return out
	}

	async deleteMemory(tenantId: string, id: string): Promise<void> {
		const row = this.rows.get(id)
		if (row && row.tenantId === tenantId) this.rows.delete(id)
	}

	async search(params: SearchParams): Promise<SearchRow[]> {
		const q = params.queryVec
		const scored: Array<{ row: Row; distance: number }> = []
		for (const row of this.rows.values()) {
			if (row.tenantId !== params.tenantId) continue
			if (params.userId && row.userId !== params.userId) continue
			if (!params.includeCrossSession && row.sessionId !== params.sessionId) {
				continue
			}
			const distance = cosineDistance(q, row.embedding)
			scored.push({ row, distance })
		}
		scored.sort((a, b) => a.distance - b.distance)
		return scored.slice(0, params.topK).map(({ row, distance }) => ({
			memory: this.toMemory(row),
			distance,
			sessionMatch: row.sessionId === params.sessionId,
		}))
	}

	size(): number {
		return this.rows.size
	}

	clear(): void {
		this.rows.clear()
	}

	private toMemory(row: Row): Memory {
		return {
			id: row.id,
			tenantId: row.tenantId,
			userId: row.userId,
			sessionId: row.sessionId,
			text: row.text,
			kind: row.kind,
			source: row.source,
			metadata: row.metadata,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
		}
	}
}

function cosineDistance(a: Float32Array, b: Float32Array): number {
	const len = Math.min(a.length, b.length)
	let dot = 0
	let na = 0
	let nb = 0
	for (let i = 0; i < len; i++) {
		const av = a[i]!
		const bv = b[i]!
		dot += av * bv
		na += av * av
		nb += bv * bv
	}
	const denom = Math.sqrt(na) * Math.sqrt(nb)
	if (denom === 0) return 1
	return 1 - dot / denom
}
