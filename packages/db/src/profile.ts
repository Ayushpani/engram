import type { ClusterableMemory, ProfileResult } from "@repo/core"
import { and, eq, isNull, sql } from "drizzle-orm"
import type { Db } from "./client.ts"
import { memories, profiles } from "./schema.ts"

export interface ProfileStore {
	/** Current (valid_until IS NULL) memories for a user, with embeddings, for clustering input. */
	fetchCurrentMemories(
		tenantId: string,
		userId: string,
	): Promise<ClusterableMemory[]>
	upsertProfile(
		tenantId: string,
		userId: string,
		result: ProfileResult,
	): Promise<void>
	getProfile(
		tenantId: string,
		userId: string,
	): Promise<{
		summary: string
		confidence: number
		sourceMemoryIds: string[]
		updatedAt: string
	} | null>
}

function toVec(raw: unknown): Float32Array {
	if (raw instanceof Float32Array) return raw
	if (Array.isArray(raw)) return Float32Array.from(raw as number[])
	if (typeof raw === "string") {
		return Float32Array.from(
			raw
				.replace(/^\[|\]$/g, "")
				.split(",")
				.map(Number),
		)
	}
	return new Float32Array(0)
}

export function createProfileStore(db: Db): ProfileStore {
	return {
		async fetchCurrentMemories(tenantId, userId) {
			const rows = await db
				.select({
					id: memories.id,
					text: memories.text,
					embedding: memories.embedding,
				})
				.from(memories)
				.where(
					and(
						eq(memories.tenantId, tenantId),
						eq(memories.userId, userId),
						isNull(memories.validUntil),
					),
				)
			return rows.map((r) => ({
				id: r.id,
				text: r.text,
				embedding: toVec(r.embedding),
			}))
		},

		async upsertProfile(tenantId, userId, result) {
			await db
				.insert(profiles)
				.values({
					id: `profile_${tenantId}_${userId}`,
					tenantId,
					userId,
					summary: result.summary,
					sourceMemoryIds: result.sourceMemoryIds,
					confidenceAlpha: result.belief.alpha,
					confidenceBeta: result.belief.beta,
					updatedAt: sql`now()`,
				})
				.onConflictDoUpdate({
					target: [profiles.tenantId, profiles.userId],
					set: {
						summary: result.summary,
						sourceMemoryIds: result.sourceMemoryIds,
						confidenceAlpha: result.belief.alpha,
						confidenceBeta: result.belief.beta,
						updatedAt: sql`now()`,
					},
				})
		},

		async getProfile(tenantId, userId) {
			const [row] = await db
				.select()
				.from(profiles)
				.where(
					and(eq(profiles.tenantId, tenantId), eq(profiles.userId, userId)),
				)
				.limit(1)
			if (!row) return null
			return {
				summary: row.summary,
				confidence:
					row.confidenceAlpha / (row.confidenceAlpha + row.confidenceBeta),
				sourceMemoryIds: (row.sourceMemoryIds as string[]) ?? [],
				updatedAt: row.updatedAt.toISOString(),
			}
		},
	}
}
