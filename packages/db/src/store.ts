import type {
	Memory,
	MemoryRow,
	MemoryStore,
	SearchParams,
	SearchRow,
} from "@repo/core"
import { and, eq, sql } from "drizzle-orm"
import type { Db } from "./client.ts"
import { memories } from "./schema.ts"

export function createSupabaseStore(db: Db): MemoryStore {
	return {
		async insertMemories(rows: MemoryRow[]): Promise<Memory[]> {
			if (rows.length === 0) return []
			const values = rows.map((r) => ({
				id: r.id,
				tenantId: r.tenantId,
				userId: r.userId,
				sessionId: r.sessionId,
				text: r.text,
				kind: r.kind,
				source: r.source,
				embedding: Array.from(r.embedding),
				metadata: r.metadata,
			}))
			const inserted = await db.insert(memories).values(values).returning()
			return inserted.map((m) => ({
				id: m.id,
				tenantId: m.tenantId,
				userId: m.userId,
				sessionId: m.sessionId,
				text: m.text,
				kind: m.kind,
				source: m.source,
				createdAt: m.createdAt.toISOString(),
				updatedAt: m.updatedAt.toISOString(),
				metadata: (m.metadata as Record<string, unknown>) ?? {},
			}))
		},

		async deleteMemory(tenantId, id) {
			await db
				.delete(memories)
				.where(and(eq(memories.tenantId, tenantId), eq(memories.id, id)))
		},

		async search(params: SearchParams): Promise<SearchRow[]> {
			const vec = `[${Array.from(params.queryVec).join(",")}]`
			const scopeFilter = params.includeCrossSession
				? sql`TRUE`
				: sql`${memories.sessionId} = ${params.sessionId}`
			const userFilter = params.userId
				? sql`${memories.userId} = ${params.userId}`
				: sql`TRUE`

			const rows = await db
				.select({
					id: memories.id,
					tenantId: memories.tenantId,
					userId: memories.userId,
					sessionId: memories.sessionId,
					text: memories.text,
					kind: memories.kind,
					source: memories.source,
					metadata: memories.metadata,
					createdAt: memories.createdAt,
					updatedAt: memories.updatedAt,
					distance: sql<number>`${memories.embedding} <=> ${vec}::vector`.as(
						"distance",
					),
				})
				.from(memories)
				.where(
					and(eq(memories.tenantId, params.tenantId), scopeFilter, userFilter),
				)
				.orderBy(sql`distance ASC`)
				.limit(params.topK)

			return rows.map((r) => ({
				memory: {
					id: r.id,
					tenantId: r.tenantId,
					userId: r.userId,
					sessionId: r.sessionId,
					text: r.text,
					kind: r.kind,
					source: r.source,
					createdAt: r.createdAt.toISOString(),
					updatedAt: r.updatedAt.toISOString(),
					metadata: (r.metadata as Record<string, unknown>) ?? {},
				},
				distance: Number(r.distance),
				sessionMatch: r.sessionId === params.sessionId,
			}))
		},
	}
}
