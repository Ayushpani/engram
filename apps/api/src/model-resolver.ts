import { schema, type Db } from "@repo/db"
import {
	createHttpReranker,
	HeuristicReranker,
	type Reranker,
} from "@repo/models"
import { and, desc, eq, isNull, or } from "drizzle-orm"

/**
 * Resolves the reranker (and, once distilled models ship, embedder) each
 * tenant is currently bound to. Falls back to the platform default row
 * (tenant_id NULL) then to the built-in HeuristicReranker when no row
 * exists at all. Result cached in-process per tenant with a short TTL so
 * the hot recall path never round-trips to Postgres for this.
 */

export interface ResolvedRerankers {
	tenantId: string
	reranker: Reranker
	source: "tenant" | "platform" | "builtin"
}

interface RerankerConfig {
	url?: string
	model?: string
	apiKey?: string
}

interface CacheEntry {
	value: ResolvedRerankers
	expiresAt: number
}

const TTL_MS = 30_000

export function createModelResolver(db: Db) {
	const cache = new Map<string, CacheEntry>()
	const builtIn = new HeuristicReranker()

	async function resolve(tenantId: string): Promise<ResolvedRerankers> {
		const now = Date.now()
		const cached = cache.get(tenantId)
		if (cached && cached.expiresAt > now) return cached.value

		const rows = await db
			.select()
			.from(schema.modelRegistry)
			.where(
				and(
					eq(schema.modelRegistry.role, "reranker"),
					or(
						eq(schema.modelRegistry.tenantId, tenantId),
						isNull(schema.modelRegistry.tenantId),
					),
				),
			)
			.orderBy(desc(schema.modelRegistry.tenantId))

		const active =
			rows.find((r) => r.activatedAt !== null && r.tenantId === tenantId) ??
			rows.find((r) => r.activatedAt !== null && r.tenantId === null)

		let reranker: Reranker = builtIn
		let source: ResolvedRerankers["source"] = "builtin"
		if (active) {
			source = active.tenantId === tenantId ? "tenant" : "platform"
			const cfg = (active.config as RerankerConfig) ?? {}
			if (active.provider === "http" && cfg.url && cfg.model) {
				reranker = createHttpReranker({
					url: cfg.url,
					model: cfg.model,
					apiKey: cfg.apiKey,
				})
			} else if (active.provider === "builtin") {
				reranker = builtIn
			}
		}

		const value: ResolvedRerankers = { tenantId, reranker, source }
		cache.set(tenantId, { value, expiresAt: now + TTL_MS })
		return value
	}

	function invalidate(tenantId: string) {
		cache.delete(tenantId)
	}

	return { resolve, invalidate }
}

export type ModelResolver = ReturnType<typeof createModelResolver>
