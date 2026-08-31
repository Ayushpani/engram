import { and, eq, inArray, sql } from "drizzle-orm"
import type { Db } from "./client.ts"
import { entities, memories, relations } from "./schema.ts"

/**
 * Graph store methods on top of the Phase-1 entity/relation tables.
 * Split out so @repo/db/store.ts can stay focused on memory reads/writes
 * and this file can grow the multi-hop query surface Phase 5 needs.
 */

export interface EntityRow {
	id: string
	tenantId: string
	name: string
	kind: string
	metadata: Record<string, unknown>
}

export interface RelationRow {
	id: string
	tenantId: string
	fromEntityId: string
	toEntityId: string
	predicate: string
	memoryId: string | null
}

export interface UpsertEntity {
	name: string
	kind: string
	metadata?: Record<string, unknown>
}

export interface AddRelation {
	fromEntityId: string
	toEntityId: string
	predicate: string
	memoryId?: string | null
}

export function createGraphStore(db: Db) {
	function newId(prefix: string): string {
		const bytes = new Uint8Array(8)
		crypto.getRandomValues(bytes)
		return `${prefix}_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`
	}

	return {
		async upsertEntities(
			tenantId: string,
			rows: UpsertEntity[],
		): Promise<EntityRow[]> {
			if (rows.length === 0) return []
			const seen = new Map<string, UpsertEntity>()
			for (const r of rows) {
				const key = `${r.kind}:${r.name.toLowerCase()}`
				if (!seen.has(key)) seen.set(key, r)
			}
			const deduped = Array.from(seen.values())
			const existing = await db
				.select()
				.from(entities)
				.where(
					and(
						eq(entities.tenantId, tenantId),
						inArray(
							entities.name,
							deduped.map((r) => r.name),
						),
					),
				)
			const existingByKey = new Map<string, EntityRow>()
			for (const e of existing) {
				existingByKey.set(`${e.kind}:${e.name.toLowerCase()}`, {
					id: e.id,
					tenantId: e.tenantId,
					name: e.name,
					kind: e.kind,
					metadata: (e.metadata as Record<string, unknown>) ?? {},
				})
			}
			const toInsert = deduped
				.filter((r) => !existingByKey.has(`${r.kind}:${r.name.toLowerCase()}`))
				.map((r) => ({
					id: newId("ent"),
					tenantId,
					name: r.name,
					kind: r.kind,
					metadata: r.metadata ?? {},
				}))
			const inserted = toInsert.length
				? await db.insert(entities).values(toInsert).returning()
				: []
			const insertedRows: EntityRow[] = inserted.map((e) => ({
				id: e.id,
				tenantId: e.tenantId,
				name: e.name,
				kind: e.kind,
				metadata: (e.metadata as Record<string, unknown>) ?? {},
			}))
			return [...existingByKey.values(), ...insertedRows]
		},

		async addRelations(
			tenantId: string,
			rels: AddRelation[],
		): Promise<RelationRow[]> {
			if (rels.length === 0) return []
			const values = rels.map((r) => ({
				id: newId("rel"),
				tenantId,
				fromEntityId: r.fromEntityId,
				toEntityId: r.toEntityId,
				predicate: r.predicate,
				memoryId: r.memoryId ?? null,
			}))
			const inserted = await db.insert(relations).values(values).returning()
			return inserted.map((r) => ({
				id: r.id,
				tenantId: r.tenantId,
				fromEntityId: r.fromEntityId,
				toEntityId: r.toEntityId,
				predicate: r.predicate,
				memoryId: r.memoryId,
			}))
		},

		async findEntity(
			tenantId: string,
			name: string,
			kind?: string,
		): Promise<EntityRow | undefined> {
			const conds = [eq(entities.tenantId, tenantId), eq(entities.name, name)]
			if (kind) conds.push(eq(entities.kind, kind))
			const [row] = await db
				.select()
				.from(entities)
				.where(and(...conds))
				.limit(1)
			return row
				? {
						id: row.id,
						tenantId: row.tenantId,
						name: row.name,
						kind: row.kind,
						metadata: (row.metadata as Record<string, unknown>) ?? {},
					}
				: undefined
		},

		/**
		 * Multi-hop traversal from a starting entity. Returns memories the
		 * traversal touched through any relation within `maxHops` steps.
		 * A single SQL round trip via CTE — no N+1.
		 */
		async traverse(
			tenantId: string,
			startEntityId: string,
			maxHops = 2,
			memoryLimit = 20,
		): Promise<{ memoryIds: string[]; entityIds: string[]; hops: number }> {
			const hops = Math.max(1, Math.min(4, maxHops))
			const result = await db.execute(sql`
				WITH RECURSIVE walk (entity_id, depth) AS (
					SELECT ${startEntityId}::text, 0
					UNION
					SELECT r.to_entity_id, w.depth + 1
					FROM ${relations} r JOIN walk w ON r.from_entity_id = w.entity_id
					WHERE r.tenant_id = ${tenantId} AND w.depth < ${hops}
				)
				SELECT DISTINCT w.entity_id, r.memory_id
				FROM walk w
				LEFT JOIN ${relations} r
					ON (r.from_entity_id = w.entity_id OR r.to_entity_id = w.entity_id)
					AND r.tenant_id = ${tenantId}
				LIMIT ${memoryLimit}
			`)
			const memoryIds = new Set<string>()
			const entityIds = new Set<string>()
			for (const row of result as unknown as Array<{
				entity_id: string
				memory_id: string | null
			}>) {
				entityIds.add(row.entity_id)
				if (row.memory_id) memoryIds.add(row.memory_id)
			}
			return {
				memoryIds: Array.from(memoryIds),
				entityIds: Array.from(entityIds),
				hops,
			}
		},

		/**
		 * Fuzzy entity lookup for the recall graph channel: which entities
		 * does this query text plausibly refer to, tolerant of typos/
		 * transliteration variance (pg_trgm similarity, not exact match).
		 */
		async searchEntitiesByText(
			tenantId: string,
			queryText: string,
			limit = 3,
			minSimilarity = 0.2,
		): Promise<EntityRow[]> {
			const rows = await db.execute(sql`
				SELECT id, tenant_id, name, kind, metadata
				FROM entities
				WHERE tenant_id = ${tenantId}
					AND similarity(name, ${queryText}) > ${minSimilarity}
				ORDER BY similarity(name, ${queryText}) DESC
				LIMIT ${limit}
			`)
			return (
				rows as unknown as Array<{
					id: string
					tenant_id: string
					name: string
					kind: string
					metadata: Record<string, unknown> | null
				}>
			).map((r) => ({
				id: r.id,
				tenantId: r.tenant_id,
				name: r.name,
				kind: r.kind,
				metadata: r.metadata ?? {},
			}))
		},

		/**
		 * The recall graph channel, end to end: fuzzy-match entities
		 * mentioned in the query, then pull in memories reachable within
		 * `maxHops` of any of them. One extra query per matched entity, at
		 * most `entityLimit` of them — cheap at this scale.
		 */
		async graphChannel(
			tenantId: string,
			queryText: string,
			maxHops = 2,
			entityLimit = 3,
			memoryLimit = 20,
		): Promise<string[]> {
			const matched = await this.searchEntitiesByText(
				tenantId,
				queryText,
				entityLimit,
			)
			const memoryIds = new Set<string>()
			for (const entity of matched) {
				const { memoryIds: hop } = await this.traverse(
					tenantId,
					entity.id,
					maxHops,
					memoryLimit,
				)
				for (const id of hop) memoryIds.add(id)
			}
			return Array.from(memoryIds)
		},

		async fetchMemoriesByIds(tenantId: string, ids: string[]) {
			if (ids.length === 0) return []
			return db
				.select()
				.from(memories)
				.where(and(eq(memories.tenantId, tenantId), inArray(memories.id, ids)))
		},
	}
}

export type GraphStore = ReturnType<typeof createGraphStore>
